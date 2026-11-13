use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::AppHandle;

use super::game_path::{
    ensure_safe_existing_entry, sanitize_build_string, validate_league_install_dir, GameInstallInfo,
};
use super::storage;

const CONFIG_FILE: &str = "game_adapter_config.json";
const RUNTIME_FILE: &str = "game_adapter_runtime.json";
const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const MAX_RUNTIME_BYTES: u64 = 512 * 1024;
const MAX_BINARY_BYTES: u64 = 512 * 1024 * 1024;
const MAX_STDIO_BYTES: usize = 512 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const ACTION_TIMEOUT: Duration = Duration::from_secs(20);

static ADAPTER_LOCK: Mutex<()> = Mutex::new(());

fn acquire_adapter_lock(max_wait: Duration) -> Result<std::sync::MutexGuard<'static, ()>, String> {
    let deadline = Instant::now() + max_wait;
    loop {
        match ADAPTER_LOCK.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(p)) => return Ok(p.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) => {
                if Instant::now() >= deadline {
                    return Err("Another external adapter operation is already running.".into());
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn test_serial_guard() -> std::sync::MutexGuard<'static, ()> {
    static TEST_SERIAL: Mutex<()> = Mutex::new(());
    TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner())
}

pub const DOCUMENTED_SUBCOMMANDS: [&str; 9] = [
    "get_version",
    "get_supported_game_build",
    "list_supported_formats",
    "validate_candidate",
    "stage_candidate",
    "activate_staged",
    "status",
    "stop",
    "restore_defaults",
];

const DISCOVERABLE_BINARY_NAMES: [&str; 3] = [
    "league-mod-adapter.exe",
    "ltk-mod-cli.exe",
    "cslol-cli.exe",
];

const REJECTED_SHELL_NAMES: [&str; 12] = [
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "sh",
    "bash",
    "zsh",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AdapterLifecycleState {
    NotInstalled,
    Detected,
    Inspected,
    Compatible,
    UnsupportedGameBuild,
    UnsupportedPlatform,
    NeedsUpdate,
    BlockedByPolicy,
    Available,
    Busy,
    Applied,
    Deferred,
    Failed,
    Stopping,
    Unavailable,
}

impl AdapterLifecycleState {
    pub fn as_summary(&self) -> &'static str {
        match self {
            Self::NotInstalled => "Not installed",
            Self::Detected => "Detected",
            Self::Inspected => "Inspected",
            Self::Compatible => "Compatible",
            Self::UnsupportedGameBuild => "Unsupported game build",
            Self::UnsupportedPlatform => "Unsupported platform",
            Self::NeedsUpdate => "Adapter update needed",
            Self::BlockedByPolicy => "Blocked pending opt-in/policy",
            Self::Available => "Available",
            Self::Busy => "Busy",
            Self::Applied => "Applied",
            Self::Deferred => "Deferred (match in progress)",
            Self::Failed => "Failed",
            Self::Stopping => "Stopping",
            Self::Unavailable => "Unavailable",
        }
    }

    pub fn is_compatible_or_active(&self) -> bool {
        matches!(
            self,
            Self::Compatible | Self::Available | Self::Applied | Self::Deferred
        )
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ModRuntimeState {
    Unverified,
    SafeToStore,
    Incompatible,
    AdapterReady,
    Staged,
    Applied,
    Deferred,
    Failed,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAdapterConfig {
    pub adapter_path: Option<String>,
    pub expected_sha256: Option<String>,
    #[serde(default)]
    pub user_consent_granted: bool,
    #[serde(default)]
    pub clearance_acknowledged: bool,
    #[serde(default)]
    pub auto_apply_in_champ_select: bool,
    pub last_verified_sha256: Option<String>,
    pub last_verified_version: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStore {
    pub mods: HashMap<String, ModRuntimeRecord>,
    pub active_staged_dir: Option<String>,
    pub active_game_dir: Option<String>,
    pub last_action: Option<String>,
    pub last_action_message: Option<String>,
    pub updated_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModRuntimeRecord {
    pub state: ModRuntimeState,
    pub last_error: Option<String>,
    pub deferred_reason: Option<String>,
    pub adapter_version: Option<String>,
    pub game_build: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModRuntimeEntry {
    pub sha256: String,
    pub state: ModRuntimeState,
    pub detail: String,
    pub updated_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterStatusReport {
    pub state: AdapterLifecycleState,
    pub available: bool,
    pub compatible: bool,
    pub applied_in_game: bool,
    pub busy: bool,
    pub discovery_source: Option<String>,
    pub binary_path: Option<String>,
    pub binary_sha256: Option<String>,
    pub version: Option<String>,
    pub supported_game_builds: Vec<String>,
    pub supported_formats: Vec<String>,
    pub league_install: GameInstallInfo,
    pub active_mods: Vec<String>,
    pub active_match_running: bool,
    pub consent_granted: bool,
    pub clearance_acknowledged: bool,
    pub auto_apply_in_champ_select: bool,
    pub detail: String,
    pub documented_subcommands: Vec<String>,
    pub checked_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCandidateSpec {
    pub sha256: String,
    pub name: String,
    pub format: String,
    pub source_path: PathBuf,
    pub supported_game_builds: Vec<String>,
    pub contains_paid_riot_content: bool,
    pub valid: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterApplyOutcome {
    pub state: AdapterLifecycleState,
    pub applied_in_game: bool,
    pub applied_mod_hashes: Vec<String>,
    pub deferred_mod_hashes: Vec<String>,
    pub failed_mod_hashes: Vec<String>,
    pub deferred_reason: Option<String>,
    pub game_overlay_directory: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterRestoreOutcome {
    pub state: AdapterLifecycleState,
    pub restored_in_game: bool,
    pub deferred_reason: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug)]
enum AdapterCommand {
    GetVersion,
    GetSupportedGameBuild,
    ListSupportedFormats,
    ValidateCandidate {
        candidate: String,
        game_dir: String,
        format: String,
        game_build: Option<String>,
    },
    StageCandidate {
        candidate: String,
        staging_dir: String,
        game_dir: String,
        mod_id: String,
        format: String,
    },
    ActivateStaged {
        staging_dir: String,
        game_dir: String,
    },
    Status {
        game_dir: String,
    },
    Stop {
        game_dir: String,
    },
    RestoreDefaults {
        game_dir: String,
    },
}

impl AdapterCommand {
    fn to_args(&self) -> Vec<String> {
        match self {
            Self::GetVersion => vec!["get_version".into()],
            Self::GetSupportedGameBuild => vec!["get_supported_game_build".into()],
            Self::ListSupportedFormats => vec!["list_supported_formats".into()],
            Self::ValidateCandidate {
                candidate,
                game_dir,
                format,
                game_build,
            } => {
                let mut args = vec![
                    "validate_candidate".into(),
                    "--candidate".into(),
                    candidate.clone(),
                    "--game-dir".into(),
                    game_dir.clone(),
                    "--format".into(),
                    format.clone(),
                ];
                if let Some(build) = game_build {
                    args.push("--game-build".into());
                    args.push(build.clone());
                }
                args
            }
            Self::StageCandidate {
                candidate,
                staging_dir,
                game_dir,
                mod_id,
                format,
            } => vec![
                "stage_candidate".into(),
                "--candidate".into(),
                candidate.clone(),
                "--staging-dir".into(),
                staging_dir.clone(),
                "--game-dir".into(),
                game_dir.clone(),
                "--mod-id".into(),
                mod_id.clone(),
                "--format".into(),
                format.clone(),
            ],
            Self::ActivateStaged {
                staging_dir,
                game_dir,
            } => vec![
                "activate_staged".into(),
                "--staging-dir".into(),
                staging_dir.clone(),
                "--game-dir".into(),
                game_dir.clone(),
            ],
            Self::Status { game_dir } => vec!["status".into(), "--game-dir".into(), game_dir.clone()],
            Self::Stop { game_dir } => vec!["stop".into(), "--game-dir".into(), game_dir.clone()],
            Self::RestoreDefaults { game_dir } => {
                vec!["restore_defaults".into(), "--game-dir".into(), game_dir.clone()]
            }
        }
    }

    fn timeout(&self) -> Duration {
        match self {
            Self::GetVersion | Self::GetSupportedGameBuild | Self::ListSupportedFormats | Self::Status { .. } => {
                PROBE_TIMEOUT
            }
            _ => ACTION_TIMEOUT,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliJsonResponse {
    #[serde(alias = "adapterVersion")]
    version: Option<String>,
    supported_game_build: Option<String>,
    #[serde(default)]
    supported_game_builds: Vec<String>,
    #[serde(default)]
    formats: Vec<String>,
    #[serde(default)]
    supported_formats: Vec<String>,
    valid: Option<bool>,
    applied: Option<bool>,
    active: Option<bool>,
    needs_update: Option<bool>,
    #[serde(default)]
    active_mods: Vec<String>,
    message: Option<String>,
    error: Option<String>,
}

#[derive(Clone)]
pub(crate) struct ProbeOptions {
    pub platform_supported: bool,
    pub active_match_running: bool,
    pub lcu_build_hint: Option<String>,
    pub allow_path_discovery: bool,
}

impl Default for ProbeOptions {
    fn default() -> Self {
        Self {
            platform_supported: cfg!(target_os = "windows"),
            active_match_running: is_league_match_process_running(),
            lcu_build_hint: None,
            allow_path_discovery: true,
        }
    }
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn config_file_for_root(customization_root: &Path) -> PathBuf {
    customization_root.join(CONFIG_FILE)
}

fn runtime_file_for_root(customization_root: &Path) -> PathBuf {
    customization_root.join(RUNTIME_FILE)
}

fn game_path_config_for_root(customization_root: &Path) -> PathBuf {
    customization_root.join("game_path.json")
}

pub fn is_league_match_process_running() -> bool {
    let sys = System::new_all();
    sys.processes().values().any(|proc_info| {
        let name_os: &OsStr = proc_info.name().as_ref();
        let name = name_os.to_string_lossy().to_ascii_lowercase();
        name == "league of legends.exe" || name == "league of legends"
    })
}

pub fn is_safe_gameflow_phase(phase: Option<&str>) -> bool {
    !matches!(
        phase,
        Some("GameStart" | "InProgress" | "Reconnect" | "WaitingForStats" | "PreEndOfGame")
    )
}

pub fn load_config_at(customization_root: &Path) -> Result<GameAdapterConfig, String> {
    let p = config_file_for_root(customization_root);
    Ok(storage::read::<GameAdapterConfig>(&p, MAX_CONFIG_BYTES)?.unwrap_or_default())
}

pub fn save_config_at(
    customization_root: &Path,
    mut cfg: GameAdapterConfig,
) -> Result<GameAdapterConfig, String> {
    cfg.adapter_path = cfg
        .adapter_path
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    cfg.expected_sha256 = cfg
        .expected_sha256
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty());

    if let Some(ref hash) = cfg.expected_sha256 {
        if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("Expected SHA-256 must be a 64-character hex digest.".into());
        }
    }

    if let Some(ref path_str) = cfg.adapter_path {
        validate_adapter_binary_path(Path::new(path_str))?;
    }

    storage::write(&config_file_for_root(customization_root), &cfg)?;
    Ok(cfg)
}

fn load_runtime_at(customization_root: &Path) -> RuntimeStore {
    let p = runtime_file_for_root(customization_root);
    storage::read::<RuntimeStore>(&p, MAX_RUNTIME_BYTES)
        .ok()
        .flatten()
        .unwrap_or_default()
}

fn save_runtime_at(customization_root: &Path, store: &RuntimeStore) -> Result<(), String> {
    storage::write(&runtime_file_for_root(customization_root), store)
}

pub fn validate_adapter_binary_path(path: &Path) -> Result<PathBuf, String> {
    ensure_safe_existing_entry(path, false)?;
    let meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Cannot stat adapter executable '{}': {e}", path.to_string_lossy()))?;
    if meta.len() == 0 || meta.len() > MAX_BINARY_BYTES {
        return Err("External adapter executable size is outside safe bounds.".into());
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid adapter filename.".to_string())?;
    let lower_name = file_name.to_ascii_lowercase();
    if REJECTED_SHELL_NAMES.contains(&lower_name.as_str()) {
        return Err(format!(
            "Refusing shell or script host '{file_name}' as an external mod adapter."
        ));
    }

    #[cfg(windows)]
    {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        if ext.as_deref() != Some("exe") {
            return Err("On Windows, the external mod adapter must be a native .exe binary.".into());
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o111 == 0 {
            return Err("External mod adapter file is not marked executable.".into());
        }
    }

    Ok(path.to_path_buf())
}

fn compute_sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open adapter binary for hashing: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    let mut total: u64 = 0;
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed reading adapter binary: {e}"))?;
        if n == 0 {
            break;
        }
        total = total.saturating_add(n as u64);
        if total > MAX_BINARY_BYTES {
            return Err("Adapter binary exceeds 512 MiB limit.".into());
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn bundled_adapter_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            dirs.push(exe_dir.to_path_buf());
            dirs.push(exe_dir.join("binaries"));
            dirs.push(exe_dir.join("adapters"));
            dirs.push(exe_dir.join("resources").join("adapters"));
            #[cfg(target_os = "macos")]
            if let Some(contents_dir) = exe_dir.parent() {
                dirs.push(contents_dir.join("Resources").join("adapters"));
            }
        }
    }
    dirs
}

fn find_adapter_in_dirs(dirs: &[PathBuf], source_label: &str) -> Option<(PathBuf, String)> {
    for dir in dirs {
        if !dir.is_absolute() || !dir.is_dir() {
            continue;
        }
        for bin_name in DISCOVERABLE_BINARY_NAMES {
            let candidate = dir.join(bin_name);
            if candidate.is_file() && validate_adapter_binary_path(&candidate).is_ok() {
                return Some((candidate, source_label.into()));
            }
        }
    }
    None
}

fn effective_expected_sha256<'a>(
    cfg: &'a GameAdapterConfig,
    discovery_source: &str,
) -> Option<&'a str> {
    if let Some(ref pinned) = cfg.expected_sha256 {
        return Some(pinned.as_str());
    }
    if discovery_source == "bundled" {
        return option_env!("LAAP_BUNDLED_ADAPTER_SHA256")
            .map(str::trim)
            .filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));
    }
    None
}

fn discover_adapter_binary_with_bundled(
    cfg: &GameAdapterConfig,
    allow_path_discovery: bool,
    bundled_dirs: &[PathBuf],
) -> Result<Option<(PathBuf, String)>, String> {
    if let Some(ref configured) = cfg.adapter_path {
        let trimmed = configured.trim();
        if !trimmed.is_empty() {
            let valid = validate_adapter_binary_path(Path::new(trimmed))?;
            return Ok(Some((valid, "configured".into())));
        }
    }

    if !allow_path_discovery {
        return Ok(None);
    }

    if let Some(found) = find_adapter_in_dirs(bundled_dirs, "bundled") {
        return Ok(Some(found));
    }

    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(path_env) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&path_env));
    }
    #[cfg(windows)]
    if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
        let base = PathBuf::from(local_app);
        search_dirs.push(base.join("LAAP").join("adapters"));
        search_dirs.push(base.join("Programs").join("cslol-manager"));
        search_dirs.push(base.join("Programs").join("ltk-mod-cli"));
    }

    Ok(find_adapter_in_dirs(&search_dirs, "discovered"))
}

fn discover_adapter_binary(
    cfg: &GameAdapterConfig,
    allow_path_discovery: bool,
) -> Result<Option<(PathBuf, String)>, String> {
    discover_adapter_binary_with_bundled(cfg, allow_path_discovery, &bundled_adapter_dirs())
}

fn read_capped_stream<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0u8; 8192];
        while out.len() < MAX_STDIO_BYTES {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let take = n.min(MAX_STDIO_BYTES - out.len());
                    out.extend_from_slice(&buf[..take]);
                    if take < n {
                        break;
                    }
                }
            }
        }
        String::from_utf8_lossy(&out).trim().to_string()
    })
}

fn invoke_adapter_cli(bin: &Path, command: AdapterCommand) -> Result<String, String> {
    let timeout = command.timeout();
    invoke_adapter_cli_with_timeout(bin, command, timeout)
}

fn invoke_adapter_cli_with_timeout(
    bin: &Path,
    command: AdapterCommand,
    timeout: Duration,
) -> Result<String, String> {
    validate_adapter_binary_path(bin)?;
    let args = command.to_args();

    let mut cmd = Command::new(bin);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch external mod adapter '{}': {e}", bin.display()))?;

    let stdout_handle = child.stdout.take().map(read_capped_stream);
    let stderr_handle = child.stderr.take().map(read_capped_stream);

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    if let Some(h) = stdout_handle {
                        let _ = h.join();
                    }
                    if let Some(h) = stderr_handle {
                        let _ = h.join();
                    }
                    return Err(format!(
                        "External mod adapter subcommand '{}' timed out after {}s.",
                        args.first().map(String::as_str).unwrap_or("unknown"),
                        timeout.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Failed waiting on external mod adapter: {e}"));
            }
        }
    };

    let stdout = stdout_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let stderr = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();

    if !status.success() {
        let parsed_err = serde_json::from_str::<CliJsonResponse>(&stdout)
            .ok()
            .and_then(|r| r.error.or(r.message))
            .filter(|s| !s.is_empty());
        let detail = parsed_err
            .or_else(|| (!stderr.is_empty()).then_some(stderr))
            .or_else(|| (!stdout.is_empty()).then_some(stdout))
            .unwrap_or_else(|| format!("exit code {}", status.code().unwrap_or(-1)));
        return Err(format!("External adapter error: {detail}"));
    }

    Ok(stdout)
}

fn parse_cli_json(raw: &str) -> Option<CliJsonResponse> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        serde_json::from_str::<CliJsonResponse>(trimmed).ok()
    } else {
        None
    }
}

fn parse_version_output(raw: &str) -> Result<String, String> {
    if let Some(json) = parse_cli_json(raw) {
        if let Some(v) = json.version.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
            return Ok(v);
        }
    }
    let first_line = raw.lines().next().unwrap_or("").trim();
    if first_line.is_empty()
        || first_line.len() > 64
        || first_line.chars().any(|c| c.is_control())
    {
        return Err("Adapter 'get_version' returned empty or invalid output.".into());
    }
    Ok(first_line.to_string())
}

fn parse_supported_builds_output(raw: &str) -> Result<(Vec<String>, bool), String> {
    if let Some(json) = parse_cli_json(raw) {
        let mut builds = json.supported_game_builds;
        if let Some(single) = json.supported_game_build {
            let trimmed = single.trim().to_string();
            if !trimmed.is_empty() && !builds.contains(&trimmed) {
                builds.push(trimmed);
            }
        }
        let cleaned: Vec<String> = builds
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return Ok((cleaned, json.needs_update.unwrap_or(false)));
    }

    let trimmed = raw.trim();
    if trimmed.starts_with('[') {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(trimmed) {
            let cleaned = arr
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            return Ok((cleaned, false));
        }
    }

    let cleaned: Vec<String> = trimmed
        .split(|c: char| c == ',' || c == '\n' || c == ';')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if cleaned.is_empty() {
        return Err("Adapter 'get_supported_game_build' returned no build metadata.".into());
    }
    Ok((cleaned, false))
}

fn parse_supported_formats_output(raw: &str) -> Result<Vec<String>, String> {
    let mut parsed: Vec<String> = if let Some(json) = parse_cli_json(raw) {
        if !json.formats.is_empty() {
            json.formats
        } else {
            json.supported_formats
        }
    } else if raw.trim().starts_with('[') {
        serde_json::from_str::<Vec<String>>(raw.trim()).unwrap_or_default()
    } else {
        raw.split(|c: char| c == ',' || c == '\n' || c == ';')
            .map(|s| s.trim().to_string())
            .collect()
    };

    parsed.iter_mut().for_each(|s| {
        *s = s.trim().trim_start_matches('.').to_ascii_lowercase();
    });
    parsed.retain(|s| !s.is_empty() && s != "preset");
    parsed.sort();
    parsed.dedup();
    Ok(parsed)
}

pub fn build_matches_supported(detected_build: &str, supported_patterns: &[String]) -> bool {
    let Some(norm_detected) = sanitize_build_string(detected_build) else {
        return false;
    };
    let detected_segs: Vec<&str> = norm_detected.split('.').collect();

    for raw_pattern in supported_patterns {
        let pat = raw_pattern.trim();
        if pat.is_empty()
            || pat == "*"
            || pat.eq_ignore_ascii_case("any")
            || pat.eq_ignore_ascii_case("unknown")
        {
            // Strict policy: wildcard/unknown build declarations never verify compatibility.
            continue;
        }
        let cleaned = pat.strip_prefix('v').unwrap_or(pat).trim();
        let cleaned = cleaned.strip_suffix(".*").unwrap_or(cleaned).trim();
        let Some(norm_pat) = sanitize_build_string(cleaned) else {
            continue;
        };
        let pat_segs: Vec<&str> = norm_pat.split('.').collect();
        if pat_segs.len() > detected_segs.len() {
            continue;
        }
        if pat_segs
            .iter()
            .zip(detected_segs.iter())
            .all(|(p, d)| p == d)
        {
            return true;
        }
    }
    false
}

fn base_status_report(
    state: AdapterLifecycleState,
    cfg: &GameAdapterConfig,
    league_install: GameInstallInfo,
    active_match_running: bool,
    detail: impl Into<String>,
) -> AdapterStatusReport {
    AdapterStatusReport {
        state,
        available: false,
        compatible: false,
        applied_in_game: false,
        busy: false,
        discovery_source: None,
        binary_path: cfg.adapter_path.clone(),
        binary_sha256: None,
        version: None,
        supported_game_builds: Vec::new(),
        supported_formats: Vec::new(),
        league_install,
        active_mods: Vec::new(),
        active_match_running,
        consent_granted: cfg.user_consent_granted,
        clearance_acknowledged: cfg.clearance_acknowledged,
        auto_apply_in_champ_select: cfg.auto_apply_in_champ_select,
        detail: detail.into(),
        documented_subcommands: DOCUMENTED_SUBCOMMANDS.iter().map(|s| (*s).into()).collect(),
        checked_at: now_unix(),
    }
}

pub fn probe_adapter(app: &AppHandle, lcu_build_hint: Option<&str>) -> AdapterStatusReport {
    let Ok(root) = storage::root(app) else {
        return base_status_report(
            AdapterLifecycleState::Unavailable,
            &GameAdapterConfig::default(),
            GameInstallInfo {
                league_path: None,
                game_dir: None,
                game_exe_path: None,
                detected_build: None,
                is_detected: false,
                source: None,
                validation_error: Some("Storage root unavailable.".into()),
            },
            false,
            "Unable to resolve customization storage root.",
        );
    };
    let opts = ProbeOptions {
        lcu_build_hint: lcu_build_hint.map(str::to_string),
        ..ProbeOptions::default()
    };
    probe_adapter_at(&root, &opts)
}

pub(crate) fn probe_adapter_at(customization_root: &Path, opts: &ProbeOptions) -> AdapterStatusReport {
    let cfg = load_config_at(customization_root).unwrap_or_default();
    let mut league_install = resolve_game_install_info_safe(customization_root, opts.lcu_build_hint.as_deref());

    let _guard = match acquire_adapter_lock(Duration::from_millis(500)) {
        Ok(g) => g,
        Err(_) => {
            let mut r = base_status_report(
                AdapterLifecycleState::Busy,
                &cfg,
                league_install,
                opts.active_match_running,
                "External game mod adapter operation is currently in progress.",
            );
            r.busy = true;
            return r;
        }
    };

    if !opts.platform_supported {
        return base_status_report(
            AdapterLifecycleState::UnsupportedPlatform,
            &cfg,
            league_install,
            opts.active_match_running,
            "Live external game mod activation requires Windows. Sandbox packaging and library workflows remain available here.",
        );
    }

    let discovered = match discover_adapter_binary(&cfg, opts.allow_path_discovery) {
        Ok(Some(found)) => found,
        Ok(None) => {
            return base_status_report(
                AdapterLifecycleState::NotInstalled,
                &cfg,
                league_install,
                opts.active_match_running,
                "No user-installed external game mod adapter CLI found. Configure an approved local adapter binary in Studio Settings.",
            );
        }
        Err(err) => {
            return base_status_report(
                AdapterLifecycleState::Failed,
                &cfg,
                league_install,
                opts.active_match_running,
                err,
            );
        }
    };

    let (bin_path, discovery_source) = discovered;
    let mut report = base_status_report(
        AdapterLifecycleState::Detected,
        &cfg,
        league_install.clone(),
        opts.active_match_running,
        format!("Detected external adapter binary at {}", bin_path.display()),
    );
    report.discovery_source = Some(discovery_source.clone());
    report.binary_path = Some(bin_path.to_string_lossy().into_owned());

    let sha256 = match compute_sha256_file(&bin_path) {
        Ok(h) => h,
        Err(e) => {
            report.state = AdapterLifecycleState::Failed;
            report.detail = e;
            return report;
        }
    };
    report.binary_sha256 = Some(sha256.clone());

    if let Some(pinned) = effective_expected_sha256(&cfg, &discovery_source) {
        if !pinned.eq_ignore_ascii_case(&sha256) {
            report.state = AdapterLifecycleState::BlockedByPolicy;
            report.detail = format!(
                "Adapter binary SHA-256 ({sha256}) does not match configured provenance hash ({pinned})."
            );
            return report;
        }
    }

    let ver_raw = match invoke_adapter_cli(&bin_path, AdapterCommand::GetVersion) {
        Ok(v) => v,
        Err(e) => {
            report.state = AdapterLifecycleState::Failed;
            report.detail = format!("Adapter binary did not answer 'get_version': {e}");
            return report;
        }
    };
    let version = match parse_version_output(&ver_raw) {
        Ok(v) => v,
        Err(e) => {
            report.state = AdapterLifecycleState::Failed;
            report.detail = e;
            return report;
        }
    };
    report.version = Some(version);
    report.state = AdapterLifecycleState::Inspected;

    let builds_raw = match invoke_adapter_cli(&bin_path, AdapterCommand::GetSupportedGameBuild) {
        Ok(b) => b,
        Err(e) => {
            report.state = AdapterLifecycleState::Failed;
            report.detail = format!("Adapter failed 'get_supported_game_build': {e}");
            return report;
        }
    };
    let (supported_builds, needs_update) = match parse_supported_builds_output(&builds_raw) {
        Ok(parsed) => parsed,
        Err(e) => {
            report.state = AdapterLifecycleState::Failed;
            report.detail = e;
            return report;
        }
    };
    report.supported_game_builds = supported_builds.clone();

    if let Ok(formats_raw) = invoke_adapter_cli(&bin_path, AdapterCommand::ListSupportedFormats) {
        if let Ok(fmts) = parse_supported_formats_output(&formats_raw) {
            report.supported_formats = fmts;
        }
    }
    if report.supported_formats.is_empty() {
        report.supported_formats = vec!["fantome".into(), "modpkg".into(), "zip".into()];
    }

    if needs_update {
        report.state = AdapterLifecycleState::NeedsUpdate;
        report.detail = "External game mod adapter reports an update is required for this League installation.".into();
        return report;
    }

    let Some(ref league_path) = league_install.league_path.clone() else {
        report.state = AdapterLifecycleState::UnsupportedGameBuild;
        report.detail = "League of Legends installation directory could not be verified; build compatibility is unknown.".into();
        return report;
    };

    if league_install.detected_build.is_none() {
        if let Some(hint) = opts.lcu_build_hint.as_deref().and_then(sanitize_build_string) {
            league_install.detected_build = Some(hint);
            report.league_install = league_install.clone();
        }
    }

    let Some(ref detected_build) = league_install.detected_build else {
        report.state = AdapterLifecycleState::UnsupportedGameBuild;
        report.detail = "League of Legends game build version is unknown; refusing unverified compatibility.".into();
        return report;
    };

    if !build_matches_supported(detected_build, &supported_builds) {
        report.state = AdapterLifecycleState::UnsupportedGameBuild;
        report.detail = format!(
            "Detected League build {detected_build} is outside adapter supported builds [{}].",
            supported_builds.join(", ")
        );
        return report;
    }

    // Adapter executable + build compatibility verified!
    report.available = true;
    report.compatible = true;

    // Query live adapter status (read-only) to inspect applied state.
    if let Ok(status_raw) = invoke_adapter_cli(
        &bin_path,
        AdapterCommand::Status {
            game_dir: league_path.clone(),
        },
    ) {
        if let Some(status_json) = parse_cli_json(&status_raw) {
            let applied = status_json.applied.or(status_json.active).unwrap_or(false);
            report.applied_in_game = applied;
            report.active_mods = status_json.active_mods;
        } else {
            let lower = status_raw.to_ascii_lowercase();
            report.applied_in_game = lower.contains("applied") || lower.contains("active");
        }
    }

    if report.applied_in_game {
        report.state = AdapterLifecycleState::Applied;
        report.detail = format!(
            "Adapter {} verified and active for League build {}.",
            report.version.as_deref().unwrap_or("unknown"),
            detected_build
        );
    } else if opts.active_match_running {
        report.state = AdapterLifecycleState::Deferred;
        report.detail =
            "Adapter compatible, but an active League match process is running; game state changes are deferred.".into();
    } else if !cfg.user_consent_granted || !cfg.clearance_acknowledged {
        report.state = AdapterLifecycleState::BlockedByPolicy;
        report.detail = format!(
            "Adapter {} is compatible with League build {}, but user opt-in consent and clearance acknowledgement are not enabled.",
            report.version.as_deref().unwrap_or("unknown"),
            detected_build
        );
    } else {
        report.state = AdapterLifecycleState::Compatible;
        report.detail = format!(
            "Adapter {} verified and compatible with League build {}.",
            report.version.as_deref().unwrap_or("unknown"),
            detected_build
        );
    }

    report
}

fn resolve_game_install_info_safe(customization_root: &Path, lcu_build_hint: Option<&str>) -> GameInstallInfo {
    let cfg_path = game_path_config_for_root(customization_root);
    super::game_path::resolve_game_install_info_at(&cfg_path, lcu_build_hint)
}

fn ensure_safe_candidate_entry(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|e| format!("Cannot inspect mod candidate '{}': {e}", path.to_string_lossy()))?;
    ensure_safe_existing_entry(path, meta.is_dir())
}

pub(crate) fn apply_candidates_via_adapter_at(
    customization_root: &Path,
    staging_dir: &Path,
    candidates: &[AdapterCandidateSpec],
    opts: &ProbeOptions,
) -> Result<AdapterApplyOutcome, String> {
    if candidates.is_empty() {
        return Ok(AdapterApplyOutcome {
            state: AdapterLifecycleState::Compatible,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: vec![],
            failed_mod_hashes: vec![],
            deferred_reason: None,
            game_overlay_directory: None,
            message: "No enabled custom mods to apply via adapter.".into(),
        });
    }

    // Policy screen relaxed (user-accepted risk): allow paid/preset-tagged content if structurally valid.
    for cand in candidates {
        if !cand.valid {
            record_mod_state_at(
                customization_root,
                &cand.sha256,
                ModRuntimeState::Incompatible,
                Some("Archive failed static safety validation.".into()),
                None,
                None,
                opts.lcu_build_hint.clone(),
            );
            return Err(format!("Refusing to apply unverified mod '{}'.", cand.name));
        }
    }

    let cfg = load_config_at(customization_root).unwrap_or_default();
    if opts.active_match_running {
        let reason = "Active League match detected; deferring mod activation until Lobby or EndOfGame.".to_string();
        let deferred_hashes: Vec<String> = candidates.iter().map(|c| c.sha256.clone()).collect();
        for h in &deferred_hashes {
            record_mod_state_at(
                customization_root,
                h,
                ModRuntimeState::Deferred,
                None,
                Some(reason.clone()),
                cfg.last_verified_version.clone(),
                opts.lcu_build_hint.clone(),
            );
        }
        return Ok(AdapterApplyOutcome {
            state: AdapterLifecycleState::Deferred,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: deferred_hashes,
            failed_mod_hashes: vec![],
            deferred_reason: Some(reason.clone()),
            game_overlay_directory: None,
            message: reason,
        });
    }

    let probe = probe_adapter_at(customization_root, opts);
    if !probe.compatible {
        let state_for_mod = match probe.state {
            AdapterLifecycleState::UnsupportedGameBuild
            | AdapterLifecycleState::UnsupportedPlatform => ModRuntimeState::Staged,
            AdapterLifecycleState::NotInstalled => ModRuntimeState::Staged,
            _ => ModRuntimeState::Staged,
        };
        for c in candidates {
            record_mod_state_at(
                customization_root,
                &c.sha256,
                state_for_mod.clone(),
                Some(probe.detail.clone()),
                None,
                probe.version.clone(),
                probe.league_install.detected_build.clone(),
            );
        }
        return Ok(AdapterApplyOutcome {
            state: probe.state,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: vec![],
            failed_mod_hashes: vec![],
            deferred_reason: None,
            game_overlay_directory: None,
            message: format!("Staged in LAAP sandbox only. {}", probe.detail),
        });
    }

    if !cfg.user_consent_granted || !cfg.clearance_acknowledged {
        for c in candidates {
            record_mod_state_at(
                customization_root,
                &c.sha256,
                ModRuntimeState::Staged,
                Some("Adapter consent or clearance not enabled in Studio Settings.".into()),
                None,
                probe.version.clone(),
                probe.league_install.detected_build.clone(),
            );
        }
        return Ok(AdapterApplyOutcome {
            state: AdapterLifecycleState::BlockedByPolicy,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: vec![],
            failed_mod_hashes: vec![],
            deferred_reason: None,
            game_overlay_directory: None,
            message: "Staged in LAAP sandbox. Enable external adapter consent and clearance in Studio Settings to activate in League.".into(),
        });
    }

    let _guard = acquire_adapter_lock(Duration::from_millis(500))?;

    let bin_path = PathBuf::from(
        probe
            .binary_path
            .clone()
            .ok_or_else(|| "Verified adapter path unavailable.".to_string())?,
    );
    let game_dir = probe
        .league_install
        .league_path
        .clone()
        .ok_or_else(|| "Verified League installation path unavailable.".to_string())?;
    let detected_build = probe.league_install.detected_build.clone();

    let mut validated_candidates = Vec::new();
    let mut failed_hashes = Vec::new();
    let mut first_error = None;

    for cand in candidates {
        if !cand.supported_game_builds.is_empty() {
            if let Some(ref b) = detected_build {
                if !build_matches_supported(b, &cand.supported_game_builds) {
                    let msg = format!(
                        "Mod '{}' targets builds [{}], incompatible with League build {}.",
                        cand.name,
                        cand.supported_game_builds.join(", "),
                        b
                    );
                    record_mod_state_at(
                        customization_root,
                        &cand.sha256,
                        ModRuntimeState::Incompatible,
                        Some(msg.clone()),
                        None,
                        probe.version.clone(),
                        detected_build.clone(),
                    );
                    failed_hashes.push(cand.sha256.clone());
                    if first_error.is_none() {
                        first_error = Some(msg);
                    }
                    continue;
                }
            }
        }

        let fmt = cand.format.to_ascii_lowercase();
        if !probe.supported_formats.is_empty() && !probe.supported_formats.contains(&fmt) {
            let msg = format!(
                "Adapter does not support format '{}' for '{}'.",
                cand.format, cand.name
            );
            record_mod_state_at(
                customization_root,
                &cand.sha256,
                ModRuntimeState::Incompatible,
                Some(msg.clone()),
                None,
                probe.version.clone(),
                detected_build.clone(),
            );
            failed_hashes.push(cand.sha256.clone());
            if first_error.is_none() {
                first_error = Some(msg);
            }
            continue;
        }

        let candidate_str = cand.source_path.to_string_lossy().into_owned();
        if let Err(err) = ensure_safe_candidate_entry(&cand.source_path) {
            record_mod_state_at(
                customization_root,
                &cand.sha256,
                ModRuntimeState::Failed,
                Some(err.clone()),
                None,
                probe.version.clone(),
                detected_build.clone(),
            );
            failed_hashes.push(cand.sha256.clone());
            if first_error.is_none() {
                first_error = Some(err);
            }
            continue;
        }

        match invoke_adapter_cli(
            &bin_path,
            AdapterCommand::ValidateCandidate {
                candidate: candidate_str.clone(),
                game_dir: game_dir.clone(),
                format: fmt.clone(),
                game_build: detected_build.clone(),
            },
        ) {
            Ok(raw) => {
                if let Some(json) = parse_cli_json(&raw) {
                    if json.valid == Some(false) {
                        let msg = json
                            .error
                            .or(json.message)
                            .unwrap_or_else(|| "Candidate rejected by adapter.".into());
                        record_mod_state_at(
                            customization_root,
                            &cand.sha256,
                            ModRuntimeState::Failed,
                            Some(msg.clone()),
                            None,
                            probe.version.clone(),
                            detected_build.clone(),
                        );
                        failed_hashes.push(cand.sha256.clone());
                        if first_error.is_none() {
                            first_error = Some(msg);
                        }
                        continue;
                    }
                }
                validated_candidates.push(cand);
            }
            Err(err) => {
                record_mod_state_at(
                    customization_root,
                    &cand.sha256,
                    ModRuntimeState::Failed,
                    Some(err.clone()),
                    None,
                    probe.version.clone(),
                    detected_build.clone(),
                );
                failed_hashes.push(cand.sha256.clone());
                if first_error.is_none() {
                    first_error = Some(err);
                }
            }
        }
    }

    if validated_candidates.is_empty() {
        return Ok(AdapterApplyOutcome {
            state: AdapterLifecycleState::Failed,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: vec![],
            failed_mod_hashes: failed_hashes,
            deferred_reason: None,
            game_overlay_directory: None,
            message: first_error.unwrap_or_else(|| "All candidate mods failed adapter validation.".into()),
        });
    }

    let staging_str = staging_dir.to_string_lossy().into_owned();
    let mut staged_candidates = Vec::new();
    for cand in validated_candidates {
        match invoke_adapter_cli(
            &bin_path,
            AdapterCommand::StageCandidate {
                candidate: cand.source_path.to_string_lossy().into_owned(),
                staging_dir: staging_str.clone(),
                game_dir: game_dir.clone(),
                mod_id: cand.sha256.clone(),
                format: cand.format.to_ascii_lowercase(),
            },
        ) {
            Ok(_) => {
                record_mod_state_at(
                    customization_root,
                    &cand.sha256,
                    ModRuntimeState::Staged,
                    None,
                    None,
                    probe.version.clone(),
                    detected_build.clone(),
                );
                staged_candidates.push(cand);
            }
            Err(err) => {
                record_mod_state_at(
                    customization_root,
                    &cand.sha256,
                    ModRuntimeState::Failed,
                    Some(err.clone()),
                    None,
                    probe.version.clone(),
                    detected_build.clone(),
                );
                failed_hashes.push(cand.sha256.clone());
                if first_error.is_none() {
                    first_error = Some(err);
                }
            }
        }
    }

    if staged_candidates.is_empty() {
        return Ok(AdapterApplyOutcome {
            state: AdapterLifecycleState::Failed,
            applied_in_game: false,
            applied_mod_hashes: vec![],
            deferred_mod_hashes: vec![],
            failed_mod_hashes: failed_hashes,
            deferred_reason: None,
            game_overlay_directory: None,
            message: first_error.unwrap_or_else(|| "External adapter failed while staging candidates.".into()),
        });
    }

    match invoke_adapter_cli(
        &bin_path,
        AdapterCommand::ActivateStaged {
            staging_dir: staging_str.clone(),
            game_dir: game_dir.clone(),
        },
    ) {
        Ok(raw) => {
            let overlay_dir = parse_cli_json(&raw)
                .and_then(|j| j.message)
                .filter(|_| false)
                .or_else(|| Some(game_dir.clone()));
            let applied_hashes: Vec<String> = staged_candidates
                .iter()
                .map(|c| c.sha256.clone())
                .collect();
            for h in &applied_hashes {
                record_mod_state_at(
                    customization_root,
                    h,
                    ModRuntimeState::Applied,
                    None,
                    None,
                    probe.version.clone(),
                    detected_build.clone(),
                );
            }

            let mut store = load_runtime_at(customization_root);
            store.active_staged_dir = Some(staging_str);
            store.active_game_dir = Some(game_dir.clone());
            store.last_action = Some("activate_staged".into());
            let summary = format!(
                "Activated {} custom mod(s) for League build {} via external adapter {}.",
                applied_hashes.len(),
                detected_build.as_deref().unwrap_or("unknown"),
                probe.version.as_deref().unwrap_or("")
            );
            store.last_action_message = Some(summary.clone());
            store.updated_at = Some(now_unix());
            let _ = save_runtime_at(customization_root, &store);

            // Persist latest verified hash/version on config cleanly.
            let mut updated_cfg = cfg;
            updated_cfg.last_verified_sha256 = probe.binary_sha256.clone();
            updated_cfg.last_verified_version = probe.version.clone();
            let _ = storage::write(&config_file_for_root(customization_root), &updated_cfg);

            Ok(AdapterApplyOutcome {
                state: AdapterLifecycleState::Applied,
                applied_in_game: true,
                applied_mod_hashes: applied_hashes,
                deferred_mod_hashes: vec![],
                failed_mod_hashes: failed_hashes,
                deferred_reason: None,
                game_overlay_directory: overlay_dir,
                message: summary,
            })
        }
        Err(err) => {
            for c in &staged_candidates {
                record_mod_state_at(
                    customization_root,
                    &c.sha256,
                    ModRuntimeState::Failed,
                    Some(err.clone()),
                    None,
                    probe.version.clone(),
                    detected_build.clone(),
                );
                failed_hashes.push(c.sha256.clone());
            }
            Ok(AdapterApplyOutcome {
                state: AdapterLifecycleState::Failed,
                applied_in_game: false,
                applied_mod_hashes: vec![],
                deferred_mod_hashes: vec![],
                failed_mod_hashes: failed_hashes,
                deferred_reason: None,
                game_overlay_directory: None,
                message: err,
            })
        }
    }
}

pub fn restore_defaults_via_adapter(
    app: &AppHandle,
    lcu_phase_hint: Option<&str>,
) -> Result<AdapterRestoreOutcome, String> {
    let root = storage::root(app)?;
    let opts = ProbeOptions {
        active_match_running: is_league_match_process_running() || !is_safe_gameflow_phase(lcu_phase_hint),
        ..ProbeOptions::default()
    };
    restore_defaults_via_adapter_at(&root, &opts)
}

pub(crate) fn restore_defaults_via_adapter_at(
    customization_root: &Path,
    opts: &ProbeOptions,
) -> Result<AdapterRestoreOutcome, String> {
    if opts.active_match_running {
        let reason = "Active League match running; deferring adapter stop and restore_defaults until EndOfGame or Lobby.".to_string();
        return Ok(AdapterRestoreOutcome {
            state: AdapterLifecycleState::Deferred,
            restored_in_game: false,
            deferred_reason: Some(reason.clone()),
            message: reason,
        });
    }

    let cfg = load_config_at(customization_root).unwrap_or_default();
    let store = load_runtime_at(customization_root);

    if !opts.platform_supported {
        let mut reset_store = store;
        for rec in reset_store.mods.values_mut() {
            if matches!(
                rec.state,
                ModRuntimeState::Applied | ModRuntimeState::Staged | ModRuntimeState::Deferred
            ) {
                rec.state = ModRuntimeState::SafeToStore;
            }
        }
        reset_store.active_staged_dir = None;
        reset_store.updated_at = Some(now_unix());
        let _ = save_runtime_at(customization_root, &reset_store);
        return Ok(AdapterRestoreOutcome {
            state: AdapterLifecycleState::UnsupportedPlatform,
            restored_in_game: false,
            deferred_reason: None,
            message: "Cleaned LAAP sandbox; external adapter restore_defaults applies on Windows.".into(),
        });
    }

    let discovered = discover_adapter_binary(&cfg, opts.allow_path_discovery)?;
    let Some((bin_path, discovery_source)) = discovered else {
        let mut reset_store = store;
        reset_store.mods.clear();
        reset_store.active_staged_dir = None;
        reset_store.updated_at = Some(now_unix());
        let _ = save_runtime_at(customization_root, &reset_store);
        return Ok(AdapterRestoreOutcome {
            state: AdapterLifecycleState::NotInstalled,
            restored_in_game: false,
            deferred_reason: None,
            message: "No external adapter configured; cleared LAAP sandbox state only.".into(),
        });
    };

    if let Some(pinned) = effective_expected_sha256(&cfg, &discovery_source) {
        let actual = compute_sha256_file(&bin_path)?;
        if !pinned.eq_ignore_ascii_case(&actual) {
            return Err("Refusing restore_defaults: adapter SHA-256 provenance mismatch.".into());
        }
    }

    let league_info = resolve_game_install_info_safe(customization_root, opts.lcu_build_hint.as_deref());
    let Some(game_dir) = store.active_game_dir.clone().or(league_info.league_path) else {
        return Ok(AdapterRestoreOutcome {
            state: AdapterLifecycleState::Unavailable,
            restored_in_game: false,
            deferred_reason: None,
            message: "League installation directory unavailable; cleared LAAP sandbox state only.".into(),
        });
    };
    if let Err(err) = validate_league_install_dir(Path::new(&game_dir)) {
        return Err(format!("Refusing restore_defaults on invalid League path: {err}"));
    }

    let _guard = acquire_adapter_lock(Duration::from_millis(500))?;

    // Best-effort `stop` before mandatory `restore_defaults`.
    let _ = invoke_adapter_cli(
        &bin_path,
        AdapterCommand::Stop {
            game_dir: game_dir.clone(),
        },
    );

    match invoke_adapter_cli(
        &bin_path,
        AdapterCommand::RestoreDefaults {
            game_dir: game_dir.clone(),
        },
    ) {
        Ok(raw) => {
            let mut reset_store = load_runtime_at(customization_root);
            for rec in reset_store.mods.values_mut() {
                if matches!(
                    rec.state,
                    ModRuntimeState::Applied | ModRuntimeState::Staged | ModRuntimeState::Deferred
                ) {
                    rec.state = ModRuntimeState::SafeToStore;
                    rec.last_error = None;
                    rec.deferred_reason = None;
                    rec.updated_at = now_unix();
                }
            }
            reset_store.active_staged_dir = None;
            reset_store.active_game_dir = None;
            reset_store.last_action = Some("restore_defaults".into());
            let detail = parse_cli_json(&raw)
                .and_then(|j| j.message)
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| "Stopped adapter and restored League defaults cleanly.".into());
            reset_store.last_action_message = Some(detail.clone());
            reset_store.updated_at = Some(now_unix());
            let _ = save_runtime_at(customization_root, &reset_store);

            Ok(AdapterRestoreOutcome {
                state: AdapterLifecycleState::Compatible,
                restored_in_game: true,
                deferred_reason: None,
                message: detail,
            })
        }
        Err(err) => {
            let mut err_store = load_runtime_at(customization_root);
            err_store.last_action = Some("restore_defaults_failed".into());
            err_store.last_action_message = Some(err.clone());
            err_store.updated_at = Some(now_unix());
            let _ = save_runtime_at(customization_root, &err_store);
            Ok(AdapterRestoreOutcome {
                state: AdapterLifecycleState::Failed,
                restored_in_game: false,
                deferred_reason: None,
                message: format!("External adapter restore_defaults failed: {err}"),
            })
        }
    }
}

pub fn validate_single_candidate_at(
    customization_root: &Path,
    cand: &AdapterCandidateSpec,
    opts: &ProbeOptions,
) -> Result<ModRuntimeEntry, String> {
    // Policy exclusion removed per user request (own risk). Keep structural validity checks below.

    if !cand.valid {
        let msg = "Archive failed static package safety check.".to_string();
        record_mod_state_at(
            customization_root,
            &cand.sha256,
            ModRuntimeState::Incompatible,
            Some(msg.clone()),
            None,
            None,
            opts.lcu_build_hint.clone(),
        );
        return Ok(ModRuntimeEntry {
            sha256: cand.sha256.clone(),
            state: ModRuntimeState::Incompatible,
            detail: msg,
            updated_at: Some(now_unix()),
        });
    }

    let probe = probe_adapter_at(customization_root, opts);
    if !probe.compatible {
        let detail = probe.detail;
        return Ok(ModRuntimeEntry {
            sha256: cand.sha256.clone(),
            state: ModRuntimeState::SafeToStore,
            detail,
            updated_at: Some(now_unix()),
        });
    }

    let Some(bin_path) = probe.binary_path.map(PathBuf::from) else {
        return Err("Adapter binary path missing.".into());
    };
    let Some(game_dir) = probe.league_install.league_path else {
        return Err("League install directory missing.".into());
    };
    let detected_build = probe.league_install.detected_build.clone();

    if !cand.supported_game_builds.is_empty() {
        if let Some(ref b) = detected_build {
            if !build_matches_supported(b, &cand.supported_game_builds) {
                let msg = format!(
                    "Mod declares supported builds [{}], incompatible with League build {}.",
                    cand.supported_game_builds.join(", "),
                    b
                );
                record_mod_state_at(
                    customization_root,
                    &cand.sha256,
                    ModRuntimeState::Incompatible,
                    Some(msg.clone()),
                    None,
                    probe.version,
                    detected_build,
                );
                return Ok(ModRuntimeEntry {
                    sha256: cand.sha256.clone(),
                    state: ModRuntimeState::Incompatible,
                    detail: msg,
                    updated_at: Some(now_unix()),
                });
            }
        }
    }

    let _guard = acquire_adapter_lock(Duration::from_millis(500))?;

    ensure_safe_candidate_entry(&cand.source_path)?;
    match invoke_adapter_cli(
        &bin_path,
        AdapterCommand::ValidateCandidate {
            candidate: cand.source_path.to_string_lossy().into_owned(),
            game_dir,
            format: cand.format.to_ascii_lowercase(),
            game_build: detected_build.clone(),
        },
    ) {
        Ok(raw) => {
            if let Some(json) = parse_cli_json(&raw) {
                if json.valid == Some(false) {
                    let msg = json
                        .error
                        .or(json.message)
                        .unwrap_or_else(|| "Adapter validation failed.".into());
                    record_mod_state_at(
                        customization_root,
                        &cand.sha256,
                        ModRuntimeState::Failed,
                        Some(msg.clone()),
                        None,
                        probe.version,
                        detected_build,
                    );
                    return Ok(ModRuntimeEntry {
                        sha256: cand.sha256.clone(),
                        state: ModRuntimeState::Failed,
                        detail: msg,
                        updated_at: Some(now_unix()),
                    });
                }
            }
            let detail = format!(
                "Validated against external adapter {} for build {}.",
                probe.version.as_deref().unwrap_or("CLI"),
                detected_build.as_deref().unwrap_or("unknown")
            );
            record_mod_state_at(
                customization_root,
                &cand.sha256,
                ModRuntimeState::AdapterReady,
                None,
                None,
                probe.version,
                detected_build,
            );
            Ok(ModRuntimeEntry {
                sha256: cand.sha256.clone(),
                state: ModRuntimeState::AdapterReady,
                detail,
                updated_at: Some(now_unix()),
            })
        }
        Err(err) => {
            record_mod_state_at(
                customization_root,
                &cand.sha256,
                ModRuntimeState::Failed,
                Some(err.clone()),
                None,
                probe.version,
                detected_build,
            );
            Ok(ModRuntimeEntry {
                sha256: cand.sha256.clone(),
                state: ModRuntimeState::Failed,
                detail: err,
                updated_at: Some(now_unix()),
            })
        }
    }
}

fn record_mod_state_at(
    customization_root: &Path,
    sha256: &str,
    state: ModRuntimeState,
    last_error: Option<String>,
    deferred_reason: Option<String>,
    adapter_version: Option<String>,
    game_build: Option<String>,
) {
    let mut store = load_runtime_at(customization_root);
    let now = now_unix();
    store.mods.insert(
        sha256.to_string(),
        ModRuntimeRecord {
            state,
            last_error,
            deferred_reason,
            adapter_version,
            game_build,
            updated_at: now,
        },
    );
    store.updated_at = Some(now);
    let _ = save_runtime_at(customization_root, &store);
}

pub fn compute_mod_runtime_entries_at(
    customization_root: &Path,
    candidates: &[AdapterCandidateSpec],
    probe: &AdapterStatusReport,
) -> Vec<ModRuntimeEntry> {
    let store = load_runtime_at(customization_root);
    let detected_build = probe.league_install.detected_build.as_deref();

    candidates
        .iter()
        .map(|cand| {
            // Policy exclusion removed per user request (own risk).
            if !cand.valid {
                return ModRuntimeEntry {
                    sha256: cand.sha256.clone(),
                    state: ModRuntimeState::Incompatible,
                    detail: "Failed archive safety validation.".into(),
                    updated_at: None,
                };
            }

            if !cand.supported_game_builds.is_empty() {
                if let Some(build) = detected_build {
                    if !build_matches_supported(build, &cand.supported_game_builds) {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: ModRuntimeState::Incompatible,
                            detail: format!(
                                "Mod build metadata [{}] mismatches League {}.",
                                cand.supported_game_builds.join(", "),
                                build
                            ),
                            updated_at: None,
                        };
                    }
                }
            }

            if let Some(rec) = store.mods.get(&cand.sha256) {
                match rec.state {
                    ModRuntimeState::Applied => {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: if probe.applied_in_game || probe.compatible {
                                ModRuntimeState::Applied
                            } else {
                                ModRuntimeState::Staged
                            },
                            detail: if probe.applied_in_game {
                                format!(
                                    "Applied via external adapter {}.",
                                    rec.adapter_version.as_deref().unwrap_or("")
                                )
                            } else {
                                "Previously applied; verify adapter status or re-apply.".into()
                            },
                            updated_at: Some(rec.updated_at),
                        };
                    }
                    ModRuntimeState::Deferred => {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: ModRuntimeState::Deferred,
                            detail: rec
                                .deferred_reason
                                .clone()
                                .unwrap_or_else(|| "Deferred until match ends.".into()),
                            updated_at: Some(rec.updated_at),
                        };
                    }
                    ModRuntimeState::Failed => {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: ModRuntimeState::Failed,
                            detail: rec
                                .last_error
                                .clone()
                                .unwrap_or_else(|| "Adapter validation/activation failed.".into()),
                            updated_at: Some(rec.updated_at),
                        };
                    }
                    ModRuntimeState::Staged => {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: ModRuntimeState::Staged,
                            detail: rec
                                .last_error
                                .clone()
                                .unwrap_or_else(|| "Staged in LAAP sandbox.".into()),
                            updated_at: Some(rec.updated_at),
                        };
                    }
                    ModRuntimeState::AdapterReady => {
                        if probe.compatible {
                            return ModRuntimeEntry {
                                sha256: cand.sha256.clone(),
                                state: ModRuntimeState::AdapterReady,
                                detail: format!(
                                    "Verified compatible with adapter {}.",
                                    probe.version.as_deref().unwrap_or("")
                                ),
                                updated_at: Some(rec.updated_at),
                            };
                        }
                    }
                    ModRuntimeState::Incompatible => {
                        return ModRuntimeEntry {
                            sha256: cand.sha256.clone(),
                            state: ModRuntimeState::Incompatible,
                            detail: rec
                                .last_error
                                .clone()
                                .unwrap_or_else(|| "Incompatible with current build/adapter.".into()),
                            updated_at: Some(rec.updated_at),
                        };
                    }
                    ModRuntimeState::SafeToStore | ModRuntimeState::Unverified => {}
                }
            }

            if probe.compatible && probe.consent_granted && probe.clearance_acknowledged {
                ModRuntimeEntry {
                    sha256: cand.sha256.clone(),
                    state: ModRuntimeState::AdapterReady,
                    detail: "Safe archive; ready for adapter validation and activation.".into(),
                    updated_at: None,
                }
            } else {
                ModRuntimeEntry {
                    sha256: cand.sha256.clone(),
                    state: ModRuntimeState::SafeToStore,
                    detail: if probe.compatible {
                        "Safe in library. Grant adapter consent & clearance to activate.".into()
                    } else {
                        "Safe in library (no compatible external adapter active).".into()
                    },
                    updated_at: None,
                }
            }
        })
        .collect()
}

pub fn doctor_check_summary(
    customization_root: &Path,
    opts: &ProbeOptions,
) -> (bool, String) {
    let probe = probe_adapter_at(customization_root, opts);
    let healthy = probe.compatible
        && probe.consent_granted
        && probe.clearance_acknowledged
        && probe.state.is_compatible_or_active();
    let build_info = probe
        .league_install
        .detected_build
        .as_deref()
        .unwrap_or("unknown");
    let ver_info = probe.version.as_deref().unwrap_or("none");
    let detail = format!(
        "{} (adapter: {}, League build: {}): {}",
        probe.state.as_summary(),
        ver_info,
        build_info,
        probe.detail
    );
    (healthy, detail)
}

pub fn pick_adapter_executable_dialog(app: &AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app
        .dialog()
        .file()
        .set_title("Select user-installed external game mod adapter CLI");
    #[cfg(windows)]
    {
        builder = builder.add_filter("Executable", &["exe"]);
    }
    let Some(picked) = builder.blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| "Selected file cannot be represented as a local filesystem path.".to_string())?;
    validate_adapter_binary_path(&path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn game_adapter_get_config(app: AppHandle) -> Result<GameAdapterConfig, String> {
    let root = storage::root(&app)?;
    load_config_at(&root)
}

#[tauri::command]
pub fn game_adapter_save_config(
    app: AppHandle,
    config: GameAdapterConfig,
) -> Result<GameAdapterConfig, String> {
    let root = storage::root(&app)?;
    save_config_at(&root, config)
}

#[tauri::command]
pub async fn game_adapter_pick_executable(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_adapter_executable_dialog(&app))
        .await
        .map_err(|e| format!("Adapter file picker failed: {e}"))?
}

#[tauri::command]
pub async fn game_adapter_probe(
    app: AppHandle,
    lcu_build_hint: Option<String>,
) -> Result<AdapterStatusReport, String> {
    tauri::async_runtime::spawn_blocking(move || probe_adapter(&app, lcu_build_hint.as_deref()))
        .await
        .map_err(|e| format!("Adapter probe task failed: {e}"))
}

#[tauri::command]
pub async fn game_adapter_validate_mod(
    app: AppHandle,
    sha256: String,
) -> Result<ModRuntimeEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage::root(&app)?;
        let cand = super::library::find_candidate_spec_for_sha(&root, &sha256)?;
        validate_single_candidate_at(&root, &cand, &ProbeOptions::default())
    })
    .await
    .map_err(|e| format!("Mod validation task failed: {e}"))?
}

#[tauri::command]
pub async fn game_adapter_get_mod_states(app: AppHandle) -> Result<Vec<ModRuntimeEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage::root(&app)?;
        let specs = super::library::all_candidate_specs(&root)?;
        let probe = probe_adapter_at(&root, &ProbeOptions::default());
        Ok(compute_mod_runtime_entries_at(&root, &specs, &probe))
    })
    .await
    .map_err(|e| format!("Runtime state query failed: {e}"))?
}

#[tauri::command]
pub async fn game_adapter_restore_defaults(app: AppHandle) -> Result<AdapterRestoreOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let phase = super::in_game_runner::current_gameflow_phase();
        restore_defaults_via_adapter(&app, phase.as_deref())
    })
    .await
    .map_err(|e| format!("Restore defaults task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as StdCommand;

    fn temp_root(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "laap-adapter-test-{}-{}",
            label,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn setup_fake_league(root: &Path, build: &str) -> PathBuf {
        let league = root.join("League of Legends");
        fs::create_dir_all(league.join("Game")).unwrap();
        fs::write(league.join("Game").join("League of Legends.exe"), b"MZ").unwrap();
        fs::write(league.join("LeagueClient.exe"), b"MZ").unwrap();
        fs::write(league.join("Game").join("version.txt"), format!("{build}\n")).unwrap();
        let cfg = serde_json::json!({
            "customGamePath": league.to_string_lossy().into_owned()
        });
        fs::write(
            root.join("game_path.json"),
            serde_json::to_vec_pretty(&cfg).unwrap(),
        )
        .unwrap();
        league
    }

    fn compile_mock_adapter(root: &Path, name: &str, body: &str) -> PathBuf {
        let src = root.join(format!("{name}.rs"));
        #[cfg(windows)]
        let bin = root.join(format!("{name}.exe"));
        #[cfg(not(windows))]
        let bin = root.join(name);

        let full_src = format!(
            r#"
use std::env;
use std::fs;
use std::path::Path;

fn main() {{
    let args: Vec<String> = env::args().collect();
    let sub = args.get(1).map(|s| s.as_str()).unwrap_or("");
{body}
}}
"#
        );
        fs::write(&src, full_src).unwrap();
        let out = StdCommand::new("rustc")
            .arg("-O")
            .arg(&src)
            .arg("-o")
            .arg(&bin)
            .output()
            .expect("rustc must be available to compile mock adapter binary");
        assert!(
            out.status.success(),
            "rustc failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        bin
    }

    fn happy_mock_body(build_pattern: &str, sleep_ms_on_status: u64) -> String {
        r####"
    match sub {
        "get_version" => println!("{}", r#"{"version":"2.4.0"}"#),
        "get_supported_game_build" => println!("{}", r#"{"supportedGameBuild":"__BUILD__"}"#),
        "list_supported_formats" => println!("{}", r#"{"formats":["fantome","modpkg","zip"]}"#),
        "validate_candidate" => println!("{}", r#"{"valid":true,"message":"Candidate OK"}"#),
        "stage_candidate" => {
            if let Some(pos) = args.iter().position(|a| a == "--staging-dir") {
                if let Some(dir) = args.get(pos + 1) {
                    let _ = fs::write(Path::new(dir).join("adapter_staged.flag"), "staged");
                }
            }
            println!("{}", r#"{"message":"Staged candidate"}"#);
        }
        "activate_staged" => {
            if let Some(pos) = args.iter().position(|a| a == "--game-dir") {
                if let Some(dir) = args.get(pos + 1) {
                    let _ = fs::write(Path::new(dir).join("adapter_active.flag"), "active");
                }
            }
            println!("{}", r#"{"applied":true,"message":"Activated staged overlay"}"#);
        }
        "status" => {
            let sleep_ms: u64 = __SLEEP__;
            if sleep_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
            }
            let active = args.iter().position(|a| a == "--game-dir")
                .and_then(|i| args.get(i + 1))
                .map(|d| Path::new(d).join("adapter_active.flag").exists())
                .unwrap_or(false);
            println!("{{\"applied\":{},\"activeMods\":[]}}", active);
        }
        "stop" => println!("{}", r#"{"message":"Stopped"}"#),
        "restore_defaults" => {
            if let Some(pos) = args.iter().position(|a| a == "--game-dir") {
                if let Some(dir) = args.get(pos + 1) {
                    let _ = fs::remove_file(Path::new(dir).join("adapter_active.flag"));
                }
            }
            println!("{}", r#"{"message":"Restored defaults"}"#);
        }
        other => {
            eprintln!("Unknown subcommand: {other}");
            std::process::exit(2);
        }
    }
"####
        .replace("__BUILD__", build_pattern)
        .replace("__SLEEP__", &sleep_ms_on_status.to_string())
    }

    #[test]
    fn rejects_shell_binaries_and_missing_adapter_reports_not_installed() {
        let _serial = test_serial_guard();
        let root = temp_root("not-installed");
        let _league = setup_fake_league(&root, "14.18.612.44");

        let shell_name = if cfg!(windows) {
            Path::new(r"C:\Windows\System32\cmd.exe")
        } else {
            Path::new("/bin/sh")
        };
        if shell_name.exists() {
            assert!(validate_adapter_binary_path(shell_name).is_err());
        }

        let probe = probe_adapter_at(
            &root,
            &ProbeOptions {
                platform_supported: true,
                active_match_running: false,
                lcu_build_hint: None,
                allow_path_discovery: false,
            },
        );
        assert_eq!(probe.state, AdapterLifecycleState::NotInstalled);
        assert!(!probe.available);
        let (doc_healthy, doc_detail) = doctor_check_summary(&root, &ProbeOptions {
            platform_supported: true,
            active_match_running: false,
            lcu_build_hint: None,
            allow_path_discovery: false,
        });
        assert!(!doc_healthy);
        assert!(doc_detail.contains("Not installed"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn probes_stages_activates_and_restores_mock_cli_adapter() {
        let _serial = test_serial_guard();
        let root = temp_root("happy");
        let league = setup_fake_league(&root, "14.18.612.44");
        let bin = compile_mock_adapter(&root, "mock_adapter", &happy_mock_body("14.18.*", 0));
        let bin_hash = compute_sha256_file(&bin).unwrap();

        save_config_at(
            &root,
            GameAdapterConfig {
                adapter_path: Some(bin.to_string_lossy().into_owned()),
                expected_sha256: Some(bin_hash.clone()),
                user_consent_granted: true,
                clearance_acknowledged: true,
                auto_apply_in_champ_select: true,
                ..Default::default()
            },
        )
        .unwrap();

        let opts = ProbeOptions {
            platform_supported: true,
            active_match_running: false,
            lcu_build_hint: None,
            allow_path_discovery: false,
        };
        let probe = probe_adapter_at(&root, &opts);
        assert_eq!(probe.state, AdapterLifecycleState::Compatible);
        assert!(probe.available);
        assert!(probe.compatible);
        assert_eq!(probe.version.as_deref(), Some("2.4.0"));
        assert_eq!(probe.binary_sha256.as_deref(), Some(bin_hash.as_str()));
        let (doc_healthy, doc_detail) = doctor_check_summary(&root, &opts);
        assert!(doc_healthy, "expected healthy doctor check, got: {doc_detail}");
        assert!(doc_detail.contains("2.4.0"));
        assert!(doc_detail.contains("14.18.612.44"));

        let staging_dir = root.join("staging");
        fs::create_dir_all(&staging_dir).unwrap();
        let mod_file = root.join("custom_ahri.fantome");
        fs::write(&mod_file, b"PK\x03\x04").unwrap();

        let cand = AdapterCandidateSpec {
            sha256: "a".repeat(64),
            name: "Ahri Custom".into(),
            format: "fantome".into(),
            source_path: mod_file.clone(),
            supported_game_builds: vec!["14.18".into()],
            contains_paid_riot_content: false,
            valid: true,
        };

        let applied = apply_candidates_via_adapter_at(&root, &staging_dir, &[cand.clone()], &opts)
            .unwrap();
        assert_eq!(applied.state, AdapterLifecycleState::Applied);
        assert!(applied.applied_in_game);
        assert!(league.join("adapter_active.flag").exists());

        let entries = compute_mod_runtime_entries_at(&root, &[cand.clone()], &probe_adapter_at(&root, &opts));
        assert_eq!(entries[0].state, ModRuntimeState::Applied);

        // Policy exclusion blocks metadata presets and paid Riot skins before CLI invocation.
        let forbidden = AdapterCandidateSpec {
            sha256: "b".repeat(64),
            name: "Paid Skin".into(),
            format: "fantome".into(),
            source_path: mod_file,
            supported_game_builds: vec![],
            contains_paid_riot_content: true,
            valid: true,
        };
        assert!(apply_candidates_via_adapter_at(&root, &staging_dir, &[forbidden], &opts).is_err());

        // Active match defers restore_defaults safely.
        let active_opts = ProbeOptions {
            active_match_running: true,
            ..opts.clone()
        };
        let deferred_restore = restore_defaults_via_adapter_at(&root, &active_opts).unwrap();
        assert_eq!(deferred_restore.state, AdapterLifecycleState::Deferred);
        assert!(!deferred_restore.restored_in_game);
        assert!(league.join("adapter_active.flag").exists());

        // Safe restore in Lobby cleans up active state.
        let restored = restore_defaults_via_adapter_at(&root, &opts).unwrap();
        assert!(restored.restored_in_game);
        assert!(!league.join("adapter_active.flag").exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn incompatible_build_wildcard_and_provenance_mismatch_are_rejected() {
        let _serial = test_serial_guard();
        let root = temp_root("compat");
        let _league = setup_fake_league(&root, "14.20.111.222");

        // Adapter supports 14.18 only + also test wildcard refusal.
        assert!(!build_matches_supported("14.20.111.222", &["*".into(), "any".into()]));
        assert!(build_matches_supported("14.20.111.222", &["14.20.*".into()]));

        let bin = compile_mock_adapter(&root, "mock_old", &happy_mock_body("14.18.*", 0));
        save_config_at(
            &root,
            GameAdapterConfig {
                adapter_path: Some(bin.to_string_lossy().into_owned()),
                expected_sha256: None,
                user_consent_granted: true,
                clearance_acknowledged: true,
                auto_apply_in_champ_select: false,
                ..Default::default()
            },
        )
        .unwrap();

        let opts = ProbeOptions {
            platform_supported: true,
            active_match_running: false,
            lcu_build_hint: None,
            allow_path_discovery: false,
        };
        let probe = probe_adapter_at(&root, &opts);
        assert_eq!(probe.state, AdapterLifecycleState::UnsupportedGameBuild);
        assert!(!probe.compatible);

        // Pinning a mismatched SHA-256 blocks the adapter.
        save_config_at(
            &root,
            GameAdapterConfig {
                adapter_path: Some(bin.to_string_lossy().into_owned()),
                expected_sha256: Some("0".repeat(64)),
                user_consent_granted: true,
                clearance_acknowledged: true,
                auto_apply_in_champ_select: false,
                ..Default::default()
            },
        )
        .unwrap();
        let blocked = probe_adapter_at(&root, &opts);
        assert_eq!(blocked.state, AdapterLifecycleState::BlockedByPolicy);

        // Unsupported platform returns UnsupportedPlatform on macOS/Linux.
        let mac = probe_adapter_at(
            &root,
            &ProbeOptions {
                platform_supported: false,
                ..opts
            },
        );
        assert_eq!(mac.state, AdapterLifecycleState::UnsupportedPlatform);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn consent_required_and_active_match_defers_apply() {
        let _serial = test_serial_guard();
        let root = temp_root("defer");
        let _league = setup_fake_league(&root, "14.19.1.2");
        let bin = compile_mock_adapter(&root, "mock_defer", &happy_mock_body("14.19.*", 0));

        // Consent NOT granted -> BlockedByPolicy.
        save_config_at(
            &root,
            GameAdapterConfig {
                adapter_path: Some(bin.to_string_lossy().into_owned()),
                user_consent_granted: false,
                clearance_acknowledged: false,
                ..Default::default()
            },
        )
        .unwrap();

        let opts = ProbeOptions {
            platform_supported: true,
            active_match_running: false,
            lcu_build_hint: None,
            allow_path_discovery: false,
        };
        let no_consent = probe_adapter_at(&root, &opts);
        assert_eq!(no_consent.state, AdapterLifecycleState::BlockedByPolicy);
        assert!(no_consent.compatible);

        // With consent + active match -> Deferred.
        save_config_at(
            &root,
            GameAdapterConfig {
                adapter_path: Some(bin.to_string_lossy().into_owned()),
                user_consent_granted: true,
                clearance_acknowledged: true,
                ..Default::default()
            },
        )
        .unwrap();
        let staging_dir = root.join("staging");
        fs::create_dir_all(&staging_dir).unwrap();
        let mod_file = root.join("custom.fantome");
        fs::write(&mod_file, b"PK\x03\x04").unwrap();
        let cand = AdapterCandidateSpec {
            sha256: "c".repeat(64),
            name: "Custom Mod".into(),
            format: "fantome".into(),
            source_path: mod_file,
            supported_game_builds: vec![],
            contains_paid_riot_content: false,
            valid: true,
        };
        let active_opts = ProbeOptions {
            active_match_running: true,
            ..opts
        };
        let outcome =
            apply_candidates_via_adapter_at(&root, &staging_dir, &[cand], &active_opts).unwrap();
        assert_eq!(outcome.state, AdapterLifecycleState::Deferred);
        assert!(!outcome.applied_in_game);
        assert_eq!(outcome.deferred_mod_hashes.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn timeout_kills_hung_adapter_process() {
        let root = temp_root("timeout");
        let league = setup_fake_league(&root, "14.19.1.2");
        let bin = compile_mock_adapter(&root, "mock_hang", &happy_mock_body("14.19.*", 3000));

        let err = invoke_adapter_cli_with_timeout(
            &bin,
            AdapterCommand::Status {
                game_dir: league.to_string_lossy().into_owned(),
            },
            Duration::from_millis(120),
        )
        .unwrap_err();
        assert!(err.contains("timed out"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discovers_bundled_sidecar_before_path_fallback() {
        let _serial = test_serial_guard();
        let root = temp_root("bundled");
        let bundled_dir = root.join("adapters");
        fs::create_dir_all(&bundled_dir).unwrap();
        let bin = compile_mock_adapter(&bundled_dir, "league-mod-adapter", &happy_mock_body("14.19.*", 0));

        let (found_path, found_source) = discover_adapter_binary_with_bundled(
            &GameAdapterConfig::default(),
            true,
            &[bundled_dir.clone()],
        )
        .unwrap()
        .expect("bundled adapter should be discovered automatically");

        assert_eq!(found_path, bin);
        assert_eq!(found_source, "bundled");

        let _ = fs::remove_dir_all(&root);
    }
}
