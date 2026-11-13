//! Zero-interaction bootstrap for skin/customization mode.
//!
//! Ensures League path, managed adapter config, runner/bridge defaults, and
//! companion readiness are configured without user clicks. Provisioning of the
//! managed patcher backend is best-effort and reported with live progress.

use super::{client_bridge, game_adapter, game_path, in_game_runner, storage};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

const SEVENZ_MAGIC: [u8; 6] = [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C];
const MAX_DOWNLOAD_BYTES: u64 = 160 * 1024 * 1024;
const MAX_EXTRACT_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
const MAX_EXTRACT_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES: usize = 4096;

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
}

fn is_managed_adapter_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.contains("adapters") && (lower.contains("mod-tools") || lower.contains("laap-adapter"))
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

/// Idempotent, no-UI bootstrap. Safe to call on startup.
pub fn ensure_bootstrapped_at(root: &Path) -> BootstrapStatus {
    let mut detail_parts: Vec<String> = Vec::new();

    // 1) League install detection (best-effort).
    let install = game_path::resolve_game_install_info_at(&root.join("game_path.json"), None);
    let league_detected = install.is_detected;
    if league_detected {
        detail_parts.push("League install detected".into());
    } else {
        detail_parts.push("League install not detected yet".into());
    }

    // 2) Adapter config: auto-consent + auto-apply for zero-interaction flow.
    //    Prefer managed backend if present; otherwise accept any discovered backend.
    let mut cfg = game_adapter::load_config_at(root).unwrap_or_default();
    cfg.user_consent_granted = true;
    cfg.clearance_acknowledged = true;
    cfg.auto_apply_in_champ_select = true;

    let managed_dir = root.join("adapters").join("mod-tools");
    let managed_candidate = managed_dir.join(managed_modtools_exe_name());
    let managed_ready = managed_modtools_ready(&managed_dir);
    if managed_ready {
        sync_hashes_dictionary_from_managed(root, &managed_dir);
    }

    let configured_missing = cfg
        .adapter_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some_and(|p| !Path::new(p).is_file());
    if configured_missing {
        cfg.adapter_path = None;
    }

    if cfg.adapter_path.is_none() && managed_ready {
        cfg.adapter_path = Some(managed_candidate.to_string_lossy().into_owned());
        detail_parts.push("Managed patcher backend configured".into());
    } else if cfg.adapter_path.is_none() {
        if let Ok(Some((found, _src))) = game_adapter::discover_adapter_binary(&cfg, true) {
            cfg.adapter_path = Some(found.to_string_lossy().into_owned());
            detail_parts.push("Discovered external patcher backend".into());
        } else {
            detail_parts.push("Managed patcher backend not provisioned yet".into());
        }
    } else if cfg.adapter_path.as_deref().is_some_and(is_managed_adapter_path) && !managed_ready {
        detail_parts.push("Managed patcher backend incomplete; re-provisioning needed".into());
    }

    let adapter_configured = cfg
        .adapter_path
        .as_deref()
        .map(str::trim)
        .is_some_and(|p| !p.is_empty() && Path::new(p).is_file());
    let adapter_path = cfg.adapter_path.clone();
    let _ = game_adapter::save_config_at(root, cfg);

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
    if managed_ready {
        progress.state = "ready".into();
        progress.progress_pct = Some(100);
        if progress.detail.is_none() {
            progress.detail = Some("Managed mod-tools backend ready.".into());
        }
    } else if adapter_configured {
        progress.state = "ready".into();
        progress.progress_pct = Some(100);
    }

    let setup_needed = !managed_ready && !adapter_configured;

    BootstrapStatus {
        ok: league_detected || adapter_configured,
        league_detected,
        adapter_configured,
        managed_backend_ready: (managed_ready || adapter_configured) && adapter_configured,
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
    }
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

/// Best-effort: download and extract a managed mod-tools backend into app data.
/// Safe to call repeatedly; concurrent calls serialize cleanly.
pub fn provision_managed_backend_at(root: &Path) -> Result<BootstrapStatus, String> {
    let lock = PROVISION_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock
        .lock()
        .map_err(|_| "Provisioning lock poisoned.".to_string())?;

    let adapters_dir = root.join("adapters").join("mod-tools");
    fs::create_dir_all(&adapters_dir).map_err(|e| format!("Cannot create adapters dir: {e}"))?;

    if managed_modtools_ready(&adapters_dir) {
        set_provision_progress("ready", Some(100), "Managed mod-tools backend ready.");
        let mut status = ensure_bootstrapped_at(root);
        status.detail = format!("{}; Managed patcher backend already present", status.detail);
        return Ok(status);
    }

    #[cfg(windows)]
    let candidates = [
        "https://github.com/LeagueToolkit/cslol-manager/releases/latest/download/cslol-manager-windows.exe",
        "https://github.com/LeagueToolkit/cslol-manager/releases/download/2026-04-15-23f2308/cslol-manager-windows.exe",
    ];
    #[cfg(not(windows))]
    let candidates: [&str; 0] = [];

    if candidates.is_empty() {
        let msg = "Managed auto-provisioning is currently supported on Windows; configure an external adapter CLI in Settings.".to_string();
        set_provision_progress("error", None, msg.clone());
        return Err(msg);
    }

    set_provision_progress("downloading", Some(0), "Connecting to cslol-tools release...");
    let client = reqwest::blocking::Client::builder()
        .user_agent("LAAP/1.0 (managed-backend-provisioning)")
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| {
            let msg = format!("HTTP client unavailable: {e}");
            set_provision_progress("error", None, msg.clone());
            msg
        })?;

    let tmp_download = adapters_dir.join(".download.tmp");
    let pkg_dir = adapters_dir.join(".pkg_tmp");
    let mut last_err = "No backend source available".to_string();

    for url in candidates {
        let _ = fs::remove_file(&tmp_download);
        let _ = fs::remove_dir_all(&pkg_dir);

        match client.get(url).send() {
            Ok(mut resp) if resp.status().is_success() => {
                let total_len = resp.content_length();
                if total_len.is_some_and(|len| len > MAX_DOWNLOAD_BYTES) {
                    last_err = "Backend download exceeds size limit.".into();
                    continue;
                }
                let mut out_file = match File::create(&tmp_download) {
                    Ok(f) => f,
                    Err(e) => {
                        last_err = format!("Cannot create staging file: {e}");
                        continue;
                    }
                };
                let mut downloaded: u64 = 0;
                let mut buf = [0u8; 64 * 1024];
                let mut last_reported_pct: Option<u8> = None;
                let mut read_err: Option<String> = None;

                loop {
                    match resp.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            downloaded = downloaded.saturating_add(n as u64);
                            if downloaded > MAX_DOWNLOAD_BYTES {
                                read_err = Some("Backend download exceeded size limit.".into());
                                break;
                            }
                            if let Err(e) = out_file.write_all(&buf[..n]) {
                                read_err = Some(format!("Failed writing download: {e}"));
                                break;
                            }
                            let pct = total_len.and_then(|tot| {
                                if tot > 0 {
                                    Some(((downloaded.saturating_mul(100)) / tot).min(99) as u8)
                                } else {
                                    None
                                }
                            });
                            if pct != last_reported_pct || pct.is_none() {
                                last_reported_pct = pct;
                                let mb = downloaded as f64 / (1024.0 * 1024.0);
                                let label = match total_len {
                                    Some(tot) if tot > 0 => format!(
                                        "Downloading cslol-tools ({mb:.1} / {:.1} MB)...",
                                        tot as f64 / (1024.0 * 1024.0)
                                    ),
                                    _ => format!("Downloading cslol-tools ({mb:.1} MB)..."),
                                };
                                set_provision_progress("downloading", pct, label);
                            }
                        }
                        Err(e) => {
                            read_err = Some(format!("Download interrupted: {e}"));
                            break;
                        }
                    }
                }
                let _ = out_file.flush();
                drop(out_file);

                if let Some(err) = read_err {
                    last_err = err;
                    continue;
                }

                set_provision_progress("extracting", Some(99), "Extracting mod-tools & runtime DLLs...");
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

                        let mut cfg = game_adapter::load_config_at(root).unwrap_or_default();
                        cfg.adapter_path = Some(promoted.to_string_lossy().into_owned());
                        cfg.user_consent_granted = true;
                        cfg.clearance_acknowledged = true;
                        cfg.auto_apply_in_champ_select = true;
                        let _ = game_adapter::save_config_at(root, cfg);

                        set_provision_progress("ready", Some(100), "Managed mod-tools backend ready.");
                        let mut status = ensure_bootstrapped_at(root);
                        status.detail = format!("{}; Managed patcher backend provisioned", status.detail);
                        status.setup_needed = false;
                        status.managed_backend_ready = true;
                        return Ok(status);
                    }
                    Err(e) => {
                        last_err = e;
                    }
                }
            }
            Ok(resp) => {
                last_err = format!("Backend download unavailable (HTTP {})", resp.status());
            }
            Err(e) => {
                last_err = format!("Backend download failed: {e}");
            }
        }
    }

    let _ = fs::remove_file(&tmp_download);
    let _ = fs::remove_dir_all(&pkg_dir);
    set_provision_progress("error", None, last_err.clone());
    Err(last_err)
}

#[tauri::command]
pub async fn customization_bootstrap_provision(app: AppHandle) -> Result<BootstrapStatus, String> {
    let root = storage::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || provision_managed_backend_at(&root))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

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
