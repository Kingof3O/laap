//! Zero-interaction bootstrap for skin/customization mode.
//!
//! Ensures League path, managed adapter config, runner/bridge defaults, and
//! companion readiness are configured without user clicks. Provisioning of the
//! managed patcher backend is best-effort and reported with live progress.

use super::{client_bridge, game_adapter, game_path, in_game_runner, storage};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::AppHandle;

const SEVENZ_MAGIC: [u8; 6] = [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C];
const MAX_DOWNLOAD_BYTES: u64 = 160 * 1024 * 1024;
const MAX_EXTRACT_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
const MAX_EXTRACT_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES: usize = 4096;

pub(crate) const LTK_PATCHER_DIR_NAME: &str = "ltk-patcher";
pub(crate) const LTK_HOST_EXE_NAME: &str = "ltk_patcher_host.exe";
pub(crate) const LTK_HOOK_DLL_NAME: &str = "ltk_patcher_dll.dll";
pub(crate) const LTK_STAGE_META_FILE: &str = "ltk_patcher_stage.json";
const LTK_SETUP_DOWNLOAD_URL: &str =
    "https://github.com/LeagueToolkit/ltk-manager/releases/latest/download/LTK.Manager_x64-setup.exe";

/// Prevents background auto-provisioning from repeatedly re-triggering UAC prompts
/// in the same process after one automatic attempt or user cancellation.
static UAC_AUTO_ATTEMPTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionProgress {
    pub state: String,
    pub progress_pct: Option<u8>,
    pub detail: Option<String>,
}

static PROVISION_PROGRESS: OnceLock<Mutex<ProvisionProgress>> = OnceLock::new();
static PROVISION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn progress_store() -> &'static Mutex<ProvisionProgress> {
    PROVISION_PROGRESS.get_or_init(|| {
        Mutex::new(ProvisionProgress {
            state: "idle".into(),
            progress_pct: None,
            detail: None,
        })
    })
}

fn set_provision_progress(state: &str, pct: Option<u8>, detail: impl Into<String>) {
    if let Ok(mut guard) = progress_store().lock() {
        *guard = ProvisionProgress {
            state: state.to_string(),
            progress_pct: pct,
            detail: Some(detail.into()),
        };
    }
}

fn current_provision_progress() -> ProvisionProgress {
    progress_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| ProvisionProgress {
            state: "idle".into(),
            progress_pct: None,
            detail: None,
        })
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapStatus {
    pub ok: bool,
    pub league_detected: bool,
    pub adapter_configured: bool,
    pub managed_backend_ready: bool,
    pub runner_auto_apply_enabled: bool,
    pub detail: String,
    /// One-time setup/provisioning in progress or required (e.g. backend download).
    pub setup_needed: bool,
    pub provision_state: String,
    pub provision_progress_pct: Option<u8>,
    pub provision_detail: Option<String>,
    pub pengu_detected: bool,
    pub pengu_plugin_installed: bool,
    pub adapter_path: Option<String>,
    pub league_path: Option<String>,
    pub backend_kind: String,
    pub ltk_patcher_ready: bool,
    pub action_required: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LtkStageMeta {
    pub host_sha256: String,
    pub dll_sha256: String,
    pub dll_version: Option<String>,
    pub dll_eol: Option<u32>,
    pub source_host_path: Option<String>,
    pub source_dll_path: Option<String>,
    pub updated_at_unix: u64,
}

#[derive(Clone, Debug)]
struct LtkInstallPaths {
    host_exe: PathBuf,
    manager_exe: Option<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct DeliveredLtkDll {
    path: PathBuf,
    sha256: String,
    version: Option<String>,
    eol: Option<u32>,
    is_expired: bool,
}

#[derive(Debug, Deserialize)]
struct LtkDeliveryStateFile {
    #[serde(default)]
    channels: BTreeMap<String, LtkDeliveryCachedChannel>,
}

#[derive(Debug, Deserialize)]
struct LtkDeliveryCachedChannel {
    envelope: LtkDeliveryEnvelope,
}

#[derive(Debug, Deserialize)]
struct LtkDeliveryEnvelope {
    manifest: String,
}

#[derive(Debug, Deserialize)]
struct LtkDeliveryManifest {
    schema: u32,
    release: LtkDeliveryRelease,
    #[serde(default)]
    revoked: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LtkDeliveryRelease {
    version: String,
    digest: String,
    size: u64,
    eol: u32,
}

enum LtkStageDiscovery {
    Ready,
    NeedsDllSync {
        manager_exe: PathBuf,
        expired: bool,
    },
    NeedsInstall {
        hint: String,
    },
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn is_managed_adapter_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.contains("adapters")
        && (lower.contains("mod-tools")
            || lower.contains("ltk-patcher")
            || lower.contains("laap-adapter"))
}

fn is_legacy_managed_modtools_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.contains("adapters")
        && (lower.ends_with("mod-tools.exe") || lower.ends_with("mod-tools"))
}

pub(crate) fn managed_ltk_dir(root: &Path) -> PathBuf {
    root.join("adapters").join(LTK_PATCHER_DIR_NAME)
}

pub(crate) fn managed_ltk_host_path(root: &Path) -> PathBuf {
    managed_ltk_dir(root).join(LTK_HOST_EXE_NAME)
}

pub(crate) fn managed_ltk_stage_meta(root: &Path) -> Option<LtkStageMeta> {
    storage::read::<LtkStageMeta>(&managed_ltk_dir(root).join(LTK_STAGE_META_FILE), 64 * 1024)
        .ok()
        .flatten()
}

pub(crate) fn managed_modtools_exe_name() -> &'static str {
    if cfg!(windows) {
        "mod-tools.exe"
    } else {
        "mod-tools"
    }
}

pub(crate) fn managed_modtools_ready(dir: &Path) -> bool {
    let exe = dir.join(managed_modtools_exe_name());
    if !exe.is_file() {
        return false;
    }
    #[cfg(windows)]
    {
        if !dir.join("cslol-dll.dll").is_file() {
            return false;
        }
    }
    true
}

fn copy_file_atomic_if_changed(src: &Path, dst: &Path) -> Result<String, String> {
    let src_hash = game_adapter::compute_sha256_file(src)?;
    if dst.is_file() {
        if let Ok(dst_hash) = game_adapter::compute_sha256_file(dst) {
            if dst_hash.eq_ignore_ascii_case(&src_hash) {
                return Ok(src_hash);
            }
        }
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create '{}': {e}", parent.display()))?;
    }
    let fname = dst
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let tmp = dst.with_file_name(format!(".tmp_{fname}"));
    fs::copy(src, &tmp).map_err(|e| format!("Failed copying '{}': {e}", src.display()))?;
    if dst.exists() {
        let _ = fs::remove_file(dst);
    }
    fs::rename(&tmp, dst).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed staging '{}': {e}", dst.display())
    })?;
    Ok(src_hash)
}

#[cfg(windows)]
fn discover_ltk_install_in_dirs(extra_dirs: &[PathBuf]) -> Option<LtkInstallPaths> {
    let mut dirs: Vec<PathBuf> = extra_dirs.to_vec();
    if let Some(pf) = std::env::var_os("ProgramFiles") {
        dirs.push(PathBuf::from(pf).join("LTK Manager"));
    }
    dirs.push(PathBuf::from(r"C:\Program Files\LTK Manager"));
    if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
        dirs.push(PathBuf::from(pf86).join("LTK Manager"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let base = PathBuf::from(local);
        dirs.push(base.join("Programs").join("LTK Manager"));
        dirs.push(base.join("LTK Manager"));
    }

    use winreg::enums::*;
    use winreg::RegKey;
    for (hive, sub) in [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ] {
        let root_key = RegKey::predef(hive);
        if let Ok(uninstall) = root_key.open_subkey(sub) {
            for name in uninstall.enum_keys().flatten() {
                if let Ok(item) = uninstall.open_subkey(&name) {
                    let display_name: String = item.get_value("DisplayName").unwrap_or_default();
                    let loc: String = item.get_value("InstallLocation").unwrap_or_default();
                    if !loc.trim().is_empty()
                        && (display_name.to_ascii_lowercase().contains("ltk manager")
                            || name.to_ascii_lowercase().contains("ltk"))
                    {
                        dirs.push(PathBuf::from(loc.trim().trim_matches('"')));
                    }
                }
            }
        }
    }

    find_ltk_install_in(&dirs)
}

fn find_ltk_manager_exe(dir: &Path) -> Option<PathBuf> {
    ["ltk-manager.exe", "LTK Manager.exe"]
        .into_iter()
        .map(|name| dir.join(name))
        .find(|p| p.is_file())
}

fn find_ltk_install_in(dirs: &[PathBuf]) -> Option<LtkInstallPaths> {
    for dir in dirs {
        let host = dir.join(LTK_HOST_EXE_NAME);
        if host.is_file() {
            return Some(LtkInstallPaths {
                host_exe: host,
                manager_exe: find_ltk_manager_exe(dir),
            });
        }
    }
    None
}

#[cfg(not(windows))]
fn discover_ltk_install_in_dirs(extra_dirs: &[PathBuf]) -> Option<LtkInstallPaths> {
    find_ltk_install_in(extra_dirs)
}

fn collect_ltk_patcher_dirs(extra_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = extra_dirs.to_vec();
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let app_base = PathBuf::from(appdata).join("dev.leaguetoolkit.manager");
            if let Ok(settings_raw) = fs::read_to_string(app_base.join("settings.json")) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&settings_raw) {
                    for key in ["modStoragePath", "mod_storage_path"] {
                        if let Some(custom) = val
                            .pointer(&format!("/config/{key}"))
                            .or_else(|| val.get(key))
                            .and_then(|v| v.as_str())
                        {
                            let trimmed = custom.trim();
                            if !trimmed.is_empty() {
                                dirs.push(PathBuf::from(trimmed).join("patcher"));
                            }
                        }
                    }
                }
            }
            dirs.push(app_base.join("patcher"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(
                PathBuf::from(local)
                    .join("dev.leaguetoolkit.manager")
                    .join("patcher"),
            );
        }
    }
    dirs
}

fn is_hex64(name: &str) -> bool {
    name.len() == 64
        && name
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f' | b'A'..=b'F'))
}

fn parse_delivery_json_and_pick_dll(
    patcher_dir: &Path,
    now_secs: u64,
) -> Option<DeliveredLtkDll> {
    let delivery_path = patcher_dir.join("delivery.json");
    if delivery_path.is_file() {
        if let Ok(text) = fs::read_to_string(&delivery_path) {
            if let Ok(state) = serde_json::from_str::<LtkDeliveryStateFile>(&text) {
                let mut decoded: BTreeMap<String, LtkDeliveryManifest> = BTreeMap::new();
                let mut revoked: HashSet<String> = HashSet::new();
                for (ch, entry) in &state.channels {
                    let Ok(bytes) =
                        base64::engine::general_purpose::STANDARD.decode(entry.envelope.manifest.trim())
                    else {
                        continue;
                    };
                    let Ok(manifest) = serde_json::from_slice::<LtkDeliveryManifest>(&bytes) else {
                        continue;
                    };
                    if manifest.schema != 1 {
                        continue;
                    }
                    for r in &manifest.revoked {
                        revoked.insert(r.to_ascii_lowercase());
                    }
                    decoded.insert(ch.to_ascii_lowercase(), manifest);
                }

                let mut channel_order: Vec<String> = vec!["stable".into(), "beta".into()];
                for key in decoded.keys() {
                    if !channel_order.contains(key) {
                        channel_order.push(key.clone());
                    }
                }

                let mut expired_fallback: Option<DeliveredLtkDll> = None;
                for ch in channel_order {
                    let Some(m) = decoded.get(&ch) else { continue };
                    let digest = m.release.digest.to_ascii_lowercase();
                    if !is_hex64(&digest) || revoked.contains(&digest) {
                        continue;
                    }
                    let dll_path = patcher_dir.join(&digest).join(LTK_HOOK_DLL_NAME);
                    if !dll_path.is_file() {
                        continue;
                    }
                    let meta_len = fs::metadata(&dll_path).map(|md| md.len()).unwrap_or(0);
                    if m.release.size > 0 && meta_len != m.release.size {
                        continue;
                    }
                    let Ok(actual_sha) = game_adapter::compute_sha256_file(&dll_path) else {
                        continue;
                    };
                    if !actual_sha.eq_ignore_ascii_case(&digest) {
                        continue;
                    }
                    let is_expired = now_secs > u64::from(m.release.eol);
                    let candidate = DeliveredLtkDll {
                        path: dll_path,
                        sha256: actual_sha,
                        version: Some(m.release.version.clone()),
                        eol: Some(m.release.eol),
                        is_expired,
                    };
                    if !is_expired {
                        return Some(candidate);
                    }
                    if expired_fallback.is_none() {
                        expired_fallback = Some(candidate);
                    }
                }
                if let Some(exp) = expired_fallback {
                    return Some(exp);
                }
            }
        }
    }

    // Fallback: inspect <64-hex>/ltk_patcher_dll.dll sorted by newest mtime.
    let entries = fs::read_dir(patcher_dir).ok()?;
    let mut best: Option<(SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let Some(fname) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_hex64(fname) {
            continue;
        }
        let dll = p.join(LTK_HOOK_DLL_NAME);
        if dll.is_file() {
            let mtime = fs::metadata(&dll)
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH);
            if best.as_ref().is_none_or(|(t, _)| mtime > *t) {
                best = Some((mtime, dll));
            }
        }
    }
    if let Some((_, dll)) = best {
        if let Ok(sha256) = game_adapter::compute_sha256_file(&dll) {
            return Some(DeliveredLtkDll {
                path: dll,
                sha256,
                version: None,
                eol: None,
                is_expired: false,
            });
        }
    }
    None
}

fn find_best_delivered_dll_in_dirs(
    dirs: &[PathBuf],
    now_secs: u64,
) -> Option<DeliveredLtkDll> {
    let mut expired_fallback: Option<DeliveredLtkDll> = None;
    for dir in dirs {
        if !dir.is_dir() {
            continue;
        }
        if let Some(cand) = parse_delivery_json_and_pick_dll(dir, now_secs) {
            if !cand.is_expired {
                return Some(cand);
            }
            if expired_fallback.is_none() {
                expired_fallback = Some(cand);
            }
        }
    }
    expired_fallback
}

fn stage_ltk_pair_at(
    root: &Path,
    host_src: &Path,
    dll: &DeliveredLtkDll,
) -> Result<LtkStageMeta, String> {
    let ltk_dir = managed_ltk_dir(root);
    fs::create_dir_all(&ltk_dir).map_err(|e| format!("Cannot create ltk-patcher dir: {e}"))?;
    let host_dst = ltk_dir.join(LTK_HOST_EXE_NAME);
    let dll_dst = ltk_dir.join(LTK_HOOK_DLL_NAME);

    let host_sha256 = copy_file_atomic_if_changed(host_src, &host_dst)?;
    let dll_sha256 = copy_file_atomic_if_changed(&dll.path, &dll_dst)?;
    let meta = LtkStageMeta {
        host_sha256,
        dll_sha256,
        dll_version: dll.version.clone(),
        dll_eol: dll.eol,
        source_host_path: Some(host_src.to_string_lossy().into_owned()),
        source_dll_path: Some(dll.path.to_string_lossy().into_owned()),
        updated_at_unix: now_unix_secs(),
    };
    let _ = storage::write(&ltk_dir.join(LTK_STAGE_META_FILE), &meta);
    Ok(meta)
}

fn try_stage_installed_ltk_patcher(
    root: &Path,
    extra_install_dirs: &[PathBuf],
    extra_patcher_dirs: &[PathBuf],
    now_secs: u64,
) -> LtkStageDiscovery {
    let staged_host = managed_ltk_host_path(root);
    let staged_dll = managed_ltk_dir(root).join(LTK_HOOK_DLL_NAME);
    let install = discover_ltk_install_in_dirs(extra_install_dirs);
    let patcher_dirs = collect_ltk_patcher_dirs(extra_patcher_dirs);
    let delivered = find_best_delivered_dll_in_dirs(&patcher_dirs, now_secs);

    let host_source = install
        .as_ref()
        .map(|i| i.host_exe.clone())
        .or_else(|| staged_host.is_file().then(|| staged_host.clone()));

    if let (Some(host_src), Some(dll)) = (host_source.as_ref(), delivered.as_ref()) {
        if !dll.is_expired {
            if stage_ltk_pair_at(root, host_src, dll).is_ok() {
                return LtkStageDiscovery::Ready;
            }
        }
    }

    // Check already-staged copy in case system delivery dir wasn't visible in sandboxed/custom setups.
    if staged_host.is_file() && staged_dll.is_file() {
        let meta = managed_ltk_stage_meta(root).unwrap_or_default();
        let stage_expired = meta
            .dll_eol
            .is_some_and(|eol| now_secs > u64::from(eol));
        if !stage_expired && delivered.as_ref().is_none_or(|d| !d.is_expired) {
            return LtkStageDiscovery::Ready;
        }
    }

    if let Some(inst) = install {
        if let Some(manager_exe) = inst.manager_exe {
            let expired = delivered.is_some_and(|d| d.is_expired)
                || managed_ltk_stage_meta(root)
                    .and_then(|m| m.dll_eol)
                    .is_some_and(|eol| now_secs > u64::from(eol));
            return LtkStageDiscovery::NeedsDllSync {
                manager_exe,
                expired,
            };
        }
    }

    LtkStageDiscovery::NeedsInstall {
        hint: "Official LTK Manager is not installed yet; install it once so LAAP can stage signed ltk_patcher_host.exe + ltk_patcher_dll.dll.".into(),
    }
}

#[cfg(windows)]
pub(crate) fn is_current_process_elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 || token.is_null() {
            return false;
        }
        let mut elev = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut ret_len: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            (&mut elev as *mut TOKEN_ELEVATION).cast(),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        let _ = CloseHandle(token);
        ok != 0 && elev.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub(crate) fn is_current_process_elevated() -> bool {
    false
}

#[cfg(windows)]
pub(crate) fn check_elevation_mismatch(league_path: Option<&str>) -> Option<String> {
    if is_current_process_elevated() {
        return Some(
            "LAAP is running as Administrator; LTK Patcher requires running unelevated (matching League of Legends)."
                .into(),
        );
    }
    let league_lower = league_path.map(|p| p.to_ascii_lowercase());
    use winreg::enums::*;
    use winreg::RegKey;
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        if let Ok(layers) =
            root.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers")
        {
            for (val_name, val) in layers.enum_values().flatten() {
                let exe_lower = val_name.to_ascii_lowercase();
                let matches_league_exe = exe_lower.ends_with("league of legends.exe")
                    || exe_lower.ends_with("leagueclient.exe");
                if !matches_league_exe {
                    continue;
                }
                if let Some(ref lp) = league_lower {
                    if !exe_lower.contains(lp.trim_end_matches(['\\', '/'])) {
                        continue;
                    }
                }
                let data_str = val.to_string().to_ascii_uppercase();
                if data_str.contains("RUNASADMIN") {
                    return Some(format!(
                        "Windows compatibility flag RUNASADMIN is set on '{val_name}'. Disable 'Run this program as an administrator' in its Properties -> Compatibility tab so LTK Patcher can attach unelevated."
                    ));
                }
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub(crate) fn check_elevation_mismatch(_league_path: Option<&str>) -> Option<String> {
    None
}

fn sync_hashes_dictionary_from_managed(root: &Path, adapters_dir: &Path) {
    let src = adapters_dir.join("hashes.game.txt");
    if !src.is_file() {
        return;
    }
    let dst_dir = root.join("wad_hashes");
    let dst = dst_dir.join("hashes.game.txt");
    let needs_copy = match (fs::metadata(&src), fs::metadata(&dst)) {
        (Ok(sm), Ok(dm)) => sm.len() != dm.len() && sm.len() > 0,
        (Ok(sm), Err(_)) => sm.len() > 0,
        _ => false,
    };
    if needs_copy {
        let _ = fs::create_dir_all(&dst_dir);
        let _ = fs::copy(&src, &dst);
    }
}

fn build_bootstrap_status_with_discovery(
    root: &Path,
    extra_install_dirs: &[PathBuf],
    extra_patcher_dirs: &[PathBuf],
) -> BootstrapStatus {
    let mut detail_parts: Vec<String> = Vec::new();
    let now_secs = now_unix_secs();

    // 1) League install detection (best-effort).
    let install = game_path::resolve_game_install_info_at(&root.join("game_path.json"), None);
    let league_detected = install.is_detected;
    if league_detected {
        detail_parts.push("League install detected".into());
    } else {
        detail_parts.push("League install not detected yet".into());
    }

    // 2) Adapter config: auto-consent + auto-apply for zero-interaction flow.
    let mut cfg = game_adapter::load_config_at(root).unwrap_or_default();
    cfg.user_consent_granted = true;
    cfg.clearance_acknowledged = true;
    cfg.auto_apply_in_champ_select = true;

    let modtools_dir = root.join("adapters").join("mod-tools");
    let modtools_present = managed_modtools_ready(&modtools_dir);
    if modtools_present || modtools_dir.join("hashes.game.txt").is_file() {
        sync_hashes_dictionary_from_managed(root, &modtools_dir);
    }

    let ltk_discovery =
        try_stage_installed_ltk_patcher(root, extra_install_dirs, extra_patcher_dirs, now_secs);
    let ltk_patcher_ready = matches!(ltk_discovery, LtkStageDiscovery::Ready);

    let configured_missing = cfg
        .adapter_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some_and(|p| !Path::new(p).is_file());
    if configured_missing {
        cfg.adapter_path = None;
    }

    // Migrate legacy cslol adapters/mod-tools/mod-tools.exe automatically once LTK Patcher is ready.
    if ltk_patcher_ready
        && (cfg.adapter_path.is_none()
            || cfg
                .adapter_path
                .as_deref()
                .is_some_and(is_legacy_managed_modtools_path))
    {
        cfg.adapter_path = Some(managed_ltk_host_path(root).to_string_lossy().into_owned());
        detail_parts.push("LTK patcher backend ready".into());
    } else if cfg.adapter_path.is_none() {
        if let Ok(Some((found, _src))) = game_adapter::discover_adapter_binary_at(root, &cfg, true)
        {
            cfg.adapter_path = Some(found.to_string_lossy().into_owned());
            detail_parts.push("Discovered external patcher backend".into());
        } else {
            detail_parts.push("Managed LTK patcher runtime setup needed".into());
        }
    }

    let adapter_path = cfg.adapter_path.clone();
    let adapter_configured = adapter_path
        .as_deref()
        .map(str::trim)
        .is_some_and(|p| !p.is_empty() && Path::new(p).is_file());
    let _ = game_adapter::save_config_at(root, cfg);

    let using_legacy_modtools = adapter_path
        .as_deref()
        .is_some_and(is_legacy_managed_modtools_path);
    let elevation_issue = check_elevation_mismatch(install.league_path.as_deref());

    let backend_kind = if ltk_patcher_ready
        && adapter_path
            .as_deref()
            .is_some_and(|p| p.to_ascii_lowercase().contains("ltk_patcher_host"))
    {
        "ltk-patcher".to_string()
    } else if adapter_configured && !is_managed_adapter_path(adapter_path.as_deref().unwrap_or_default()) {
        "external".to_string()
    } else if using_legacy_modtools {
        "mod-tools-legacy".to_string()
    } else {
        "none".to_string()
    };

    let managed_backend_ready = if cfg!(windows) {
        (ltk_patcher_ready || backend_kind == "external")
            && adapter_configured
            && elevation_issue.is_none()
    } else {
        adapter_configured
    };

    if using_legacy_modtools && !ltk_patcher_ready {
        detail_parts.push(
            "Legacy cslol-tools (Apr 2026) cannot inject into live League; LTK Patcher setup needed".into(),
        );
    } else if let Some(ref elev) = elevation_issue {
        detail_parts.push(elev.clone());
    }

    // 3) Runner config: enable monitor & auto-apply by default.
    let runner_cfg_path = root.join(in_game_runner::CONFIG_FILE);
    let mut runner_cfg: in_game_runner::InGameRunnerConfig = storage::read(&runner_cfg_path, 1024 * 16)
        .unwrap_or(None)
        .unwrap_or_default();
    if !runner_cfg.monitor_enabled || !runner_cfg.auto_apply_mods {
        runner_cfg.monitor_enabled = true;
        runner_cfg.auto_apply_mods = true;
        let _ = storage::write(&runner_cfg_path, &runner_cfg);
    }

    // 4) Client bridge + Pengu Loader zero-interaction setup (safe in tests: does not bind sockets).
    let mut pengu_detected = false;
    let mut pengu_plugin_installed = false;
    if let Ok(mut bcfg) = client_bridge::load_or_init_config_at(root) {
        let mut bdirty = false;
        if !bcfg.enabled {
            bcfg.enabled = true;
            bdirty = true;
        }
        if !bcfg.plugin_consent_granted {
            bcfg.plugin_consent_granted = true;
            bdirty = true;
        }
        if bdirty {
            let _ = client_bridge::save_config_at(root, &bcfg);
        }
        let pengu = client_bridge::detect_pengu_loader_at(bcfg.custom_plugins_dir.as_deref());
        pengu_detected = pengu.pengu_detected;
        let receipt_needs_refresh = bcfg.receipt.as_ref().is_some_and(|r| {
            let p = Path::new(&r.plugins_dir).join("laap-companion").join("index.js");
            match fs::read_to_string(&p) {
                Ok(existing) => existing != client_bridge::render_companion_plugin_js(),
                Err(_) => true,
            }
        });
        if pengu_detected && (bcfg.receipt.is_none() || receipt_needs_refresh) {
            if let Ok(st) =
                client_bridge::install_companion_plugin_at(root, bcfg.custom_plugins_dir.as_deref())
            {
                pengu_plugin_installed = st.plugin_installed;
            }
        } else if let Some(ref r) = bcfg.receipt {
            pengu_plugin_installed = Path::new(&r.plugins_dir)
                .join("laap-companion")
                .join("index.js")
                .is_file();
        }
    }

    let mut progress = current_provision_progress();
    let mut action_required = None;

    if let Some(ref elev) = elevation_issue {
        action_required = Some("elevation_mismatch".into());
        progress.state = "action_required".into();
        progress.detail = Some(elev.clone());
    } else if managed_backend_ready {
        progress.state = "ready".into();
        progress.progress_pct = Some(100);
        if progress.detail.is_none() || progress.state == "ready" {
            let ver = managed_ltk_stage_meta(root)
                .and_then(|m| m.dll_version)
                .unwrap_or_else(|| "staged".into());
            progress.detail = Some(if backend_kind == "ltk-patcher" {
                format!("Managed LTK patcher ready ({ver}).")
            } else {
                "External patcher backend ready.".into()
            });
        }
    } else {
        match ltk_discovery {
            LtkStageDiscovery::NeedsDllSync { expired, .. } => {
                action_required = Some("sync_ltk_dll".into());
                if progress.state == "ready" || progress.state == "idle" {
                    progress.state = "setup_needed".into();
                    progress.progress_pct = None;
                    progress.detail = Some(if expired {
                        "LTK Manager is installed, but its patcher DLL expired; syncing via LTK Manager is needed.".into()
                    } else {
                        "LTK Manager is installed; syncing signed ltk_patcher_dll.dll is needed.".into()
                    });
                }
            }
            LtkStageDiscovery::NeedsInstall { hint } => {
                action_required = Some(if progress.state == "action_required" {
                    "confirm_uac".into()
                } else {
                    "install_ltk_manager".into()
                });
                if progress.state == "ready" || progress.state == "idle" {
                    progress.state = "setup_needed".into();
                    progress.progress_pct = None;
                    progress.detail = Some(hint);
                }
            }
            LtkStageDiscovery::Ready => {}
        }
    }

    let setup_needed = !managed_backend_ready;

    BootstrapStatus {
        ok: league_detected || managed_backend_ready,
        league_detected,
        adapter_configured,
        managed_backend_ready,
        runner_auto_apply_enabled: runner_cfg.auto_apply_mods,
        setup_needed,
        detail: detail_parts.join("; "),
        provision_state: progress.state,
        provision_progress_pct: progress.progress_pct,
        provision_detail: progress.detail,
        pengu_detected,
        pengu_plugin_installed,
        adapter_path,
        league_path: install.league_path,
        backend_kind,
        ltk_patcher_ready,
        action_required,
    }
}

/// Idempotent, no-UI bootstrap. Safe to call on startup.
pub fn ensure_bootstrapped_at(root: &Path) -> BootstrapStatus {
    build_bootstrap_status_with_discovery(root, &[], &[])
}

#[tauri::command]
pub fn customization_bootstrap_status(app: AppHandle) -> Result<BootstrapStatus, String> {
    let root = storage::root(&app)?;
    Ok(ensure_bootstrapped_at(&root))
}

/// Run bootstrap and, if League/bridge are available, start monitoring in background-friendly way.
#[tauri::command]
pub fn customization_bootstrap_ensure(app: AppHandle) -> Result<BootstrapStatus, String> {
    let root = storage::root(&app)?;
    let status = ensure_bootstrapped_at(&root);
    // Best-effort: ensure loopback bridge is running (ignore "already running"/bind errors).
    let _ = super::client_bridge::client_bridge_start(app.clone());
    // Best-effort: enable/start runner monitor (ignore errors like "already running").
    let _ = super::in_game_runner::in_game_runner_set_enabled(app.clone(), true, true);
    Ok(status)
}

struct OffsetReader<R> {
    inner: R,
    base_offset: u64,
    total_len: u64,
}

impl<R: Read + Seek> OffsetReader<R> {
    fn new(mut inner: R, base_offset: u64) -> io::Result<Self> {
        let total_len = inner.seek(SeekFrom::End(0))?;
        if base_offset > total_len {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Offset past end of stream",
            ));
        }
        inner.seek(SeekFrom::Start(base_offset))?;
        Ok(Self {
            inner,
            base_offset,
            total_len,
        })
    }
}

impl<R: Read> Read for OffsetReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl<R: Seek> Seek for OffsetReader<R> {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        let abs = match pos {
            SeekFrom::Start(n) => self
                .base_offset
                .checked_add(n)
                .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Seek overflow"))?,
            SeekFrom::End(off) => {
                let rel_len = (self.total_len - self.base_offset) as i64;
                let target = rel_len
                    .checked_add(off)
                    .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Seek overflow"))?;
                if target < 0 {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "Seek before start of 7z payload",
                    ));
                }
                self.base_offset + (target as u64)
            }
            SeekFrom::Current(off) => {
                let cur = self.inner.stream_position()? as i64;
                let target = cur
                    .checked_add(off)
                    .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Seek overflow"))?;
                if target < self.base_offset as i64 {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "Seek before start of 7z payload",
                    ));
                }
                target as u64
            }
        };
        let actual = self.inner.seek(SeekFrom::Start(abs))?;
        Ok(actual.saturating_sub(self.base_offset))
    }
}

fn sanitize_archive_rel_path(name: &str) -> Option<PathBuf> {
    if name.contains('\0') {
        return None;
    }
    let norm = name.replace('\\', "/");
    let mut out = PathBuf::new();
    for comp in Path::new(&norm).components() {
        match comp {
            Component::Normal(seg) => {
                let s = seg.to_string_lossy();
                if s.is_empty() || s.contains(':') {
                    return None;
                }
                out.push(seg);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn find_7z_offsets(path: &Path) -> Result<Vec<u64>, String> {
    let mut f = File::open(path).map_err(|e| format!("Cannot inspect backend download: {e}"))?;
    let mut offsets = Vec::new();
    let mut buf = vec![0u8; 64 * 1024 + SEVENZ_MAGIC.len()];
    let mut carry = 0usize;
    let mut file_pos = 0u64;

    loop {
        let n = f
            .read(&mut buf[carry..])
            .map_err(|e| format!("Read error scanning archive: {e}"))?;
        let valid = carry + n;
        if valid < SEVENZ_MAGIC.len() {
            break;
        }
        let search_limit = valid - SEVENZ_MAGIC.len() + 1;
        for i in 0..search_limit {
            if buf[i..i + SEVENZ_MAGIC.len()] == SEVENZ_MAGIC {
                offsets.push(file_pos + i as u64);
            }
        }
        if n == 0 {
            break;
        }
        let keep = SEVENZ_MAGIC.len() - 1;
        buf.copy_within(valid - keep..valid, 0);
        file_pos += (valid - keep) as u64;
        carry = keep;
    }
    Ok(offsets)
}

fn extract_zip_to_dir(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip backend: {e}"))?;
    if archive.len() > MAX_EXTRACT_ENTRIES {
        return Err("Backend zip contains too many entries.".into());
    }
    let mut total_written: u64 = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Ok(name) = entry.name() else { continue };
        let Some(rel) = sanitize_archive_rel_path(&name) else {
            continue;
        };
        let out_path = dest_dir.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if entry.size() > MAX_EXTRACT_ENTRY_BYTES {
            return Err("Backend zip entry exceeds safety limit.".into());
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
        let copied = copy_capped(&mut entry, &mut out, MAX_EXTRACT_ENTRY_BYTES)?;
        total_written = total_written.saturating_add(copied);
        if total_written > MAX_EXTRACT_TOTAL_BYTES {
            return Err("Backend extraction exceeded safety cap.".into());
        }
    }
    Ok(())
}

fn extract_7z_at_offset(archive_path: &Path, offset: u64, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let reader = OffsetReader::new(file, offset).map_err(|e| e.to_string())?;
    let mut sz = sevenz_rust2::ArchiveReader::new(reader, sevenz_rust2::Password::empty())
        .map_err(|e| format!("7z parse error at offset {offset}: {e}"))?;
    let mut count = 0usize;
    let mut total_written: u64 = 0;
    let mut inner_err: Option<String> = None;

    sz.for_each_entries(|entry, reader| {
        count += 1;
        if count > MAX_EXTRACT_ENTRIES {
            inner_err = Some("7z archive exceeds entry count limit.".into());
            return Ok(false);
        }
        let Some(rel) = sanitize_archive_rel_path(entry.name()) else {
            std::io::copy(&mut reader.take(MAX_EXTRACT_ENTRY_BYTES), &mut io::sink())?;
            return Ok(true);
        };
        if rel
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("cslol-manager.exe"))
        {
            std::io::copy(&mut reader.take(MAX_EXTRACT_ENTRY_BYTES), &mut io::sink())?;
            return Ok(true);
        }
        let out_path = dest_dir.join(&rel);
        if entry.is_directory() {
            fs::create_dir_all(&out_path)?;
            return Ok(true);
        }
        if entry.size() > MAX_EXTRACT_ENTRY_BYTES {
            inner_err = Some(format!("7z entry '{}' exceeds size limit.", entry.name()));
            return Ok(false);
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = File::create(&out_path)?;
        let copied = io::copy(&mut reader.take(MAX_EXTRACT_ENTRY_BYTES + 1), &mut out)?;
        if copied > MAX_EXTRACT_ENTRY_BYTES {
            inner_err = Some(format!("7z entry '{}' exceeded size cap during decode.", entry.name()));
            return Ok(false);
        }
        total_written = total_written.saturating_add(copied);
        if total_written > MAX_EXTRACT_TOTAL_BYTES {
            inner_err = Some("7z extraction exceeded total size limit.".into());
            return Ok(false);
        }
        Ok(true)
    })
    .map_err(|e| format!("7z extraction error: {e}"))?;

    if let Some(err) = inner_err {
        return Err(err);
    }
    Ok(())
}

fn copy_capped<R: Read, W: Write>(reader: &mut R, writer: &mut W, max_bytes: u64) -> Result<u64, String> {
    let mut limited = reader.take(max_bytes + 1);
    let copied = io::copy(&mut limited, writer).map_err(|e| e.to_string())?;
    if copied > max_bytes {
        return Err("Archive entry exceeded size limit.".into());
    }
    Ok(copied)
}

pub(crate) fn extract_backend_package(archive_path: &Path, staging_dir: &Path) -> Result<(), String> {
    let mut head = [0u8; 6];
    {
        let mut f = File::open(archive_path).map_err(|e| format!("Cannot read download: {e}"))?;
        let n = f.read(&mut head).map_err(|e| e.to_string())?;
        if n < 4 {
            return Err("Downloaded backend archive is truncated.".into());
        }
    }
    if &head[..4] == b"PK\x03\x04" {
        return extract_zip_to_dir(archive_path, staging_dir);
    }
    let offsets = find_7z_offsets(archive_path)?;
    if offsets.is_empty() {
        return Err("Downloaded file is neither a zip nor a 7z/SFX archive.".into());
    }
    let mut last_err = "No valid 7z header matched.".to_string();
    for offset in offsets {
        let _ = fs::remove_dir_all(staging_dir);
        fs::create_dir_all(staging_dir).map_err(|e| e.to_string())?;
        match extract_7z_at_offset(archive_path, offset, staging_dir) {
            Ok(()) => return Ok(()),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

fn find_exe_recursive(dir: &Path, names: &[&str]) -> Option<PathBuf> {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = fs::read_dir(&d) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                if names.iter().any(|want| fname.eq_ignore_ascii_case(want)) {
                    return Some(p);
                }
            }
        }
    }
    None
}

pub(crate) fn promote_modtools_from_extracted(
    staging_dir: &Path,
    adapters_dir: &Path,
) -> Result<PathBuf, String> {
    let found_exe = find_exe_recursive(staging_dir, &[managed_modtools_exe_name(), "cslol-mod-tools.exe"])
        .ok_or_else(|| "Extracted archive did not contain mod-tools executable.".to_string())?;
    let bin_dir = found_exe
        .parent()
        .ok_or_else(|| "Extracted mod-tools executable has no parent directory.".to_string())?;

    fs::create_dir_all(adapters_dir).map_err(|e| format!("Cannot create adapters dir: {e}"))?;
    let entries = fs::read_dir(bin_dir).map_err(|e| format!("Cannot inspect extracted tools dir: {e}"))?;
    for entry in entries.flatten() {
        let src = entry.path();
        if src.is_dir() {
            continue;
        }
        let Some(fname) = src.file_name() else { continue };
        let fname_str = fname.to_string_lossy().to_ascii_lowercase();
        let should_copy = fname_str.ends_with(".exe")
            || fname_str.ends_with(".dll")
            || fname_str.ends_with(".dylib")
            || fname_str.ends_with(".so")
            || fname_str == "hashes.game.txt"
            || fname_str == "mod-tools";
        if !should_copy {
            continue;
        }
        let dest = adapters_dir.join(fname);
        let tmp_dest = adapters_dir.join(format!(".tmp_{}", fname.to_string_lossy()));
        fs::copy(&src, &tmp_dest)
            .map_err(|e| format!("Failed copying tool file '{}': {e}", fname.to_string_lossy()))?;
        if dest.exists() {
            let _ = fs::remove_file(&dest);
        }
        fs::rename(&tmp_dest, &dest)
            .map_err(|e| format!("Failed promoting tool file '{}': {e}", fname.to_string_lossy()))?;
    }

    let promoted = adapters_dir.join(managed_modtools_exe_name());
    if !promoted.is_file() {
        fs::copy(&found_exe, &promoted).map_err(|e| format!("Failed promoting mod-tools exe: {e}"))?;
    }
    if !managed_modtools_ready(adapters_dir) {
        return Err("Provisioned cslol-tools is missing required runtime DLLs (cslol-dll.dll).".into());
    }
    Ok(promoted)
}

fn download_with_progress(
    client: &reqwest::blocking::Client,
    url: &str,
    dest_path: &Path,
    label_prefix: &str,
    progress_floor: u8,
    progress_ceil: u8,
) -> Result<u64, String> {
    let mut resp = client
        .get(url)
        .send()
        .map_err(|e| format!("{label_prefix} download request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("{label_prefix} download unavailable (HTTP {})", resp.status()));
    }
    let total_len = resp.content_length();
    if total_len.is_some_and(|len| len > MAX_DOWNLOAD_BYTES) {
        return Err(format!("{label_prefix} download exceeds size limit."));
    }
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create staging dir: {e}"))?;
    }
    let mut out_file =
        File::create(dest_path).map_err(|e| format!("Cannot create staging file: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_reported_pct: Option<u8> = None;

    loop {
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                downloaded = downloaded.saturating_add(n as u64);
                if downloaded > MAX_DOWNLOAD_BYTES {
                    return Err(format!("{label_prefix} download exceeded size limit."));
                }
                out_file
                    .write_all(&buf[..n])
                    .map_err(|e| format!("Failed writing download: {e}"))?;
                let span = u64::from(progress_ceil.saturating_sub(progress_floor).max(1));
                let pct = total_len.and_then(|tot| {
                    if tot > 0 {
                        let scaled = progress_floor as u64 + (downloaded.saturating_mul(span) / tot);
                        Some(scaled.min(progress_ceil as u64) as u8)
                    } else {
                        None
                    }
                });
                if pct != last_reported_pct || pct.is_none() {
                    last_reported_pct = pct;
                    let mb = downloaded as f64 / (1024.0 * 1024.0);
                    let label = match total_len {
                        Some(tot) if tot > 0 => format!(
                            "Downloading {label_prefix} ({mb:.1} / {:.1} MB)...",
                            tot as f64 / (1024.0 * 1024.0)
                        ),
                        _ => format!("Downloading {label_prefix} ({mb:.1} MB)..."),
                    };
                    set_provision_progress("downloading", pct, label);
                }
            }
            Err(e) => {
                return Err(format!("{label_prefix} download interrupted: {e}"));
            }
        }
    }
    out_file.flush().map_err(|e| e.to_string())?;
    Ok(downloaded)
}

fn ensure_modtools_overlay_builder(
    client: &reqwest::blocking::Client,
    root: &Path,
) -> Result<PathBuf, String> {
    let adapters_dir = root.join("adapters").join("mod-tools");
    fs::create_dir_all(&adapters_dir).map_err(|e| format!("Cannot create adapters dir: {e}"))?;
    if managed_modtools_ready(&adapters_dir) {
        sync_hashes_dictionary_from_managed(root, &adapters_dir);
        return Ok(adapters_dir.join(managed_modtools_exe_name()));
    }

    #[cfg(windows)]
    let candidates = [
        "https://github.com/LeagueToolkit/cslol-manager/releases/latest/download/cslol-manager-windows.exe",
        "https://github.com/LeagueToolkit/cslol-manager/releases/download/2026-04-15-23f2308/cslol-manager-windows.exe",
    ];
    #[cfg(not(windows))]
    let candidates: [&str; 0] = [];

    if candidates.is_empty() {
        return Err("Managed auto-provisioning is supported on Windows only; configure an external adapter CLI in Settings.".into());
    }

    set_provision_progress("downloading", Some(0), "Connecting to cslol-tools release...");
    let tmp_download = adapters_dir.join(".download.tmp");
    let pkg_dir = adapters_dir.join(".pkg_tmp");
    let mut last_err = "No overlay builder source available".to_string();

    for url in candidates {
        let _ = fs::remove_file(&tmp_download);
        let _ = fs::remove_dir_all(&pkg_dir);

        if let Err(err) = download_with_progress(client, url, &tmp_download, "cslol-tools", 0, 48) {
            last_err = err;
            continue;
        }
        set_provision_progress("extracting", Some(49), "Extracting mkoverlay & WAD hashes...");
        if let Err(e) = fs::create_dir_all(&pkg_dir) {
            last_err = format!("Cannot create extraction dir: {e}");
            continue;
        }
        if let Err(e) = extract_backend_package(&tmp_download, &pkg_dir) {
            last_err = e;
            continue;
        }
        match promote_modtools_from_extracted(&pkg_dir, &adapters_dir) {
            Ok(promoted) => {
                let _ = fs::remove_file(&tmp_download);
                let _ = fs::remove_dir_all(&pkg_dir);
                sync_hashes_dictionary_from_managed(root, &adapters_dir);
                return Ok(promoted);
            }
            Err(e) => last_err = e,
        }
    }

    let _ = fs::remove_file(&tmp_download);
    let _ = fs::remove_dir_all(&pkg_dir);
    Err(last_err)
}

#[cfg(windows)]
fn run_silent_ltk_installer_elevated(installer_path: &Path) -> Result<bool, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, ERROR_CANCELLED};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    let verb = wide(std::ffi::OsStr::new("runas"));
    let file = wide(installer_path.as_os_str());
    let params = wide(std::ffi::OsStr::new("/S"));

    let mut sei: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    sei.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb = verb.as_ptr();
    sei.lpFile = file.as_ptr();
    sei.lpParameters = params.as_ptr();
    sei.nShow = SW_SHOWNORMAL;

    let ok = unsafe { ShellExecuteExW(&mut sei) };
    if ok == 0 {
        let code = std::io::Error::last_os_error().raw_os_error().unwrap_or_default() as u32;
        if code == ERROR_CANCELLED {
            return Ok(false);
        }
        return Err(format!("Failed launching LTK Manager installer (Win32 error {code})."));
    }

    if !sei.hProcess.is_null() {
        let wait_res = unsafe { WaitForSingleObject(sei.hProcess, 120_000) };
        let mut exit_code: u32 = 0;
        let _ = unsafe { GetExitCodeProcess(sei.hProcess, &mut exit_code) };
        let _ = unsafe { CloseHandle(sei.hProcess) };
        if wait_res != 0 {
            return Err("Timed out waiting for LTK Manager installer.".into());
        }
        if exit_code != 0 {
            return Err(format!("LTK Manager installer exited with code {exit_code}."));
        }
    }
    Ok(true)
}

#[cfg(not(windows))]
fn run_silent_ltk_installer_elevated(_installer_path: &Path) -> Result<bool, String> {
    Err("LTK Manager installer is only supported on Windows.".into())
}

fn is_ltk_manager_running() -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_ascii_lowercase();
        matches!(
            n.as_str(),
            "ltk-manager.exe" | "ltk-manager" | "ltk manager.exe" | "ltk manager"
        )
    })
}

fn sync_ltk_dll_via_manager(root: &Path, manager_exe: &Path) -> Result<(), String> {
    if !manager_exe.is_file() {
        return Err("LTK Manager executable not found for patcher DLL sync.".into());
    }
    let already_running = is_ltk_manager_running();
    let mut spawned = if already_running {
        None
    } else {
        set_provision_progress(
            "extracting",
            Some(85),
            "Starting LTK Manager briefly to sync signed ltk_patcher_dll.dll...",
        );
        let child = std::process::Command::new(manager_exe)
            .spawn()
            .map_err(|e| format!("Failed starting LTK Manager for patcher DLL sync: {e}"))?;
        Some(child)
    };

    let deadline = Instant::now() + Duration::from_secs(35);
    let mut synced = false;
    let started = Instant::now();

    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(300));
        let secs = started.elapsed().as_secs();
        set_provision_progress(
            "extracting",
            Some((85 + (secs.min(13) as u8)).min(98)),
            format!("Waiting for LTK Manager to sync ltk_patcher_dll.dll ({secs}s)..."),
        );
        if matches!(
            try_stage_installed_ltk_patcher(root, &[], &[], now_unix_secs()),
            LtkStageDiscovery::Ready
        ) {
            std::thread::sleep(Duration::from_millis(350));
            let _ = try_stage_installed_ltk_patcher(root, &[], &[], now_unix_secs());
            synced = true;
            break;
        }
    }

    if let Some(mut child) = spawned.take() {
        crate::commands::system_utils::graceful_close_pid(child.id());
        let close_deadline = Instant::now() + Duration::from_millis(2000);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < close_deadline => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
    }

    if synced {
        Ok(())
    } else {
        Err(
            "Timed out waiting for LTK Manager to download ltk_patcher_dll.dll. Open LTK Manager once manually to finish first-run setup, then retry."
                .into(),
        )
    }
}

/// Best-effort: provision `mod-tools` (`mkoverlay` + `hashes.game.txt`) and stage
/// official `ltk_patcher_host.exe` + `ltk_patcher_dll.dll` into app data.
/// Safe to call repeatedly; concurrent calls serialize cleanly.
#[allow(dead_code)]
pub fn provision_managed_backend_at(root: &Path) -> Result<BootstrapStatus, String> {
    provision_managed_backend_with_options_at(root, false)
}

pub fn provision_managed_backend_with_options_at(
    root: &Path,
    force_install_prompt: bool,
) -> Result<BootstrapStatus, String> {
    let lock = PROVISION_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock
        .lock()
        .map_err(|_| "Provisioning lock poisoned.".to_string())?;

    if let Some(elev_err) = check_elevation_mismatch(None) {
        set_provision_progress("action_required", None, elev_err.clone());
        return Ok(ensure_bootstrapped_at(root));
    }

    let client = reqwest::blocking::Client::builder()
        .user_agent("LAAP/1.0 (managed-backend-provisioning)")
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| {
            let msg = format!("HTTP client unavailable: {e}");
            set_provision_progress("error", None, msg.clone());
            msg
        })?;

    if let Err(err) = ensure_modtools_overlay_builder(&client, root) {
        set_provision_progress("error", None, err.clone());
        return Err(err);
    }

    let now_secs = now_unix_secs();
    match try_stage_installed_ltk_patcher(root, &[], &[], now_secs) {
        LtkStageDiscovery::Ready => {
            let mut status = ensure_bootstrapped_at(root);
            status.detail = format!("{}; Managed LTK patcher backend ready", status.detail);
            return Ok(status);
        }
        LtkStageDiscovery::NeedsInstall { hint } => {
            if !cfg!(windows) {
                set_provision_progress("error", None, hint.clone());
                return Err(hint);
            }
            if !force_install_prompt && UAC_AUTO_ATTEMPTED.swap(true, Ordering::SeqCst) {
                set_provision_progress(
                    "action_required",
                    None,
                    "Click 'Install LTK Patcher' and approve Windows setup once to enable in-game skin patching.",
                );
                return Ok(ensure_bootstrapped_at(root));
            }
            let installer_dir = managed_ltk_dir(root).join(".installer");
            let installer_exe = installer_dir.join("LTK.Manager_x64-setup.exe");
            set_provision_progress(
                "downloading",
                Some(50),
                "Downloading official LTK Manager installer...",
            );
            let bytes = match download_with_progress(
                &client,
                LTK_SETUP_DOWNLOAD_URL,
                &installer_exe,
                "LTK Manager setup",
                50,
                78,
            ) {
                Ok(n) => n,
                Err(err) => {
                    let _ = fs::remove_file(&installer_exe);
                    set_provision_progress("error", None, err.clone());
                    return Err(err);
                }
            };
            let valid_pe = File::open(&installer_exe)
                .ok()
                .and_then(|mut f| {
                    let mut magic = [0u8; 2];
                    f.read_exact(&mut magic).ok()?;
                    Some(magic == *b"MZ")
                })
                .unwrap_or(false);
            if bytes < 1_000_000 || !valid_pe {
                let _ = fs::remove_file(&installer_exe);
                let msg = "Downloaded LTK Manager installer is invalid or truncated.".to_string();
                set_provision_progress("error", None, msg.clone());
                return Err(msg);
            }

            set_provision_progress(
                "extracting",
                Some(80),
                "Waiting for Windows installer confirmation for official LTK Manager...",
            );
            match run_silent_ltk_installer_elevated(&installer_exe) {
                Ok(true) => {
                    let _ = fs::remove_dir_all(&installer_dir);
                }
                Ok(false) => {
                    let _ = fs::remove_dir_all(&installer_dir);
                    set_provision_progress(
                        "action_required",
                        None,
                        "Windows UAC prompt was cancelled. Click 'Install LTK Patcher' and approve once to finish setup.",
                    );
                    return Ok(ensure_bootstrapped_at(root));
                }
                Err(err) => {
                    let _ = fs::remove_dir_all(&installer_dir);
                    set_provision_progress("error", None, err.clone());
                    return Err(err);
                }
            }
        }
        LtkStageDiscovery::NeedsDllSync { .. } => {}
    }

    if let LtkStageDiscovery::NeedsDllSync { manager_exe, .. } =
        try_stage_installed_ltk_patcher(root, &[], &[], now_unix_secs())
    {
        if let Err(err) = sync_ltk_dll_via_manager(root, &manager_exe) {
            set_provision_progress("error", None, err.clone());
            return Err(err);
        }
    }

    let status = ensure_bootstrapped_at(root);
    if status.managed_backend_ready {
        set_provision_progress("ready", Some(100), "Managed LTK patcher backend ready.");
        Ok(ensure_bootstrapped_at(root))
    } else {
        let msg = status
            .provision_detail
            .clone()
            .unwrap_or_else(|| "LTK patcher backend did not complete staging.".into());
        set_provision_progress("error", None, msg.clone());
        Err(msg)
    }
}

#[tauri::command]
pub async fn customization_bootstrap_provision(
    app: AppHandle,
    force_install_prompt: Option<bool>,
) -> Result<BootstrapStatus, String> {
    let root = storage::root(&app)?;
    let force = force_install_prompt.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        provision_managed_backend_with_options_at(&root, force)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn temp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "laap-bootstrap-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn bootstrap_sets_auto_flags_idempotently() {
        let root = temp_root("flags");
        let s1 = ensure_bootstrapped_at(&root);
        let s2 = ensure_bootstrapped_at(&root);
        assert!(s1.runner_auto_apply_enabled);
        assert!(s2.runner_auto_apply_enabled);
        let cfg = game_adapter::load_config_at(&root).unwrap();
        assert!(cfg.user_consent_granted);
        assert!(cfg.clearance_acknowledged);
        assert!(cfg.auto_apply_in_champ_select);
        let runner_cfg: in_game_runner::InGameRunnerConfig =
            storage::read(&root.join(in_game_runner::CONFIG_FILE), 1024 * 16)
                .unwrap()
                .unwrap();
        assert!(runner_cfg.monitor_enabled);
        assert!(runner_cfg.auto_apply_mods);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delivery_manifest_parser_skips_revoked_and_prefers_unexpired_stable() {
        let root = temp_root("delivery");
        let patcher_dir = root.join("patcher");
        fs::create_dir_all(&patcher_dir).unwrap();

        let stable_bytes = b"MZ-stable-dll-payload";
        let stable_sha = format!("{:x}", Sha256::digest(stable_bytes));
        let stable_dir = patcher_dir.join(&stable_sha);
        fs::create_dir_all(&stable_dir).unwrap();
        fs::write(stable_dir.join(LTK_HOOK_DLL_NAME), stable_bytes).unwrap();

        let beta_bytes = b"MZ-beta-dll-payload";
        let beta_sha = format!("{:x}", Sha256::digest(beta_bytes));
        let beta_dir = patcher_dir.join(&beta_sha);
        fs::create_dir_all(&beta_dir).unwrap();
        fs::write(beta_dir.join(LTK_HOOK_DLL_NAME), beta_bytes).unwrap();

        let make_env = |ch: &str, ver: &str, sha: &str, size: usize, eol: u32, revoked: Vec<&str>| {
            let m = serde_json::json!({
                "schema": 1,
                "channel": ch,
                "sequence": 42,
                "release": {
                    "version": ver,
                    "digest": sha,
                    "size": size,
                    "protocol": 1,
                    "managers": ">=1.0.0",
                    "eol": eol
                },
                "revoked": revoked,
            });
            serde_json::json!({
                "etag": null,
                "envelope": {
                    "manifest": base64::engine::general_purpose::STANDARD.encode(m.to_string().as_bytes()),
                    "signature": "unused"
                }
            })
        };

        let delivery = serde_json::json!({
            "channels": {
                "stable": make_env("stable", "ltk_patcher-10", &stable_sha, stable_bytes.len(), 2000, vec![&stable_sha]),
                "beta": make_env("beta", "ltk_patcher-11", &beta_sha, beta_bytes.len(), 3000, vec![])
            }
        });
        fs::write(patcher_dir.join("delivery.json"), delivery.to_string()).unwrap();

        // Stable digest is revoked in its own list -> falls back cleanly to unexpired Beta.
        let picked = parse_delivery_json_and_pick_dll(&patcher_dir, 2500).expect("pick beta");
        assert_eq!(picked.sha256, beta_sha);
        assert_eq!(picked.version.as_deref(), Some("ltk_patcher-11"));
        assert!(!picked.is_expired);

        // Past beta EOL -> still returns candidate flagged `is_expired = true`.
        let expired = parse_delivery_json_and_pick_dll(&patcher_dir, 3500).expect("expired beta");
        assert!(expired.is_expired);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stage_ltk_migrates_legacy_modtools_adapter_automatically() {
        let root = temp_root("ltk-migrate");
        let legacy_dir = root.join("adapters").join("mod-tools");
        fs::create_dir_all(&legacy_dir).unwrap();
        let legacy_exe = legacy_dir.join(managed_modtools_exe_name());
        fs::write(&legacy_exe, b"MZ-old-modtools").unwrap();

        let mut cfg = game_adapter::GameAdapterConfig::default();
        cfg.adapter_path = Some(legacy_exe.to_string_lossy().into_owned());
        game_adapter::save_config_at(&root, cfg).unwrap();

        let fake_install = root.join("fake_ltk_install");
        fs::create_dir_all(&fake_install).unwrap();
        fs::write(fake_install.join(LTK_HOST_EXE_NAME), b"MZ-ltk-host").unwrap();

        let patcher_dir = root.join("fake_appdata_patcher");
        let dll_bytes = b"MZ-ltk-hook-dll";
        let dll_sha = format!("{:x}", Sha256::digest(dll_bytes));
        fs::create_dir_all(patcher_dir.join(&dll_sha)).unwrap();
        fs::write(patcher_dir.join(&dll_sha).join(LTK_HOOK_DLL_NAME), dll_bytes).unwrap();

        let status = build_bootstrap_status_with_discovery(
            &root,
            std::slice::from_ref(&fake_install),
            std::slice::from_ref(&patcher_dir),
        );
        assert!(status.ltk_patcher_ready);
        assert_eq!(status.backend_kind, "ltk-patcher");
        let updated_cfg = game_adapter::load_config_at(&root).unwrap();
        assert!(updated_cfg
            .adapter_path
            .as_deref()
            .unwrap_or_default()
            .contains(LTK_HOST_EXE_NAME));
        assert!(managed_ltk_dir(&root).join(LTK_HOOK_DLL_NAME).is_file());
        assert!(managed_ltk_stage_meta(&root).is_some());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discover_ltk_install_recognizes_hyphenated_and_spaced_manager_exe() {
        let root = temp_root("ltk-mgr-exe-names");
        let dir_hyphen = root.join("hyphen");
        fs::create_dir_all(&dir_hyphen).unwrap();
        fs::write(dir_hyphen.join(LTK_HOST_EXE_NAME), b"MZ-host").unwrap();
        fs::write(dir_hyphen.join("ltk-manager.exe"), b"MZ-mgr").unwrap();

        let found_hyphen = find_ltk_install_in(std::slice::from_ref(&dir_hyphen))
            .expect("should discover hyphenated ltk-manager install");
        assert_eq!(found_hyphen.host_exe, dir_hyphen.join(LTK_HOST_EXE_NAME));
        assert_eq!(
            found_hyphen.manager_exe,
            Some(dir_hyphen.join("ltk-manager.exe"))
        );

        let dir_spaced = root.join("spaced");
        fs::create_dir_all(&dir_spaced).unwrap();
        fs::write(dir_spaced.join(LTK_HOST_EXE_NAME), b"MZ-host").unwrap();
        fs::write(dir_spaced.join("LTK Manager.exe"), b"MZ-mgr").unwrap();

        let found_spaced = find_ltk_install_in(std::slice::from_ref(&dir_spaced))
            .expect("should discover legacy spaced LTK Manager install");
        assert_eq!(
            found_spaced.manager_exe,
            Some(dir_spaced.join("LTK Manager.exe"))
        );

        let dir_only_host = root.join("only_host");
        fs::create_dir_all(&dir_only_host).unwrap();
        fs::write(dir_only_host.join(LTK_HOST_EXE_NAME), b"MZ-host").unwrap();
        let found_only_host = find_ltk_install_in(std::slice::from_ref(&dir_only_host))
            .expect("host alone should still discover host_exe");
        assert_eq!(found_only_host.manager_exe, None);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn zip_extraction_and_promotion_work() {
        let root = temp_root("zip-promote");
        let pkg = root.join("backend.zip");
        {
            let f = File::create(&pkg).unwrap();
            let mut zw = zip::ZipWriter::new(f);
            let opts = zip::write::SimpleFileOptions::default();
            zw.start_file("cslol-manager/cslol-tools/mod-tools.exe", opts).unwrap();
            zw.write_all(b"MZ-fake-exe").unwrap();
            zw.start_file("cslol-manager/cslol-tools/cslol-dll.dll", opts).unwrap();
            zw.write_all(b"MZ-fake-dll").unwrap();
            zw.start_file("cslol-manager/cslol-tools/hashes.game.txt", opts).unwrap();
            zw.write_all(b"1234abcd data/test.bin\n").unwrap();
            zw.finish().unwrap();
        }
        let stage = root.join("stage");
        let dest = root.join("adapters").join("mod-tools");
        extract_backend_package(&pkg, &stage).unwrap();
        let promoted = promote_modtools_from_extracted(&stage, &dest).unwrap();
        assert!(promoted.is_file());
        assert!(dest.join("cslol-dll.dll").is_file());
        assert!(dest.join("hashes.game.txt").is_file());
        assert!(managed_modtools_ready(&dest));
        sync_hashes_dictionary_from_managed(&root, &dest);
        assert!(root.join("wad_hashes").join("hashes.game.txt").is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[ignore]
    fn inspect_downloaded_cslol_sfx() {
        let sfx = PathBuf::from(r"C:\Users\hessa\.gemini\antigravity\brain\dd38b228-912d-44c7-b4d9-47f740ca1ae4\scratch\cslol-manager-windows.exe");
        if !sfx.is_file() {
            return;
        }
        let root = temp_root("real-sfx");
        let stage = root.join("stage");
        let dest = root.join("adapters").join("mod-tools");
        extract_backend_package(&sfx, &stage).expect("extract real sfx");
        let out = promote_modtools_from_extracted(&stage, &dest).expect("promote real mod-tools");
        let list: Vec<String> = fs::read_dir(&dest)
            .unwrap()
            .flatten()
            .map(|e| format!("{} ({}B)", e.file_name().to_string_lossy(), e.metadata().map(|m| m.len()).unwrap_or(0)))
            .collect();
        println!("promoted={}\nfiles={:?}", out.display(), list);
        let cmd_out = std::process::Command::new(&out).arg("help").output().expect("run mod-tools help");
        println!("exit={:?}\nstdout={}\nstderr={}", cmd_out.status, String::from_utf8_lossy(&cmd_out.stdout), String::from_utf8_lossy(&cmd_out.stderr));
        let _ = fs::remove_dir_all(root);
    }
}
