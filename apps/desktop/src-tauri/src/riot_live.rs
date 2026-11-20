use crate::launcher_settings::atomic_write;
use crate::local_store::crypto::LocalSecretBox;
use crate::local_store::{LocalAccount, LocalAccountStorage, LocalStore};
use crate::riot::session_format::detect_details;
use chrono::Utc;
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const SETTINGS_FILENAME: &str = "live-status-settings.json";
const SECRETS_FILENAME: &str = "live-status-secrets.enc";
const PUUID_CACHE_FILENAME: &str = "live-status-puuids.json";
const SECRETS_AAD: &str = "live-status-secrets:v1";
const INVALID_PUUID_ERR_PREFIX: &str = "[RIOT_INVALID_PUUID] ";
const STATUS_CACHE_TTL: Duration = Duration::from_secs(45);
const SHORT_WINDOW: Duration = Duration::from_secs(1);
const SHORT_LIMIT: usize = 18;
const LONG_WINDOW: Duration = Duration::from_secs(120);
const LONG_LIMIT: usize = 90;
const MAX_CACHE_ENTRIES: usize = 512;

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveStatusMode {
    #[default]
    Off,
    Direct,
    Worker,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct LiveStatusConfig {
    pub mode: LiveStatusMode,
    pub worker_url: Option<String>,
    pub prelaunch_guard: bool,
}

impl Default for LiveStatusConfig {
    fn default() -> Self {
        Self {
            mode: LiveStatusMode::Off,
            worker_url: None,
            prelaunch_guard: true,
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct LiveStatusSecrets {
    riot_api_key: String,
    worker_token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatusSettingsSummary {
    pub mode: LiveStatusMode,
    pub worker_url: String,
    pub prelaunch_guard: bool,
    pub has_riot_api_key: bool,
    pub has_worker_token: bool,
    pub env_riot_key_present: bool,
    pub built_in_worker_configured: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLiveStatusSettingsInput {
    pub mode: LiveStatusMode,
    #[serde(default)]
    pub worker_url: String,
    #[serde(default = "default_true")]
    pub prelaunch_guard: bool,
    #[serde(default)]
    pub riot_api_key: Option<String>,
    #[serde(default)]
    pub clear_riot_api_key: bool,
    #[serde(default)]
    pub worker_token: Option<String>,
    #[serde(default)]
    pub clear_worker_token: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatusResult {
    pub configured: bool,
    pub mode: LiveStatusMode,
    pub in_game: bool,
    pub cached: bool,
    pub puuid: Option<String>,
    pub platform: String,
    pub checked_at: String,
    pub game_id: Option<u64>,
    pub game_mode: Option<String>,
    pub game_type: Option<String>,
    pub queue_id: Option<u32>,
    pub game_length_seconds: Option<u64>,
    pub champion_id: Option<u32>,
}

#[derive(Default)]
struct LiveRuntimeState {
    puuid_cache: HashMap<String, String>,
    status_cache: HashMap<String, (Instant, LiveStatusResult)>,
    retry_until_by_platform: HashMap<String, Instant>,
    recent_requests_by_platform: HashMap<String, VecDeque<Instant>>,
}

static LIVE_STATE: LazyLock<Mutex<LiveRuntimeState>> =
    LazyLock::new(|| Mutex::new(LiveRuntimeState::default()));
static SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());
static PUUID_CACHE_IO_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedApiPuuidEntry {
    puuid: String,
    updated_at: String,
}

fn storage_paths(dir: &Path) -> (PathBuf, PathBuf) {
    (dir.join(SETTINGS_FILENAME), dir.join(SECRETS_FILENAME))
}

fn puuid_cache_path(dir: &Path) -> PathBuf {
    dir.join(PUUID_CACHE_FILENAME)
}

/// RSO/LCU `sub` identifiers are 36-char RFC 4122 UUIDs; Riot Developer `spectator-v5` rejects them with HTTP 400.
fn is_uuid_36(raw: &str) -> bool {
    let bytes = raw.trim().as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(idx, ch)| match idx {
        8 | 13 | 18 | 23 => *ch == b'-',
        _ => ch.is_ascii_hexdigit(),
    })
}

fn sanitize_api_puuid(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|p| !p.is_empty() && p.len() <= 150 && !is_uuid_36(p))
        .map(str::to_string)
}

fn api_puuid_entry_key(platform: &str, account_id: &str) -> String {
    format!("{}:{account_id}", platform.trim().to_ascii_lowercase())
}

fn read_cached_api_puuid(dir: &Path, platform: &str, account_id: &str) -> Option<String> {
    let _guard = PUUID_CACHE_IO_LOCK.lock().ok()?;
    let bytes = fs::read(puuid_cache_path(dir)).ok()?;
    let map: BTreeMap<String, CachedApiPuuidEntry> = serde_json::from_slice(&bytes).ok()?;
    let key = api_puuid_entry_key(platform, account_id);
    map.get(&key)
        .and_then(|entry| sanitize_api_puuid(Some(&entry.puuid)))
}

fn save_cached_api_puuid(dir: &Path, platform: &str, account_id: &str, puuid: &str) {
    let Some(clean_puuid) = sanitize_api_puuid(Some(puuid)) else {
        return;
    };
    let Ok(_guard) = PUUID_CACHE_IO_LOCK.lock() else {
        return;
    };
    let path = puuid_cache_path(dir);
    let mut map: BTreeMap<String, CachedApiPuuidEntry> = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    map.insert(
        api_puuid_entry_key(platform, account_id),
        CachedApiPuuidEntry {
            puuid: clean_puuid,
            updated_at: Utc::now().to_rfc3339(),
        },
    );
    if let Ok(json) = serde_json::to_vec_pretty(&map) {
        let _ = atomic_write(&path, &json);
    }
}

fn clear_cached_api_puuid(dir: &Path, platform: &str, account_id: &str) {
    let Ok(_guard) = PUUID_CACHE_IO_LOCK.lock() else {
        return;
    };
    let path = puuid_cache_path(dir);
    let Ok(bytes) = fs::read(&path) else {
        return;
    };
    let Ok(mut map) = serde_json::from_slice::<BTreeMap<String, CachedApiPuuidEntry>>(&bytes) else {
        return;
    };
    if map.remove(&api_puuid_entry_key(platform, account_id)).is_some() {
        if let Ok(json) = serde_json::to_vec_pretty(&map) {
            let _ = atomic_write(&path, &json);
        }
    }
}

fn clear_mem_puuid_cache(platform: &str, riot_id: Option<&(String, String)>, stale_puuid: Option<&str>) {
    let Ok(mut state) = LIVE_STATE.lock() else {
        return;
    };
    if let Some((game_name, tag_line)) = riot_id {
        let mem_key = format!(
            "{platform}\0{}\0{}",
            game_name.to_ascii_lowercase(),
            tag_line.to_ascii_lowercase()
        );
        state.puuid_cache.remove(&mem_key);
    }
    if let Some(stale) = stale_puuid {
        state.puuid_cache.retain(|_, v| v != stale);
    }
}

/// Validates and canonicalizes a Cloudflare Worker base URL without keeping a trailing `/api/riot/live-status`.
pub fn normalize_worker_url(raw: &str) -> Result<Option<String>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| "Worker URL must be a valid HTTPS URL.".to_string())?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Worker URL cannot embed credentials.".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Worker URL should be a base origin without query parameters.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Worker URL must include a hostname.".to_string())?;
    let is_loopback = host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1";
    match parsed.scheme() {
        "https" => {}
        "http" if is_loopback => {}
        _ => return Err("Worker URL must use https://.".into()),
    }

    let mut clean = parsed.as_str().trim_end_matches('/').to_string();
    for suffix in ["/api/riot/live-status", "/api"] {
        if clean.ends_with(suffix) {
            clean.truncate(clean.len() - suffix.len());
        }
    }
    Ok(Some(clean))
}

/// Maps UI region codes to Riot `(accountCluster, platform)` hosts.
/// Cross-game `account-v1` only exists on `americas`, `europe`, and `asia` (including OCE/SEA).
pub fn resolve_routing(region: &str) -> Result<(&'static str, &'static str), String> {
    Ok(match region.trim().to_ascii_uppercase().as_str() {
        "NA" | "NA1" => ("americas", "na1"),
        "BR" | "BR1" => ("americas", "br1"),
        "LAN" | "LA1" => ("americas", "la1"),
        "LAS" | "LA2" => ("americas", "la2"),
        "EUW" | "EUW1" => ("europe", "euw1"),
        "EUNE" | "EUN1" => ("europe", "eun1"),
        "TR" | "TR1" => ("europe", "tr1"),
        "RU" => ("europe", "ru"),
        "ME" | "ME1" => ("europe", "me1"),
        "KR" => ("asia", "kr"),
        "JP" | "JP1" => ("asia", "jp1"),
        "OCE" | "OC1" => ("asia", "oc1"),
        "SEA" | "SG" | "SG2" | "PH" | "PH2" | "TH" | "TH2" => ("asia", "sg2"),
        "TW" | "TW2" => ("asia", "tw2"),
        "VN" | "VN2" => ("asia", "vn2"),
        _ => return Err("Unsupported Riot platform region".into()),
    })
}

fn split_riot_id(raw: &str) -> Option<(String, String)> {
    let (name, tag) = raw.rsplit_once('#')?;
    let name = name.trim();
    let tag = tag.trim();
    if name.is_empty()
        || tag.is_empty()
        || name.chars().count() > 32
        || tag.chars().count() > 16
        || name.chars().chain(tag.chars()).any(char::is_control)
    {
        return None;
    }
    Some((name.to_string(), tag.to_string()))
}

fn builtin_worker_url_from(runtime_val: Option<&str>, compile_val: Option<&str>) -> Option<String> {
    let raw = runtime_val
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .or_else(|| compile_val.map(str::trim).filter(|v| !v.is_empty()))?;
    normalize_worker_url(raw).ok().flatten()
}

fn builtin_worker_token_from(
    runtime_val: Option<&str>,
    legacy_runtime_val: Option<&str>,
    compile_val: Option<&str>,
) -> Option<String> {
    runtime_val
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .or_else(|| legacy_runtime_val.map(str::trim).filter(|v| !v.is_empty()))
        .or_else(|| compile_val.map(str::trim).filter(|v| !v.is_empty()))
        .map(str::to_string)
}

fn resolve_builtin_worker() -> (Option<String>, Option<String>) {
    let rt_url = std::env::var("LAAP_LIVE_WORKER_URL").ok();
    let rt_tok = std::env::var("LAAP_LIVE_WORKER_TOKEN").ok();
    let rt_legacy_tok = std::env::var("LAAP_RIOT_PROXY_TOKEN").ok();
    let url = builtin_worker_url_from(rt_url.as_deref(), option_env!("LAAP_LIVE_WORKER_URL"));
    let tok = builtin_worker_token_from(
        rt_tok.as_deref(),
        rt_legacy_tok.as_deref(),
        option_env!("LAAP_LIVE_WORKER_TOKEN"),
    );
    (url, tok)
}

fn resolve_effective_worker_token(
    target_url: &str,
    saved_token: &str,
    builtin_url: Option<&str>,
    builtin_token: Option<&str>,
) -> Option<String> {
    let trimmed_saved = saved_token.trim();
    if !trimmed_saved.is_empty() {
        return Some(trimmed_saved.to_string());
    }
    if builtin_url == Some(target_url) {
        return builtin_token
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
    }
    None
}

fn read_config_from_with_builtin(
    dir: &Path,
    builtin_url: Option<String>,
    has_builtin_token: bool,
) -> Result<LiveStatusConfig, String> {
    let (settings_path, _) = storage_paths(dir);
    match fs::read(&settings_path) {
        Ok(bytes) => {
            let mut config: LiveStatusConfig = serde_json::from_slice(&bytes)
                .map_err(|_| "Live status settings file is corrupted.".to_string())?;
            if config.mode == LiveStatusMode::Worker && config.worker_url.is_none() {
                config.worker_url = builtin_url;
            }
            Ok(config)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if let (Some(url), true) = (builtin_url, has_builtin_token) {
                Ok(LiveStatusConfig {
                    mode: LiveStatusMode::Worker,
                    worker_url: Some(url),
                    prelaunch_guard: true,
                })
            } else {
                Ok(LiveStatusConfig::default())
            }
        }
        Err(error) => Err(format!("Unable to read live status settings: {error}")),
    }
}

fn read_config_from(dir: &Path) -> Result<LiveStatusConfig, String> {
    let (builtin_url, builtin_tok) = resolve_builtin_worker();
    read_config_from_with_builtin(dir, builtin_url, builtin_tok.is_some())
}

fn read_secrets_from(dir: &Path) -> Result<LiveStatusSecrets, String> {
    let (_, secrets_path) = storage_paths(dir);
    let envelope = match fs::read_to_string(&secrets_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LiveStatusSecrets::default());
        }
        Err(error) => return Err(format!("Unable to read live status credentials: {error}")),
    };
    if envelope.trim().is_empty() {
        return Ok(LiveStatusSecrets::default());
    }
    let secret_box = LocalSecretBox::load_or_create()?;
    let (plaintext, _) = secret_box.decrypt(&envelope, SECRETS_AAD)?;
    serde_json::from_str(&plaintext)
        .map_err(|_| "Stored live status credentials are corrupted.".to_string())
}

fn write_secrets_to(dir: &Path, secrets: &LiveStatusSecrets) -> Result<(), String> {
    let (_, secrets_path) = storage_paths(dir);
    if secrets.riot_api_key.is_empty() && secrets.worker_token.is_empty() {
        if secrets_path.exists() {
            fs::remove_file(&secrets_path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let secret_box = LocalSecretBox::load_or_create()?;
    let serialized = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
    let envelope = secret_box.encrypt(&serialized, SECRETS_AAD)?;
    atomic_write(&secrets_path, envelope.as_bytes())
}

fn build_settings_summary(config: &LiveStatusConfig, secrets: &LiveStatusSecrets) -> LiveStatusSettingsSummary {
    let (builtin_url, builtin_tok) = resolve_builtin_worker();
    let effective_url = config.worker_url.clone().or_else(|| builtin_url.clone());
    let built_in_worker_configured = builtin_url.is_some()
        && builtin_tok.is_some()
        && effective_url.as_deref() == builtin_url.as_deref();
    LiveStatusSettingsSummary {
        mode: config.mode,
        worker_url: effective_url.unwrap_or_default(),
        prelaunch_guard: config.prelaunch_guard,
        has_riot_api_key: !secrets.riot_api_key.is_empty(),
        has_worker_token: !secrets.worker_token.is_empty(),
        env_riot_key_present: std::env::var("RIOT_API_KEY")
            .ok()
            .is_some_and(|v| !v.trim().is_empty()),
        built_in_worker_configured,
    }
}

fn save_settings_to_dir(
    dir: &Path,
    input: SaveLiveStatusSettingsInput,
) -> Result<LiveStatusSettingsSummary, String> {
    let _guard = SETTINGS_IO_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let (builtin_url, _) = resolve_builtin_worker();
    let worker_url = normalize_worker_url(&input.worker_url)?.or_else(|| {
        if input.mode == LiveStatusMode::Worker {
            builtin_url.clone()
        } else {
            None
        }
    });
    let mut secrets = read_secrets_from(dir)?;

    if input.clear_riot_api_key {
        secrets.riot_api_key.clear();
    } else if let Some(raw_key) = input.riot_api_key {
        let trimmed = raw_key.trim();
        if !trimmed.is_empty() {
            if trimmed.len() < 16 || trimmed.len() > 512 || trimmed.chars().any(char::is_whitespace) {
                return Err("Riot API key must be 16–512 characters with no spaces.".into());
            }
            secrets.riot_api_key = trimmed.to_string();
        }
    }

    if input.clear_worker_token {
        secrets.worker_token.clear();
    } else if let Some(raw_token) = input.worker_token {
        let trimmed = raw_token.trim();
        if !trimmed.is_empty() {
            if trimmed.len() > 512 || trimmed.chars().any(char::is_control) {
                return Err("Worker token format is invalid.".into());
            }
            secrets.worker_token = trimmed.to_string();
        }
    }

    let env_key_ok = std::env::var("RIOT_API_KEY")
        .ok()
        .is_some_and(|v| !v.trim().is_empty());
    if input.mode == LiveStatusMode::Direct && secrets.riot_api_key.is_empty() && !env_key_ok {
        return Err("Enter your Riot Personal API key (or set RIOT_API_KEY) before enabling Direct mode.".into());
    }
    if input.mode == LiveStatusMode::Worker && worker_url.is_none() {
        return Err("Enter your Cloudflare Worker URL before enabling Worker mode.".into());
    }

    let config = LiveStatusConfig {
        mode: input.mode,
        worker_url,
        prelaunch_guard: input.prelaunch_guard,
    };

    write_secrets_to(dir, &secrets)?;
    let (settings_path, _) = storage_paths(dir);
    atomic_write(
        &settings_path,
        &serde_json::to_vec(&config).map_err(|e| e.to_string())?,
    )?;

    if let Ok(mut state) = LIVE_STATE.lock() {
        state.status_cache.clear();
    }

    Ok(build_settings_summary(&config, &secrets))
}

fn parse_retry_after(headers: &HeaderMap) -> u64 {
    headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|s| s.clamp(1, 300))
        .unwrap_or(60)
}

fn check_and_record_rate_limit(platform: &str, enforce_window: bool) -> Result<(), String> {
    let mut state = LIVE_STATE
        .lock()
        .map_err(|_| "Live status rate limiter unavailable".to_string())?;
    let now = Instant::now();
    if let Some(&until) = state.retry_until_by_platform.get(platform) {
        if until > now {
            let secs = until.duration_since(now).as_secs().max(1);
            return Err(format!(
                "[RATE_LIMITED] Riot API cooldown active ({platform}); retry in {secs}s"
            ));
        }
        state.retry_until_by_platform.remove(platform);
    }

    if enforce_window {
        let log = state
            .recent_requests_by_platform
            .entry(platform.to_string())
            .or_default();
        while log
            .front()
            .is_some_and(|&ts| now.duration_since(ts) > LONG_WINDOW)
        {
            log.pop_front();
        }
        let short_count = log
            .iter()
            .filter(|&&ts| now.duration_since(ts) <= SHORT_WINDOW)
            .count();
        if short_count >= SHORT_LIMIT {
            return Err("[RATE_LIMITED] Riot 1-second burst guard reached; retry shortly".into());
        }
        if log.len() >= LONG_LIMIT {
            let oldest = *log.front().expect("checked non-empty");
            let wait = LONG_WINDOW
                .saturating_sub(now.duration_since(oldest))
                .as_secs()
                .max(1);
            return Err(format!(
                "[RATE_LIMITED] Riot 2-minute rate budget protected; retry in {wait}s"
            ));
        }
        log.push_back(now);
    }
    Ok(())
}

fn set_cooldown(platform: &str, seconds: u64) {
    if let Ok(mut state) = LIVE_STATE.lock() {
        state.retry_until_by_platform.insert(
            platform.to_string(),
            Instant::now() + Duration::from_secs(seconds.clamp(1, 300)),
        );
    }
}

fn get_cached_status(key: &str) -> Option<LiveStatusResult> {
    let mut state = LIVE_STATE.lock().ok()?;
    let now = Instant::now();
    let (created_at, entry) = state.status_cache.get(key)?;
    if now.duration_since(*created_at) < STATUS_CACHE_TTL {
        let mut cloned = entry.clone();
        cloned.cached = true;
        return Some(cloned);
    }
    state.status_cache.remove(key);
    None
}

fn put_cached_status(key: String, status: &LiveStatusResult) {
    if let Ok(mut state) = LIVE_STATE.lock() {
        if state.status_cache.len() >= MAX_CACHE_ENTRIES {
            if let Some(oldest_key) = state.status_cache.keys().next().cloned() {
                state.status_cache.remove(&oldest_key);
            }
        }
        state
            .status_cache
            .insert(key, (Instant::now(), status.clone()));
    }
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Unable to initialize HTTP client: {error}"))
}

fn segment_url(base: &str, segments: &[&str]) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(base).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Invalid Riot API URL".to_string())?
        .extend(segments);
    Ok(url)
}

async fn query_direct(
    client: &reqwest::Client,
    account_base: &str,
    spectator_base: &str,
    platform: &str,
    api_key: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
) -> Result<LiveStatusResult, String> {
    let mem_key = riot_id.as_ref().map(|(game_name, tag_line)| {
        format!(
            "{platform}\0{}\0{}",
            game_name.to_ascii_lowercase(),
            tag_line.to_ascii_lowercase()
        )
    });
    let sanitized_known = sanitize_api_puuid(known_puuid.as_deref());
    let puuid = match sanitized_known {
        Some(existing) => existing,
        None => {
            let (game_name, tag_line) = riot_id.ok_or_else(|| {
                "Account needs a Riot ID with #TAG (e.g. Name#EUW) or an imported Riot session to resolve PUUID."
                    .to_string()
            })?;
            let mem_key = mem_key.clone().expect("riot_id present");
            let from_mem = LIVE_STATE
                .lock()
                .ok()
                .and_then(|state| state.puuid_cache.get(&mem_key).cloned());
            match sanitize_api_puuid(from_mem.as_deref()) {
                Some(cached) => cached,
                None => {
                    check_and_record_rate_limit(platform, true)?;
                    let url = segment_url(
                        account_base,
                        &[
                            "riot",
                            "account",
                            "v1",
                            "accounts",
                            "by-riot-id",
                            &game_name,
                            &tag_line,
                        ],
                    )?;
                    let response = client
                        .get(url)
                        .header("X-Riot-Token", api_key)
                        .send()
                        .await
                        .map_err(|_| "Unable to contact Riot Account API".to_string())?;
                    let status = response.status().as_u16();
                    if status == 429 {
                        let secs = parse_retry_after(response.headers());
                        set_cooldown(platform, secs);
                        return Err(format!(
                            "[RATE_LIMITED] Riot API rate limit reached; retry in {secs}s"
                        ));
                    }
                    if status == 401 || status == 403 {
                        return Err("[AUTH_REQUIRED] Riot rejected your Personal API key.".into());
                    }
                    if status == 404 {
                        return Err("Riot ID was not found on Riot Account API.".into());
                    }
                    if !response.status().is_success() {
                        return Err(format!("Riot Account API returned HTTP {status}"));
                    }
                    let json: serde_json::Value = response
                        .json()
                        .await
                        .map_err(|_| "Invalid Riot Account API JSON".to_string())?;
                    let resolved = json["puuid"]
                        .as_str()
                        .filter(|s| !s.is_empty() && s.len() <= 150)
                        .ok_or_else(|| "Riot Account response missing puuid".to_string())?
                        .to_string();
                    if let Ok(mut state) = LIVE_STATE.lock() {
                        if state.puuid_cache.len() >= MAX_CACHE_ENTRIES {
                            if let Some(first) = state.puuid_cache.keys().next().cloned() {
                                state.puuid_cache.remove(&first);
                            }
                        }
                        state.puuid_cache.insert(mem_key, resolved.clone());
                    }
                    resolved
                }
            }
        }
    };

    check_and_record_rate_limit(platform, true)?;
    let url = segment_url(
        spectator_base,
        &["lol", "spectator", "v5", "active-games", "by-summoner", &puuid],
    )?;
    let response = client
        .get(url)
        .header("X-Riot-Token", api_key)
        .send()
        .await
        .map_err(|_| "Unable to contact Riot Spectator API".to_string())?;
    let status = response.status().as_u16();
    let checked_at = Utc::now().to_rfc3339();
    if status == 404 {
        return Ok(LiveStatusResult {
            configured: true,
            mode: LiveStatusMode::Direct,
            in_game: false,
            cached: false,
            puuid: Some(puuid),
            platform: platform.to_string(),
            checked_at,
            game_id: None,
            game_mode: None,
            game_type: None,
            queue_id: None,
            game_length_seconds: None,
            champion_id: None,
        });
    }
    if status == 429 {
        let secs = parse_retry_after(response.headers());
        set_cooldown(platform, secs);
        return Err(format!(
            "[RATE_LIMITED] Riot Spectator API rate limit reached; retry in {secs}s"
        ));
    }
    if status == 401 || status == 403 {
        return Err("[AUTH_REQUIRED] Riot rejected your Personal API key.".into());
    }
    if status == 400 {
        if let Ok(mut state) = LIVE_STATE.lock() {
            if let Some(key) = mem_key.as_deref() {
                state.puuid_cache.remove(key);
            }
            state.puuid_cache.retain(|_, v| v != &puuid);
        }
        return Err(format!(
            "{INVALID_PUUID_ERR_PREFIX}Riot Spectator API returned HTTP 400"
        ));
    }
    if !response.status().is_success() {
        return Err(format!("Riot Spectator API returned HTTP {status}"));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Invalid Riot Spectator API response".to_string())?;
    let champion_id = body["participants"].as_array().and_then(|list| {
        list.iter()
            .find(|p| p["puuid"].as_str() == Some(puuid.as_str()))
            .and_then(|p| p["championId"].as_u64())
            .and_then(|n| u32::try_from(n).ok())
    });

    Ok(LiveStatusResult {
        configured: true,
        mode: LiveStatusMode::Direct,
        in_game: true,
        cached: false,
        puuid: Some(puuid),
        platform: platform.to_string(),
        checked_at,
        game_id: body["gameId"].as_u64(),
        game_mode: body["gameMode"].as_str().map(str::to_string),
        game_type: body["gameType"].as_str().map(str::to_string),
        queue_id: body["gameQueueConfigId"]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok()),
        game_length_seconds: body["gameLength"].as_u64(),
        champion_id,
    })
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    bytes_to_hex(&Sha256::digest(bytes))
}

fn hmac_sha256_hex(secret: &[u8], message: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    const BLOCK_SIZE: usize = 64;
    let mut key_block = [0u8; BLOCK_SIZE];
    if secret.len() > BLOCK_SIZE {
        let hashed = Sha256::digest(secret);
        key_block[..hashed.len()].copy_from_slice(&hashed);
    } else {
        key_block[..secret.len()].copy_from_slice(secret);
    }

    let mut ipad = [0x36u8; BLOCK_SIZE];
    let mut opad = [0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);
    bytes_to_hex(&outer.finalize())
}

fn random_nonce_hex() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| format!("OS random source unavailable: {error}"))?;
    Ok(bytes_to_hex(&bytes))
}

async fn query_worker(
    client: &reqwest::Client,
    worker_base_url: &str,
    worker_token: Option<&str>,
    region: &str,
    platform: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
    bypass_cache: bool,
) -> Result<LiveStatusResult, String> {
    check_and_record_rate_limit(platform, false)?;
    let known_puuid = sanitize_api_puuid(known_puuid.as_deref());
    let (game_name, tag_line) = match riot_id {
        Some((name, tag)) => (Some(name), Some(tag)),
        None => (None, None),
    };
    if known_puuid.is_none() && (game_name.is_none() || tag_line.is_none()) {
        return Err(
            "Account needs a Riot ID with #TAG (e.g. Name#EUW) or an imported Riot session to check status."
                .into(),
        );
    }

    let payload = serde_json::json!({
        "region": region,
        "puuid": known_puuid,
        "gameName": game_name,
        "tagLine": tag_line,
        "bypassCache": bypass_cache,
    });
    let body_text = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let path = "/api/riot/live-status";
    let url = format!("{worker_base_url}{path}");
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json");
    if let Some(secret) = worker_token.map(str::trim).filter(|t| !t.is_empty()) {
        let timestamp = Utc::now().timestamp().to_string();
        let nonce = random_nonce_hex()?;
        let body_hash = sha256_hex(body_text.as_bytes());
        let canonical = format!("{timestamp}\n{nonce}\nPOST\n{path}\n{body_hash}");
        let signature = hmac_sha256_hex(secret.as_bytes(), canonical.as_bytes());
        request = request
            .header("X-Laap-Timestamp", timestamp)
            .header("X-Laap-Nonce", nonce)
            .header("X-Laap-Signature", signature);
    }
    request = request.body(body_text);

    let response = request
        .send()
        .await
        .map_err(|_| "Unable to contact Cloudflare Worker proxy.".to_string())?;
    let status = response.status().as_u16();
    if status == 429 {
        let secs = parse_retry_after(response.headers());
        set_cooldown(platform, secs);
        return Err(format!(
            "[RATE_LIMITED] Worker Riot rate limit reached; retry in {secs}s"
        ));
    }
    if status == 401 || status == 403 {
        return Err("[AUTH_REQUIRED] Cloudflare Worker rejected the proxy token.".into());
    }
    if !response.status().is_success() {
        let body = response.json::<serde_json::Value>().await.ok();
        let code = body
            .as_ref()
            .and_then(|v| v["error"]["code"].as_str())
            .map(str::to_string);
        let detail = body
            .as_ref()
            .and_then(|v| v["error"]["message"].as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("Worker returned HTTP {status}"));
        if matches!(code.as_deref(), Some("INVALID_PUUID" | "RIOT_INVALID_PUUID"))
            || detail.contains("HTTP 400")
        {
            return Err(format!("{INVALID_PUUID_ERR_PREFIX}{detail}"));
        }
        return Err(detail);
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkerPayload {
        in_game: bool,
        puuid: String,
        platform: String,
        cached: bool,
        checked_at: String,
        game_id: Option<u64>,
        game_mode: Option<String>,
        game_type: Option<String>,
        queue_id: Option<u32>,
        game_length_seconds: Option<u64>,
        champion_id: Option<u32>,
    }

    let payload: WorkerPayload = response
        .json()
        .await
        .map_err(|_| "Worker returned invalid live-status payload.".to_string())?;
    Ok(LiveStatusResult {
        configured: true,
        mode: LiveStatusMode::Worker,
        in_game: payload.in_game,
        cached: payload.cached,
        puuid: Some(payload.puuid),
        platform: payload.platform,
        checked_at: payload.checked_at,
        game_id: payload.game_id,
        game_mode: payload.game_mode,
        game_type: payload.game_type,
        queue_id: payload.queue_id,
        game_length_seconds: payload.game_length_seconds,
        champion_id: payload.champion_id,
    })
}

#[tauri::command]
pub async fn get_live_status_settings() -> Result<LiveStatusSettingsSummary, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = LocalAccountStorage::default_storage_dir();
        let config = read_config_from(&dir)?;
        let secrets = read_secrets_from(&dir)?;
        Ok(build_settings_summary(&config, &secrets))
    })
    .await
    .map_err(|e| format!("Native operation failed: {e}"))?
}

#[tauri::command]
pub async fn save_live_status_settings(
    input: SaveLiveStatusSettingsInput,
) -> Result<LiveStatusSettingsSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = LocalAccountStorage::default_storage_dir();
        save_settings_to_dir(&dir, input)
    })
    .await
    .map_err(|e| format!("Native operation failed: {e}"))?
}

fn resolve_account_live_identity(
    dir: &Path,
    account_id: Option<&str>,
    account: Option<&LocalAccount>,
    platform: &str,
    name: &str,
) -> Result<(Option<String>, Option<(String, String)>), String> {
    let cached_api_puuid = account_id.and_then(|id| read_cached_api_puuid(dir, platform, id));
    let legacy_non_uuid_puuid = account.and_then(|acc| sanitize_api_puuid(acc.puuid.as_deref()));
    let known_puuid = cached_api_puuid.or(legacy_non_uuid_puuid);

    let explicit_riot_id = account
        .and_then(|acc| acc.riot_id.as_deref())
        .and_then(split_riot_id);
    let session_riot_id = account
        .filter(|acc| !acc.session_blob.trim().is_empty())
        .and_then(|acc| detect_details(&acc.session_blob).name)
        .and_then(|detected| split_riot_id(&detected));
    let riot_id = split_riot_id(name).or(explicit_riot_id).or(session_riot_id);

    if known_puuid.is_none() && riot_id.is_none() {
        let has_local_uuid_only = account
            .and_then(|acc| acc.puuid.as_deref())
            .is_some_and(is_uuid_36);
        return Err(if has_local_uuid_only {
            "Account only has a local Riot Client UUID; add #TAG to its name (e.g. Name#EUW) or refresh its Riot session so LAAP can resolve its Spectator PUUID."
                .into()
        } else {
            "Add #TAG to the account name (e.g. Name#EUW) or import a signed-in Riot session so LAAP knows its PUUID."
                .into()
        });
    }

    Ok((known_puuid, riot_id))
}

async fn dispatch_live_query(
    client: &reqwest::Client,
    config: &LiveStatusConfig,
    secrets: &LiveStatusSecrets,
    region: &str,
    platform: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
    bypass: bool,
) -> Result<LiveStatusResult, String> {
    match config.mode {
        LiveStatusMode::Off => unreachable!(),
        LiveStatusMode::Direct => {
            let api_key = if !secrets.riot_api_key.is_empty() {
                secrets.riot_api_key.clone()
            } else {
                std::env::var("RIOT_API_KEY")
                    .ok()
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .ok_or_else(|| {
                        "Configure your Riot Personal API key in Settings -> Advanced first."
                            .to_string()
                    })?
            };
            let (account_cluster, _) = resolve_routing(region)?;
            query_direct(
                client,
                &format!("https://{account_cluster}.api.riotgames.com"),
                &format!("https://{platform}.api.riotgames.com"),
                platform,
                &api_key,
                known_puuid,
                riot_id,
            )
            .await
        }
        LiveStatusMode::Worker => {
            let (builtin_url, builtin_tok) = resolve_builtin_worker();
            let worker_url = config
                .worker_url
                .as_deref()
                .or(builtin_url.as_deref())
                .ok_or_else(|| {
                    "Configure your Cloudflare Worker URL in Settings -> Advanced first.".to_string()
                })?;
            let token = resolve_effective_worker_token(
                worker_url,
                &secrets.worker_token,
                builtin_url.as_deref(),
                builtin_tok.as_deref(),
            );
            query_worker(
                client,
                worker_url,
                token.as_deref(),
                region,
                platform,
                known_puuid,
                riot_id,
                bypass,
            )
            .await
        }
    }
}

async fn check_account_live_status_with_account(
    dir: &Path,
    account_id: Option<&str>,
    account: Option<&LocalAccount>,
    region: String,
    name: String,
    bypass_cache: Option<bool>,
) -> Result<LiveStatusResult, String> {
    let config = read_config_from(dir)?;
    let (_, platform) = resolve_routing(&region)?;
    let bypass = bypass_cache.unwrap_or(false);

    if config.mode == LiveStatusMode::Off {
        return Ok(LiveStatusResult {
            configured: false,
            mode: LiveStatusMode::Off,
            in_game: false,
            cached: false,
            puuid: None,
            platform: platform.to_string(),
            checked_at: Utc::now().to_rfc3339(),
            game_id: None,
            game_mode: None,
            game_type: None,
            queue_id: None,
            game_length_seconds: None,
            champion_id: None,
        });
    }

    let (known_puuid, riot_id) =
        resolve_account_live_identity(dir, account_id, account, platform, &name)?;
    let cache_key = match known_puuid.as_deref() {
        Some(puuid) if !puuid.is_empty() => format!("{:?}:{platform}:p:{puuid}", config.mode),
        _ => match riot_id {
            Some((ref n, ref t)) => format!(
                "{:?}:{platform}:n:{}:{}",
                config.mode,
                n.to_ascii_lowercase(),
                t.to_ascii_lowercase()
            ),
            None => unreachable!("validated non-empty riot_id when known_puuid is None"),
        },
    };

    if !bypass {
        if let Some(cached) = get_cached_status(&cache_key) {
            return Ok(cached);
        }
    }

    let secrets = read_secrets_from(dir)?;
    let client = build_http_client()?;

    let first_attempt = dispatch_live_query(
        &client,
        &config,
        &secrets,
        &region,
        platform,
        known_puuid.clone(),
        riot_id.clone(),
        bypass,
    )
    .await;

    let result = match first_attempt {
        Ok(res) => res,
        Err(err) => {
            if let Some(clean_err) = err.strip_prefix(INVALID_PUUID_ERR_PREFIX) {
                if let Some(id) = account_id {
                    clear_cached_api_puuid(dir, platform, id);
                }
                clear_mem_puuid_cache(platform, riot_id.as_ref(), known_puuid.as_deref());
                if known_puuid.is_some() && riot_id.is_some() {
                    dispatch_live_query(
                        &client,
                        &config,
                        &secrets,
                        &region,
                        platform,
                        None,
                        riot_id,
                        true,
                    )
                    .await
                    .map_err(|retry_err| {
                        retry_err
                            .strip_prefix(INVALID_PUUID_ERR_PREFIX)
                            .unwrap_or(&retry_err)
                            .to_string()
                    })?
                } else {
                    return Err(clean_err.to_string());
                }
            } else {
                return Err(err);
            }
        }
    };

    if let (Some(id), Some(resolved_puuid)) = (account_id, result.puuid.as_deref()) {
        save_cached_api_puuid(dir, platform, id, resolved_puuid);
    }

    put_cached_status(cache_key, &result);
    if let Some(resolved_puuid) = result.puuid.as_deref() {
        if !resolved_puuid.trim().is_empty() && !is_uuid_36(resolved_puuid) {
            put_cached_status(
                format!("{:?}:{platform}:p:{resolved_puuid}", config.mode),
                &result,
            );
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn check_account_live_status(
    account_id: Option<String>,
    region: String,
    name: String,
    bypass_cache: Option<bool>,
) -> Result<LiveStatusResult, String> {
    let dir = LocalAccountStorage::default_storage_dir();
    let account = if let Some(ref id) = account_id {
        let store = LocalStore::new()?;
        store
            .load_accounts()?
            .into_iter()
            .find(|acc| &acc.id == id)
    } else {
        None
    };

    if account_id.is_some() && account.is_none() {
        return Err("Select an active profile to check its live status.".into());
    }
    check_account_live_status_with_account(
        &dir,
        account_id.as_deref(),
        account.as_ref(),
        region,
        name,
        bypass_cache,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        http::{HeaderMap as AxumHeaders, StatusCode},
        routing::{get, post},
        Json, Router,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn resolves_sea_and_oce_to_asia_cluster() {
        assert_eq!(resolve_routing("OCE").unwrap(), ("asia", "oc1"));
        assert_eq!(resolve_routing("SG2").unwrap(), ("asia", "sg2"));
        assert_eq!(resolve_routing("PH").unwrap(), ("asia", "sg2"));
        assert_eq!(resolve_routing("ME").unwrap(), ("europe", "me1"));
        assert!(resolve_routing("MARS").is_err());
    }

    #[test]
    fn normalizes_and_validates_worker_urls() {
        assert_eq!(normalize_worker_url("").unwrap(), None);
        assert_eq!(
            normalize_worker_url("https://laap-api.example.workers.dev/api/riot/live-status/")
                .unwrap(),
            Some("https://laap-api.example.workers.dev".into())
        );
        assert!(normalize_worker_url("http://public.example.com").is_err());
        assert!(normalize_worker_url("https://user:pass@laap-api.example.workers.dev").is_err());
        assert!(normalize_worker_url("http://127.0.0.1:4170").is_ok());
    }

    #[tokio::test]
    async fn direct_mode_queries_account_then_spectator_and_respects_429() {
        let hits = Arc::new(AtomicUsize::new(0));
        let hits_clone = hits.clone();
        let router = Router::new()
            .route(
                "/riot/account/v1/accounts/by-riot-id/{name}/{tag}",
                get(|| async { Json(serde_json::json!({"puuid": "mock-puuid-123"})) }),
            )
            .route(
                "/lol/spectator/v5/active-games/by-summoner/mock-puuid-123",
                get(move || {
                    let count = hits_clone.fetch_add(1, Ordering::SeqCst);
                    async move {
                        if count == 0 {
                            (
                                StatusCode::OK,
                                HeaderMap::new(),
                                Json(serde_json::json!({
                                    "gameId": 4242,
                                    "gameMode": "CLASSIC",
                                    "gameType": "MATCHED_GAME",
                                    "gameQueueConfigId": 420,
                                    "gameLength": 310,
                                    "participants": [{"puuid": "mock-puuid-123", "championId": 157}]
                                })),
                            )
                        } else {
                            let mut headers = HeaderMap::new();
                            headers.insert("retry-after", "15".parse().unwrap());
                            (
                                StatusCode::TOO_MANY_REQUESTS,
                                headers,
                                Json(serde_json::json!({})),
                            )
                        }
                    }
                }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        let client = build_http_client().unwrap();
        let res = query_direct(
            &client,
            &base,
            &base,
            "euw1_test_direct",
            "fixture-key-123456",
            None,
            Some(("Kingof3O".into(), "EUW".into())),
        )
        .await
        .unwrap();

        assert!(res.in_game);
        assert_eq!(res.champion_id, Some(157));
        assert_eq!(res.game_mode.as_deref(), Some("CLASSIC"));
        assert_eq!(res.puuid.as_deref(), Some("mock-puuid-123"));

        let err = query_direct(
            &client,
            &base,
            &base,
            "euw1_test_direct",
            "fixture-key-123456",
            Some("mock-puuid-123".into()),
            None,
        )
        .await
        .unwrap_err();
        assert!(err.contains("RATE_LIMITED"));
        assert!(err.contains("15s"));

        // Cached cooldown blocks additional upstream hit without re-requesting
        let err2 = query_direct(
            &client,
            &base,
            &base,
            "euw1_test_direct",
            "fixture-key-123456",
            Some("mock-puuid-123".into()),
            None,
        )
        .await
        .unwrap_err();
        assert!(err2.contains("cooldown"));
        assert_eq!(hits.load(Ordering::SeqCst), 2);
        task.abort();
    }

    #[test]
    fn hmac_sha256_matches_rfc_4231_vector() {
        // RFC 4231 Test Case 2
        assert_eq!(
            hmac_sha256_hex(b"Jefe", b"what do ya want for nothing?"),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn builtin_worker_defaults_activate_when_unset_and_respect_explicit_opt_out() {
        let dir = std::env::temp_dir().join(format!(
            "laap-live-default-test-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&dir).unwrap();

        let off = read_config_from_with_builtin(&dir, None, false).unwrap();
        assert_eq!(off.mode, LiveStatusMode::Off);

        let defaulted = read_config_from_with_builtin(
            &dir,
            Some("https://worker.example.workers.dev".into()),
            true,
        )
        .unwrap();
        assert_eq!(defaulted.mode, LiveStatusMode::Worker);
        assert_eq!(
            defaulted.worker_url.as_deref(),
            Some("https://worker.example.workers.dev")
        );

        let (settings_path, _) = storage_paths(&dir);
        fs::write(
            &settings_path,
            serde_json::to_vec(&LiveStatusConfig {
                mode: LiveStatusMode::Off,
                worker_url: None,
                prelaunch_guard: false,
            })
            .unwrap(),
        )
        .unwrap();

        let opted_out = read_config_from_with_builtin(
            &dir,
            Some("https://worker.example.workers.dev".into()),
            true,
        )
        .unwrap();
        assert_eq!(opted_out.mode, LiveStatusMode::Off);

        // Built-in token must never be attached when pointing to a different URL
        assert_eq!(
            resolve_effective_worker_token(
                "https://custom.example.workers.dev",
                "",
                Some("https://worker.example.workers.dev"),
                Some("built-in-secret"),
            ),
            None
        );
        assert_eq!(
            resolve_effective_worker_token(
                "https://worker.example.workers.dev",
                "",
                Some("https://worker.example.workers.dev"),
                Some("built-in-secret"),
            )
            .as_deref(),
            Some("built-in-secret")
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn worker_mode_sends_signed_hmac_headers_and_parses_idle_response() {
        let router = Router::new().route(
            "/api/riot/live-status",
            post(|headers: AxumHeaders, body: axum::body::Bytes| async move {
                if headers.get("x-laap-riot-token").is_some() {
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(serde_json::json!({"error": {"message": "Static token must not be sent"}})),
                    );
                }
                let ts = headers.get("x-laap-timestamp").and_then(|v| v.to_str().ok()).unwrap_or("");
                let nonce = headers.get("x-laap-nonce").and_then(|v| v.to_str().ok()).unwrap_or("");
                let sig = headers.get("x-laap-signature").and_then(|v| v.to_str().ok()).unwrap_or("");
                let body_hash = sha256_hex(&body);
                let canonical = format!("{ts}\n{nonce}\nPOST\n/api/riot/live-status\n{body_hash}");
                let expected = hmac_sha256_hex(b"worker-secret-token", canonical.as_bytes());
                if nonce.len() < 12 || sig != expected {
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(serde_json::json!({"error": {"message": "Invalid HMAC signature"}})),
                    );
                }
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "inGame": false,
                        "puuid": "worker-puuid-999",
                        "platform": "euw1",
                        "cached": false,
                        "checkedAt": "2026-11-14T00:00:00Z"
                    })),
                )
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        let client = build_http_client().unwrap();
        let result = query_worker(
            &client,
            &base,
            Some("worker-secret-token"),
            "EUW",
            "euw1_test_worker",
            None,
            Some(("Kingof3O".into(), "EUW".into())),
            false,
        )
        .await
        .unwrap();

        assert!(!result.in_game);
        assert_eq!(result.mode, LiveStatusMode::Worker);
        assert_eq!(result.puuid.as_deref(), Some("worker-puuid-999"));
        task.abort();
    }

    #[tokio::test]
    async fn ignores_rso_uuid_uses_session_id_token_and_recovers_on_400() {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

        assert!(is_uuid_36("df284845-718a-a75e-22a8-b1e3b2c6086e"));
        assert!(!is_uuid_36("mock-puuid-123"));
        assert!(!is_uuid_36(&"a".repeat(78)));

        let requests = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
        let req_log = requests.clone();
        let router = Router::new().route(
            "/api/riot/live-status",
            post(move |Json(payload): Json<serde_json::Value>| {
                let req_log = req_log.clone();
                async move {
                    req_log.lock().unwrap().push(payload.clone());
                    let sent_puuid = payload["puuid"].as_str();
                    if sent_puuid.is_some_and(is_uuid_36) {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(serde_json::json!({
                                "error": { "code": "INVALID_PUUID", "message": "UUID must never be sent" }
                            })),
                        );
                    }
                    if sent_puuid == Some("stale-puuid-old") {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(serde_json::json!({
                                "error": { "code": "RIOT_INVALID_PUUID", "message": "Riot API returned HTTP 400" }
                            })),
                        );
                    }
                    assert_eq!(payload["gameName"].as_str(), Some("RealPlayer"));
                    assert_eq!(payload["tagLine"].as_str(), Some("EUNE"));
                    let returned_puuid = if req_log.lock().unwrap().len() >= 2 {
                        "encrypted-puuid-eune-2"
                    } else {
                        "encrypted-puuid-eune-1"
                    };
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({
                            "inGame": false,
                            "puuid": returned_puuid,
                            "platform": "eun1",
                            "cached": false,
                            "checkedAt": "2026-11-14T00:00:00Z"
                        })),
                    )
                }
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        let dir = std::env::temp_dir().join(format!(
            "laap_live_uuid_test_{}_{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        save_settings_to_dir(
            &dir,
            SaveLiveStatusSettingsInput {
                mode: LiveStatusMode::Worker,
                worker_url: base,
                prelaunch_guard: false,
                riot_api_key: None,
                clear_riot_api_key: false,
                worker_token: Some("test-worker-secret".into()),
                clear_worker_token: false,
            },
        )
        .unwrap();

        let jwt_payload = URL_SAFE_NO_PAD.encode(
            br#"{"sub":"df284845-718a-a75e-22a8-b1e3b2c6086e","acct":{"game_name":"RealPlayer","tag_line":"EUNE"}}"#,
        );
        let account = LocalAccount {
            id: "acc-eune-1".into(),
            name: "Main - EUNE".into(),
            region: "EUNE".into(),
            rank: None,
            riot_id: None,
            notes: String::new(),
            favorite: false,
            puuid: Some("df284845-718a-a75e-22a8-b1e3b2c6086e".into()),
            session_updated_at: None,
            customization: Default::default(),
            session_blob: format!(
                "psl:\n  authorization:\n    riot-client:\n      id_token: hdr.{jwt_payload}.sig\n"
            ),
            created_at: "2026-11-14T00:00:00Z".into(),
            last_used_at: None,
            games: vec![crate::local_store::Game::League],
            valorant_rank: None,
            last_game: None,
        };

        let first = check_account_live_status_with_account(
            &dir,
            Some(&account.id),
            Some(&account),
            account.region.clone(),
            account.name.clone(),
            Some(true),
        )
        .await
        .unwrap();

        assert!(!first.in_game);
        assert_eq!(first.puuid.as_deref(), Some("encrypted-puuid-eune-1"));
        assert_eq!(
            read_cached_api_puuid(&dir, "eun1", &account.id).as_deref(),
            Some("encrypted-puuid-eune-1")
        );
        assert_eq!(
            account.puuid.as_deref(),
            Some("df284845-718a-a75e-22a8-b1e3b2c6086e")
        );

        save_cached_api_puuid(&dir, "eun1", &account.id, "stale-puuid-old");
        let recovered = check_account_live_status_with_account(
            &dir,
            Some(&account.id),
            Some(&account),
            account.region.clone(),
            account.name.clone(),
            Some(true),
        )
        .await
        .unwrap();

        assert_eq!(recovered.puuid.as_deref(), Some("encrypted-puuid-eune-2"));
        assert_eq!(
            read_cached_api_puuid(&dir, "eun1", &account.id).as_deref(),
            Some("encrypted-puuid-eune-2")
        );
        let logged = requests.lock().unwrap();
        assert_eq!(logged.len(), 3);
        assert!(logged[0]["puuid"].is_null());
        assert_eq!(logged[1]["puuid"].as_str(), Some("stale-puuid-old"));
        assert!(logged[2]["puuid"].is_null());

        task.abort();
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn query_direct_ignores_uuid_and_flags_spectator_400() {
        let router = Router::new()
            .route(
                "/riot/account/v1/accounts/by-riot-id/{name}/{tag}",
                get(|| async { Json(serde_json::json!({"puuid": "direct-bad-puuid"})) }),
            )
            .route(
                "/lol/spectator/v5/active-games/by-summoner/{puuid}",
                get(|| async { StatusCode::BAD_REQUEST }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

        let client = build_http_client().unwrap();
        let err = query_direct(
            &client,
            &base,
            &base,
            "eun1_test_direct_400",
            "RGAPI-mock",
            Some("9fde699e-6feb-dcbb-a918-a4d7a01f60f1".into()),
            Some(("Main".into(), "EUNE".into())),
        )
        .await
        .unwrap_err();

        assert!(err.starts_with(INVALID_PUUID_ERR_PREFIX));
        let mem_empty = LIVE_STATE
            .lock()
            .unwrap()
            .puuid_cache
            .get("eun1_test_direct_400\0main\0eune")
            .is_none();
        assert!(mem_empty);

        task.abort();
    }
}
