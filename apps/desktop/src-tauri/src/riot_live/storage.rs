use chrono::Utc;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::launcher_settings::atomic_write;
use crate::local_store::crypto::LocalSecretBox;

use super::models::{
    CachedApiPuuidEntry, LiveStatusConfig, LiveStatusMode, LiveStatusSecrets,
    LiveStatusSettingsSummary, SaveLiveStatusSettingsInput, PUUID_CACHE_FILENAME, SECRETS_AAD,
    SECRETS_FILENAME, SETTINGS_FILENAME,
};
use super::rate_limiter::clear_status_cache;
use super::routing::{api_puuid_entry_key, normalize_worker_url, sanitize_api_puuid};

pub static SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());
pub static PUUID_CACHE_IO_LOCK: Mutex<()> = Mutex::new(());

pub fn storage_paths(dir: &Path) -> (PathBuf, PathBuf) {
    (dir.join(SETTINGS_FILENAME), dir.join(SECRETS_FILENAME))
}

pub fn puuid_cache_path(dir: &Path) -> PathBuf {
    dir.join(PUUID_CACHE_FILENAME)
}

pub fn read_cached_api_puuid(dir: &Path, platform: &str, account_id: &str) -> Option<String> {
    let _guard = PUUID_CACHE_IO_LOCK.lock().ok()?;
    let bytes = fs::read(puuid_cache_path(dir)).ok()?;
    let map: BTreeMap<String, CachedApiPuuidEntry> = serde_json::from_slice(&bytes).ok()?;
    let key = api_puuid_entry_key(platform, account_id);
    map.get(&key)
        .and_then(|entry| sanitize_api_puuid(Some(&entry.puuid)))
}

pub fn save_cached_api_puuid(dir: &Path, platform: &str, account_id: &str, puuid: &str) {
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

pub fn clear_cached_api_puuid(dir: &Path, platform: &str, account_id: &str) {
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

pub fn builtin_worker_url_from(
    runtime_val: Option<&str>,
    compile_val: Option<&str>,
) -> Option<String> {
    let raw = runtime_val
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .or_else(|| compile_val.map(str::trim).filter(|v| !v.is_empty()))?;
    normalize_worker_url(raw).ok().flatten()
}

pub fn builtin_worker_token_from(
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

pub fn resolve_builtin_worker() -> (Option<String>, Option<String>) {
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

pub fn resolve_effective_worker_token(
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

pub fn read_config_from_with_builtin(
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

pub fn read_config_from(dir: &Path) -> Result<LiveStatusConfig, String> {
    let (builtin_url, builtin_tok) = resolve_builtin_worker();
    read_config_from_with_builtin(dir, builtin_url, builtin_tok.is_some())
}

pub fn read_secrets_from(dir: &Path) -> Result<LiveStatusSecrets, String> {
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

pub fn write_secrets_to(dir: &Path, secrets: &LiveStatusSecrets) -> Result<(), String> {
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

pub fn build_settings_summary(
    config: &LiveStatusConfig,
    secrets: &LiveStatusSecrets,
) -> LiveStatusSettingsSummary {
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

pub fn save_settings_to_dir(
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
            if trimmed.len() < 16
                || trimmed.len() > 512
                || trimmed.chars().any(char::is_whitespace)
            {
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
        return Err(
            "Enter your Riot Personal API key (or set RIOT_API_KEY) before enabling Direct mode."
                .into(),
        );
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

    clear_status_cache();

    Ok(build_settings_summary(&config, &secrets))
}
