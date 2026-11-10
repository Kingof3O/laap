use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

pub const GITHUB_REPO: &str = "Kingof3O/laap";

// Embedded public key for minisign/ed25519 signature validation
pub const DEFAULT_UPDATER_PUBKEY: &str =
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDVBN0E0RkU3NDhEMUU3RjgKUldUNDU5Rkk1MDk2V3NlVU5UeE9sYmdSQWkxaUJTSWpjdER1QzNmVFpNTmdEanpxMWlhS0Q0NnAK";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub is_installable: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub html_url: String,
    pub download_url: Option<String>,
    pub signature: Option<String>,
    pub edition: String,
    pub platform: String,
}

static INSTALL_TRANSITION_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Returns whether an update installation transition is currently in progress.
pub fn is_install_transition_active() -> bool {
    INSTALL_TRANSITION_ACTIVE.load(std::sync::atomic::Ordering::SeqCst)
}

/// Explicitly updates the update installation transition state.
pub fn set_install_transition_active(active: bool) {
    INSTALL_TRANSITION_ACTIVE.store(active, std::sync::atomic::Ordering::SeqCst);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightSafetyStatus {
    pub safe: bool,
    pub active_match: bool,
    pub riot_running: bool,
    pub provisioning_busy: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallUpdateResult {
    pub success: bool,
    pub installed_version: String,
    pub message: String,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
pub struct PlatformUpdateInfo {
    pub signature: String,
    pub url: String,
}

#[derive(Deserialize)]
pub struct TauriUpdateManifest {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    #[serde(default)]
    pub edition: Option<String>,
    #[serde(default)]
    pub platforms: std::collections::HashMap<String, PlatformUpdateInfo>,
}

pub fn get_app_edition(_app: &AppHandle) -> &'static str {
    crate::product::update_channel()
}

pub fn get_target_platform() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x86_64"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x86_64"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "unknown"
    }
}

pub fn parse_semver(v: &str) -> (u64, u64, u64) {
    let clean = v.trim_start_matches('v').trim();
    let parts: Vec<u64> = clean
        .split('.')
        .map(|s| s.parse::<u64>().unwrap_or(0))
        .collect();
    (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    )
}

pub fn is_newer(remote: &str, current: &str) -> bool {
    let (r_maj, r_min, r_pat) = parse_semver(remote);
    let (c_maj, c_min, c_pat) = parse_semver(current);
    if r_maj != c_maj {
        r_maj > c_maj
    } else if r_min != c_min {
        r_min > c_min
    } else {
        r_pat > c_pat
    }
}

/// Parses a Minisign PublicKey from Tauri's base64 config, raw textual Minisign format, or 42-byte base64.
pub fn parse_minisign_public_key(raw_key: &str) -> Result<minisign_verify::PublicKey, String> {
    let trimmed = raw_key.trim();

    // 1. If already raw textual Minisign format
    if trimmed.contains("minisign public key") {
        return minisign_verify::PublicKey::decode(trimmed)
            .map_err(|e| format!("Failed to parse textual minisign public key: {e}"));
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for public key: {e}"))?;

    // 2a. If it's UTF-8 text containing minisign public key (Tauri's base64-encoded minisign.pub)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("minisign public key") {
            return minisign_verify::PublicKey::decode(text)
                .map_err(|e| format!("Failed to parse decoded textual minisign public key: {e}"));
        }
    }

    // 2b. If it was the 42-byte base64 string directly
    if decoded.len() == 42 {
        return minisign_verify::PublicKey::from_base64(trimmed)
            .map_err(|e| format!("Failed to parse 42-byte minisign public key: {e}"));
    }

    Err(format!(
        "Invalid minisign public key format: expected 42-byte base64 or Minisign public key record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a Minisign Signature from Tauri's base64 manifest signature or raw 4-line signature format.
pub fn parse_minisign_signature(raw_sig: &str) -> Result<minisign_verify::Signature, String> {
    let trimmed = raw_sig.trim();

    // 1. If already 4-line textual Minisign signature format
    if trimmed.contains("untrusted comment") {
        return minisign_verify::Signature::decode(trimmed)
            .map_err(|e| format!("Failed to parse textual minisign signature: {e}"));
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for signature: {e}"))?;

    // 2a. If it's UTF-8 text containing untrusted comment (Tauri's base64-encoded signature in update.json)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("untrusted comment") {
            return minisign_verify::Signature::decode(text)
                .map_err(|e| format!("Failed to parse decoded minisign signature record: {e}"));
        }
    }

    Err(format!(
        "Invalid minisign signature: expected Minisign signature record or base64-encoded record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a 32-byte ed25519 public key from either raw base64 or Minisign public key format
pub fn parse_public_key_bytes(raw_key: &str) -> Result<[u8; 32], String> {
    let trimmed = raw_key.trim();

    // 1. If the input directly contains textual minisign key lines
    if trimmed.contains("minisign public key") {
        let line2 = trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign public key format: missing key line".to_string())?
            .trim();
        let decoded = STANDARD
            .decode(line2)
            .map_err(|e| format!("Base64 decoding failed for minisign public key: {e}"))?;
        if decoded.len() == 42 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&decoded[10..42]);
            return Ok(key);
        } else if decoded.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&decoded);
            return Ok(key);
        } else {
            return Err(format!(
                "Invalid public key length in minisign line: expected 32 or 42 bytes, got {}",
                decoded.len()
            ));
        }
    }

    // 2. Decode the base64 string
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for public key: {e}"))?;

    // 2a. Raw 32-byte ed25519 public key
    if decoded.len() == 32 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded);
        return Ok(key);
    }

    // 2b. Minisign 42 bytes (2 bytes algorithm + 8 bytes key ID + 32 bytes pubkey)
    if decoded.len() == 42 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded[10..42]);
        return Ok(key);
    }

    // 2c. The embedded Tauri format (base64 of textual minisign key record, e.g. DEFAULT_UPDATER_PUBKEY)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("minisign public key") {
            let line2 = text
                .lines()
                .nth(1)
                .ok_or_else(|| "Invalid minisign public key record: missing key line".to_string())?
                .trim();
            let decoded_inner = STANDARD
                .decode(line2)
                .map_err(|e| format!("Base64 decoding failed for inner minisign key: {e}"))?;
            if decoded_inner.len() == 42 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&decoded_inner[10..42]);
                return Ok(key);
            } else if decoded_inner.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&decoded_inner);
                return Ok(key);
            }
        }
    }

    Err(format!(
        "Invalid public key length: expected 32, 42, or textual Minisign record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a 64-byte ed25519 signature from either raw base64 or Minisign signature format
pub fn parse_signature_bytes(raw_sig: &str) -> Result<[u8; 64], String> {
    let trimmed = raw_sig.trim();

    // 1. Direct textual Minisign signature
    if trimmed.contains("untrusted comment") {
        let line2 = trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign signature format: missing signature line".to_string())?
            .trim();
        let decoded = STANDARD
            .decode(line2)
            .map_err(|e| format!("Base64 decoding failed for minisign signature: {e}"))?;
        if decoded.len() == 74 {
            let mut sig = [0u8; 64];
            sig.copy_from_slice(&decoded[10..74]);
            return Ok(sig);
        } else if decoded.len() == 64 {
            let mut sig = [0u8; 64];
            sig.copy_from_slice(&decoded);
            return Ok(sig);
        } else {
            return Err(format!(
                "Invalid signature length in minisign line: expected 64 or 74 bytes, got {}",
                decoded.len()
            ));
        }
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for signature: {e}"))?;

    // 2a. Raw 64-byte ed25519 signature
    if decoded.len() == 64 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded);
        return Ok(sig);
    }

    // 2b. Minisign 74 bytes (2 bytes algorithm + 8 bytes key ID + 64 bytes signature)
    if decoded.len() == 74 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded[10..74]);
        return Ok(sig);
    }

    // 2c. Base64-encoded textual Minisign signature (Tauri update manifest format)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("untrusted comment") {
            let line2 = text
                .lines()
                .nth(1)
                .ok_or_else(|| "Invalid minisign signature record: missing signature line".to_string())?
                .trim();
            let decoded_inner = STANDARD
                .decode(line2)
                .map_err(|e| format!("Base64 decoding failed for inner minisign signature: {e}"))?;
            if decoded_inner.len() == 74 {
                let mut sig = [0u8; 64];
                sig.copy_from_slice(&decoded_inner[10..74]);
                return Ok(sig);
            } else if decoded_inner.len() == 64 {
                let mut sig = [0u8; 64];
                sig.copy_from_slice(&decoded_inner);
                return Ok(sig);
            }
        }
    }

    Err(format!(
        "Invalid signature length: expected 64, 74 bytes, or textual Minisign record, got {} bytes",
        decoded.len()
    ))
}

/// Verifies an ed25519 / minisign signature against data bytes
pub fn verify_ed25519_signature(
    public_key_str: &str,
    signature_str: &str,
    data: &[u8],
) -> Result<(), String> {
    // 1. Try Minisign verification first (official Tauri CLI / Minisign prehashed format)
    let minisign_pub = parse_minisign_public_key(public_key_str);
    let minisign_sig = parse_minisign_signature(signature_str);

    match (minisign_pub, minisign_sig) {
        (Ok(pubkey), Ok(sig)) => {
            // Minisign verification: verifies key_id match, Blake2b prehashing if is_prehashed,
            // ed25519 signature of data/hash, and ed25519 global_signature over trusted_comment!
            pubkey
                .verify(data, &sig, true)
                .map_err(|e| format!("Minisign cryptographic signature verification failed: {e:?}"))
        }
        (Err(_), _) | (_, Err(_)) => {
            // Fallback for raw 32-byte public key and raw 64-byte Ed25519 signature test fixtures
            let pubkey_bytes = parse_public_key_bytes(public_key_str)?;
            let sig_bytes = parse_signature_bytes(signature_str)?;

            let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
                .map_err(|e| format!("Invalid ed25519 verifying key: {e}"))?;
            let signature = Signature::from_bytes(&sig_bytes);

            verifying_key
                .verify(data, &signature)
                .map_err(|e| format!("Cryptographic signature verification failed: {e}"))
        }
    }
}

pub fn validate_manifest_edition(
    manifest_edition: Option<&str>,
    download_url: &str,
    app_edition: &str,
) -> Result<(), String> {
    // 1. Mandatory edition metadata enforcement: fail closed on missing, empty, or whitespace-only edition
    let declared = match manifest_edition {
        Some(e) if !e.trim().is_empty() => e.trim(),
        _ => {
            return Err("Security violation: Missing mandatory edition metadata in update manifest. Updates without explicit edition metadata are rejected.".to_string());
        }
    };

    if !declared.eq_ignore_ascii_case(app_edition) {
        return Err(format!(
            "Edition isolation violation: Manifest declared edition '{declared}' does not match installed application edition '{app_edition}'"
        ));
    }

    // 2. Reliable artifact identity checks on download URL and file basename
    let _url_lower = download_url.to_lowercase();
    let file_name = download_url
        .split('/')
        .last()
        .unwrap_or("")
        .to_lowercase();

    if file_name.is_empty() {
        return Err("Security violation: Download URL has no valid artifact filename.".to_string());
    }

    // Verify edition naming pattern in artifact identity
    if app_edition == "studio" {
        if !file_name.contains("studio") || file_name.contains("offline") || file_name.contains("desktop") {
            return Err("Artifact identity mismatch: expected a Studio installer.".into());
        }
    } else if app_edition == "offline" {
        if !file_name.contains("offline") || file_name.contains("studio") {
            return Err(format!(
                "Artifact identity mismatch: Offline edition cannot install update artifact '{file_name}' lacking 'offline' identity marker."
            ));
        }
        if file_name.contains("desktop") && !file_name.contains("offline") {
            return Err(format!(
                "Artifact identity mismatch: Offline edition rejected Team/Desktop artifact '{file_name}'."
            ));
        }
    } else if app_edition == "team" {
        if file_name.contains("offline") || file_name.contains("studio") {
            return Err(format!(
                "Artifact identity mismatch: Team edition cannot install update artifact '{file_name}' containing 'offline' identity marker."
            ));
        }
        if !file_name.contains("desktop") && !file_name.contains("team") && !file_name.contains("laap") {
            return Err(format!(
                "Artifact identity mismatch: Team edition update artifact '{file_name}' lacks recognized team identity."
            ));
        }
    } else {
        return Err(format!("Unrecognized application edition '{app_edition}'."));
    }

    // Verify valid artifact extension for platform
    let valid_extensions = [".zip", ".nsis.zip", ".exe", ".msi", ".dmg", ".tar.gz", ".app.tar.gz"];
    if !valid_extensions.iter().any(|ext| file_name.ends_with(ext)) {
        return Err(format!(
            "Security violation: Artifact '{file_name}' has invalid or untrusted extension for update payload."
        ));
    }

    Ok(())
}

/// Validates downloaded payload bytes for non-emptiness, valid container magic bytes, and signature integrity
pub fn validate_payload_bytes(
    bytes: &[u8],
    signature_str: &str,
    public_key_str: &str,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("Security violation: Downloaded update payload is empty (0 bytes).".into());
    }

    // Header magic checks for reliable artifact verification
    #[cfg(target_os = "windows")]
    {
        let is_zip = bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04";
        let is_pe = bytes.len() >= 2 && &bytes[0..2] == b"MZ";
        if !is_zip && !is_pe {
            return Err("Security violation: Downloaded Windows update payload lacks valid ZIP or PE magic header.".into());
        }
    }

    #[cfg(target_os = "macos")]
    {
        let is_gzip = bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
        if !is_gzip {
            return Err("Security violation: Downloaded macOS update payload lacks valid gzip magic header.".into());
        }
    }

    // Verify cryptographic Ed25519 signature
    verify_ed25519_signature(public_key_str, signature_str, bytes)
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_updater_preflight_status() -> PreflightSafetyStatus {
    #[cfg(not(feature = "studio"))]
    let provisioning_busy = crate::commands::session::owns_provisioning();
    #[cfg(feature = "studio")]
    let provisioning_busy = false;
    #[cfg(not(feature = "studio"))]
    let (active_match, riot_running) = {
        let snapshot = crate::riot::runtime_snapshot();
        (snapshot.active_match(), snapshot.running())
    };
    #[cfg(feature = "studio")]
    let (active_match, riot_running) = (false, false);

    let (safe, reason) = if provisioning_busy {
        (
            false,
            Some("A Riot provisioning or account capture session is currently active. Please complete or cancel it before updating.".to_string()),
        )
    } else if active_match {
        (
            false,
            Some("An active League of Legends or Valorant match was detected. To prevent game disconnection, updates are blocked until your match concludes.".to_string()),
        )
    } else {
        (true, None)
    };

    PreflightSafetyStatus {
        safe,
        active_match,
        riot_running,
        provisioning_busy,
        reason,
    }
}

#[tauri::command]
pub async fn native_install_update(
    app: AppHandle,
    force_close_riot: Option<bool>,
) -> Result<InstallUpdateResult, String> {
    if cfg!(feature = "studio") {
        return Err("Studio automatic installation awaits a verified signed native upgrade. Use the release page for available downloads.".into());
    }
    #[cfg(feature = "studio")]
    let _ = force_close_riot;
    // 0. Prevent simultaneous launches during update installation transition
    if INSTALL_TRANSITION_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("An update installation transition is already in progress. Simultaneous installer launches are blocked.".into());
    }

    struct TransitionGuard {
        active: bool,
    }
    impl Drop for TransitionGuard {
        fn drop(&mut self) {
            if self.active {
                INSTALL_TRANSITION_ACTIVE.store(false, Ordering::SeqCst);
            }
        }
    }
    let mut transition_guard = TransitionGuard { active: true };

    // 1. Initial preflight safety check before initiating network download
    let initial_preflight = get_updater_preflight_status();
    if !initial_preflight.safe {
        let _ = app.emit("laap:update-status", "deferred");
        return Err(initial_preflight
            .reason
            .unwrap_or_else(|| "Preflight safety check failed: update deferred.".into()));
    }

    // 2. Query official Tauri updater
    let updater = app
        .updater()
        .map_err(|e| format!("Failed to initialize native updater plugin: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Native updater check failed: {e}"))?;

    let update = match update {
        Some(u) => u,
        None => return Err("No signed update is currently available to install.".into()),
    };

    let target_version = update.version.clone();
    let current_version = app.package_info().version.to_string();

    if !is_newer(&target_version, &current_version) {
        return Err(format!(
            "Remote version ({target_version}) is not newer than currently installed ({current_version})"
        ));
    }

    // Enforce edition isolation and artifact identity on updater manifest and download URL
    let app_edition = get_app_edition(&app);
    let declared_edition = update.raw_json.get("edition").and_then(|v| v.as_str());
    if let Err(e) = validate_manifest_edition(declared_edition, update.download_url.as_str(), app_edition) {
        let _ = app.emit("laap:update-status", "error");
        return Err(e);
    }

    // 3. Emit downloading status & download payload with progress
    let _ = app.emit("laap:update-status", "downloading");

    let app_clone = app.clone();
    let downloaded_bytes = Arc::new(AtomicU64::new(0));
    let downloaded_ref = downloaded_bytes.clone();

    let bytes = update
        .download(
            move |chunk_len, total_len| {
                let downloaded = downloaded_ref.fetch_add(chunk_len as u64, Ordering::Relaxed)
                    + (chunk_len as u64);
                let total = total_len.unwrap_or(0);
                let percentage = if total > 0 {
                    (downloaded as f64 / total as f64) * 100.0
                } else {
                    0.0
                };
                let _ = app_clone.emit(
                    "laap:update-download-progress",
                    DownloadProgress {
                        downloaded,
                        total,
                        percentage: percentage.min(100.0),
                    },
                );
            },
            || {
                // Download complete
            },
        )
        .await
        .map_err(|e| format!("Update download or cryptographic signature verification failed: {e}"))?;

    // 4. Emit verifying & ready status
    let _ = app.emit("laap:update-status", "verifying");

    // Cryptographically verify downloaded payload bytes, container magic headers, and size
    validate_payload_bytes(&bytes, &update.signature, DEFAULT_UPDATER_PUBKEY)
        .map_err(|e| {
            let _ = app.emit("laap:update-status", "error");
            e
        })?;

    let _ = app.emit("laap:update-status", "ready");

    // 5. CRITICAL TIMING GAP ELIMINATION: Post-download, immediate pre-installation safety check
    let immediate_preflight = get_updater_preflight_status();
    if !immediate_preflight.safe {
        let _ = app.emit("laap:update-status", "deferred");
        let reason = immediate_preflight.reason.unwrap_or_else(|| {
            "An active match or provisioning session was detected after download. Installation safely deferred until match or session concludes.".into()
        });
        return Err(format!("INSTALLATION_DEFERRED: {reason}"));
    }

    // Re-verify edition isolation immediately before executing installation
    if let Err(e) = validate_manifest_edition(declared_edition, update.download_url.as_str(), app_edition) {
        let _ = app.emit("laap:update-status", "error");
        return Err(e);
    }

    // 6. Cleanup before applying installer: NEVER ignore failures of mandatory safety operations
    #[cfg(not(feature = "studio"))]
    if force_close_riot.unwrap_or(false) && immediate_preflight.riot_running {
        crate::riot::terminate_riot_processes()
            .map_err(|e| format!("Mandatory safety operation failed: unable to terminate Riot processes before update: {e}"))?;
    }

    #[cfg(not(feature = "studio"))]
    crate::presence::stop_proxy()
        .map_err(|e| format!("Mandatory safety operation failed: unable to stop presence proxy before update: {e}"))?;

    #[cfg(not(feature = "studio"))]
    crate::tray::prepare_quit(true).await
        .map_err(|e| format!("Mandatory safety operation failed: unable to prepare tray quit before update: {e}"))?;

    // CRITICAL: Recheck protected Riot operations immediately before installer execution
    let final_preflight = get_updater_preflight_status();
    if !final_preflight.safe {
        let _ = app.emit("laap:update-status", "deferred");
        let reason = final_preflight.reason.unwrap_or_else(|| {
            "A protected Riot operation was detected during final pre-installation inspection. Installation safely deferred.".into()
        });
        return Err(format!("INSTALLATION_DEFERRED: {reason}"));
    }

    let _ = app.emit("laap:update-status", "installing");

    // We are now handing off execution to the installer / relaunch
    transition_guard.active = false;

    // 7. Apply update
    update
        .install(bytes)
        .map_err(|e| {
            INSTALL_TRANSITION_ACTIVE.store(false, Ordering::SeqCst);
            format!("Failed to apply update installer: {e}")
        })?;

    #[cfg(target_os = "macos")]
    {
        app.restart();
    }

    #[cfg(not(target_os = "macos"))]
    Ok(InstallUpdateResult {
        success: true,
        installed_version: target_version,
        message: "Update applied successfully. Application is restarting...".into(),
    })
}

#[tauri::command]
pub async fn check_github_update(
    app: AppHandle,
) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let edition = get_app_edition(&app).to_string();
    let platform = get_target_platform().to_string();

    // 1. First check official Tauri updater plugin (handles cryptographic signature & official endpoints)
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let declared_edition = update.raw_json.get("edition").and_then(|v| v.as_str());
            if validate_manifest_edition(declared_edition, update.download_url.as_str(), &edition).is_ok() {
                let remote_ver = update.version.trim_start_matches('v').to_string();
                let has_update = is_newer(&remote_ver, &current_version);
                let has_sig = !update.signature.trim().is_empty();
                return Ok(UpdateCheckResult {
                    has_update,
                    is_installable: !cfg!(feature = "studio") && has_update && has_sig,
                    current_version: current_version.clone(),
                    latest_version: remote_ver,
                    release_name: format!("Release v{}", update.version),
                    release_notes: update.body.unwrap_or_default(),
                    published_at: update.date.map(|d| d.to_string()).unwrap_or_default(),
                    html_url: format!("https://github.com/{}/releases/latest", GITHUB_REPO),
                    download_url: Some(update.download_url.to_string()),
                    signature: Some(update.signature),
                    edition,
                    platform,
                });
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("LAAP-Desktop-Updater")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    // 2. Try fetching edition-specific update manifest (e.g. latest-team.json or latest-offline.json)
    let manifest_url = format!(
        "https://github.com/{}/releases/latest/download/latest-{}.json",
        GITHUB_REPO, edition
    );

    if let Ok(manifest_res) = client
        .get(&manifest_url)
        .header("Accept", "application/json")
        .send()
        .await
    {
        if manifest_res.status().is_success() {
            if let Ok(manifest) = manifest_res.json::<TauriUpdateManifest>().await {
                // Validate edition declared in manifest
                let declared_edition = manifest.edition.as_deref();
                let remote_ver = manifest.version.trim_start_matches('v').to_string();
                let has_update = is_newer(&remote_ver, &current_version);

                let platform_info = manifest
                    .platforms
                    .get(&platform)
                    .or_else(|| if platform.starts_with("darwin-") { manifest.platforms.get("darwin-universal") } else { None });

                let (download_url, signature) = match platform_info {
                    Some(info) => (Some(info.url.clone()), Some(info.signature.clone())),
                    None => (None, None),
                };

                let edition_valid = if let Some(ref d_url) = download_url {
                    validate_manifest_edition(declared_edition, d_url, &edition).is_ok()
                } else {
                    false
                };

                let has_sig = signature.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
                let is_installable = !cfg!(feature = "studio") && has_update && edition_valid && has_sig && download_url.is_some();

                return Ok(UpdateCheckResult {
                    has_update: has_update && (edition != "studio" || edition_valid),
                    is_installable,
                    current_version: current_version.clone(),
                    latest_version: remote_ver,
                    release_name: format!("Release v{}", manifest.version),
                    release_notes: manifest.notes.unwrap_or_default(),
                    published_at: manifest.pub_date.unwrap_or_default(),
                    html_url: format!("https://github.com/{}/releases/latest", GITHUB_REPO),
                    download_url,
                    signature,
                    edition,
                    platform,
                });
            }
        }
    }

    // 3. Fallback to GitHub Releases API (Advisory Release Notification Only)
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let res = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Network error checking for updates: {e}"))?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheckResult {
            has_update: false,
            is_installable: false,
            current_version: current_version.clone(),
            latest_version: current_version,
            release_name: "No releases found".into(),
            release_notes: "".into(),
            published_at: "".into(),
            html_url: format!("https://github.com/{}", GITHUB_REPO),
            download_url: None,
            signature: None,
            edition,
            platform,
        });
    }

    if !res.status().is_success() {
        return Err(format!("GitHub API error: status {}", res.status()));
    }

    let release: GitHubRelease = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release data: {e}"))?;

    if release.draft {
        return Ok(UpdateCheckResult {
            has_update: false,
            is_installable: false,
            current_version: current_version.clone(),
            latest_version: current_version,
            release_name: "".into(),
            release_notes: "".into(),
            published_at: "".into(),
            html_url: format!("https://github.com/{}", GITHUB_REPO),
            download_url: None,
            signature: None,
            edition,
            platform,
        });
    }

    let remote_version = release.tag_name.trim_start_matches('v').to_string();
    let has_update = is_newer(&remote_version, &current_version);

    // Locate edition-matching installer asset
    let expected_substr = match edition.as_str() { "offline" => "offline", "studio" => "studio", _ => "desktop" };
    let matching_asset = release.assets.iter().find(|a| {
        let lower = a.name.to_lowercase();
        lower.contains(expected_substr) && (lower.ends_with(".exe") || lower.ends_with(".zip") || lower.ends_with(".dmg") || lower.ends_with(".tar.gz"))
    });

    let download_url = matching_asset.map(|a| a.browser_download_url.clone());
    let has_update = has_update && (edition != "studio" || matching_asset.is_some());

    // Release notification only: ordinary GitHub release assets are NOT verified in-app update payloads
    Ok(UpdateCheckResult {
        has_update,
        is_installable: false,
        current_version,
        latest_version: remote_version,
        release_name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
        html_url: release
            .html_url
            .unwrap_or_else(|| format!("https://github.com/{}/releases/latest", GITHUB_REPO)),
        download_url,
        signature: None,
        edition,
        platform,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_comparison() {
        assert!(is_newer("0.4.9", "0.4.8"));
        assert!(is_newer("0.5.0", "0.4.8"));
        assert!(is_newer("1.0.0", "0.4.8"));
        assert!(!is_newer("0.4.8", "0.4.8"));
        assert!(!is_newer("0.4.7", "0.4.8"));
        assert!(!is_newer("0.3.9", "0.4.8"));
        assert!(is_newer("v0.4.9", "0.4.8"));
        assert!(is_newer("0.4.8", "0.4.7"));
    }

    #[test]
    fn test_signature_verification_valid_and_invalid() {
        use ed25519_dalek::{Signer, SigningKey};

        // Generate deterministic test keypair
        let seed = [42u8; 32];
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();

        let pubkey_base64 = STANDARD.encode(verifying_key.to_bytes());
        let payload = b"LAAP verified update payload v0.4.9";

        // Generate valid signature
        let sig = signing_key.sign(payload);
        let sig_base64 = STANDARD.encode(sig.to_bytes());

        // Valid signature passes
        assert!(verify_ed25519_signature(&pubkey_base64, &sig_base64, payload).is_ok());

        // Tampered payload fails
        let tampered = b"LAAP tampered payload v0.4.9";
        assert!(verify_ed25519_signature(&pubkey_base64, &sig_base64, tampered).is_err());

        // Corrupted signature fails
        let corrupt_sig = STANDARD.encode([0u8; 64]);
        assert!(verify_ed25519_signature(&pubkey_base64, &corrupt_sig, payload).is_err());
    }

    #[test]
    fn test_edition_mismatch_detection() {
        // Matching edition and URL succeeds
        assert!(validate_manifest_edition(
            Some("team"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_ok());

        assert!(validate_manifest_edition(
            Some("offline"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Offline-1.0.0-x64-setup.nsis.zip",
            "offline"
        ).is_ok());

        // Manifest declared edition mismatch fails
        assert!(validate_manifest_edition(
            Some("offline"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Offline-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());

        assert!(validate_manifest_edition(
            Some("team"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "offline"
        ).is_err());

        // Mandatory edition metadata enforcement: None or empty fails closed
        assert!(validate_manifest_edition(
            None,
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());

        assert!(validate_manifest_edition(
            Some(""),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());

        assert!(validate_manifest_edition(
            Some("   "),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());

        // Defense-in-depth URL filename mismatch fails closed
        assert!(validate_manifest_edition(
            Some("offline"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "offline"
        ).is_err());

        assert!(validate_manifest_edition(
            Some("team"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Offline-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());

        // Untrusted file extension fails closed
        assert!(validate_manifest_edition(
            Some("team"),
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0.sh",
            "team"
        ).is_err());
    }

    #[test]
    fn studio_installer_cannot_cross_legacy_channels() {
        let studio = "https://github.com/Kingof3O/laap/releases/download/v2.0.0/LAAP_Studio_2.0.0_x64-setup.exe";
        let offline = "https://github.com/Kingof3O/laap/releases/download/v2.0.0/LAAP_Offline_2.0.0_x64-setup.exe";
        assert!(validate_manifest_edition(Some("studio"), studio, "studio").is_ok());
        assert!(validate_manifest_edition(Some("team"), studio, "team").is_err());
        assert!(validate_manifest_edition(Some("offline"), studio, "offline").is_err());
        assert!(validate_manifest_edition(Some("studio"), offline, "studio").is_err());
    }

    #[test]
    fn test_payload_validation_empty_and_tampered() {
        let fake_sig = STANDARD.encode([0u8; 64]);
        let fake_pubkey = DEFAULT_UPDATER_PUBKEY;

        // Empty payload rejected
        assert!(validate_payload_bytes(&[], &fake_sig, fake_pubkey).is_err());

        // Corrupted payload rejected
        let corrupted_bytes = vec![0u8; 1024];
        assert!(validate_payload_bytes(&corrupted_bytes, &fake_sig, fake_pubkey).is_err());
    }

    #[test]
    fn test_simultaneous_launch_transition_lock() {
        set_install_transition_active(false);
        assert!(!is_install_transition_active());

        set_install_transition_active(true);
        assert!(is_install_transition_active());

        // Reset state
        set_install_transition_active(false);
        assert!(!is_install_transition_active());
    }

    #[test]
    fn test_platform_architecture_detection() {
        let platform = get_target_platform();
        assert!(!platform.is_empty());
    }

    #[test]
    fn test_default_updater_pubkey_parsing() {
        // 1. DEFAULT_UPDATER_PUBKEY must parse successfully into a 32-byte Ed25519 public key
        let pubkey_bytes = parse_public_key_bytes(DEFAULT_UPDATER_PUBKEY)
            .expect("DEFAULT_UPDATER_PUBKEY must parse into 32-byte public key");
        assert_eq!(pubkey_bytes.len(), 32);
        assert!(!pubkey_bytes.iter().all(|&b| b == 0));

        // 2. DEFAULT_UPDATER_PUBKEY must parse successfully into a Minisign PublicKey struct
        let minisign_pubkey = parse_minisign_public_key(DEFAULT_UPDATER_PUBKEY)
            .expect("DEFAULT_UPDATER_PUBKEY must parse into minisign PublicKey");
        assert_eq!(minisign_pubkey.untrusted_comment(), Some("untrusted comment: minisign public key: 5A7A4FE748D1E7F8"));
    }

    #[test]
    fn test_tauri_cli_real_signature_verification_and_tamper_detection() {
        // Pinned test public key produced by `tauri signer generate`
        let test_pubkey = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUyN0MzMUQ5QUI0NTNBNUEKUldSYU9rV3IyVEY4VWhuVGRTcHhnVW1vbldzTWZnZVh3VmNudjdVQTNKQzM2SkZlQzg1Qm9PeDMK";

        #[cfg(target_os = "macos")]
        let (test_signature, genuine_payload) = {
            let sig = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYU9rV3IyVEY4VXZrckJrL0NpNWt3MWU1a0pReDEzaC9xME5ySFRtcHRyVndRUlRzQ09FRGJKd1Qzdk5mWmpuenhEQW5qM0NmWEdmdHZCeTZDZWE2dWhFNTQ4UTg1UlFBPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0Mjc5MjM4CWZpbGU6bGFhcC1tYWMtcGF5bG9hZC5iaW4KdENweDBLT3BvT3ZHYjJyN3FpNHNrbkF4NUhxVVp0cjhCVzdZdzhKdnFCZVVaRHE0YzZqM1hPUVp2blZ1UXA5YVZuNWtmQnBlTGdNYXNlVEF5b2ZJQVE9PQo=";
            let mut payload = vec![0x1f, 0x8b, 0x08, 0x00];
            payload.extend_from_slice(b"LAAP Verified Release Update Executable Payload v1.1.0");
            (sig, payload)
        };

        #[cfg(not(target_os = "macos"))]
        let (test_signature, genuine_payload) = {
            let sig = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYU9rV3IyVEY4VWh2ZXhMSDE5QldrYTNMdVVyV3JoMmlJMkdOem1BVXJtL2lVOUNWQUhpV1JNVndxMVVRN0JKL3B3dlpYNjc3clBVTEhUMXpDdFY1VzdjeXRhL1J3cHdVPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0Mjc5MjM4CWZpbGU6bGFhcC13aW4tcGF5bG9hZC5iaW4KVlBUaG5BNEJTb3JOMlNSdWdpKzhvcnl2YUNiYW5pNk5uMFF5YjFaK0FqL3hSRDJDdDF6SFJsSlRxWGc4ZEVicjFINVU4NVhaR1ZFdWR2emYydDlnREE9PQo=";
            let mut payload = vec![0x4d, 0x5a, 0x90, 0x00];
            payload.extend_from_slice(b"LAAP Verified Release Update Executable Payload v1.1.0");
            (sig, payload)
        };

        // 1. Genuine payload verification passes through production verify_ed25519_signature
        let verify_res = verify_ed25519_signature(test_pubkey, test_signature, &genuine_payload);
        assert!(verify_res.is_ok(), "Genuine Tauri CLI signature must verify: {:?}", verify_res);

        // 2. Genuine payload verification passes through production validate_payload_bytes (checks magic bytes + signature)
        let payload_res = validate_payload_bytes(&genuine_payload, test_signature, test_pubkey);
        assert!(payload_res.is_ok(), "Genuine payload must pass validate_payload_bytes: {:?}", payload_res);

        // 3. Tampered payload fails closed (1 byte altered in body)
        let mut tampered_payload = genuine_payload.clone();
        tampered_payload[10] ^= 0xff;
        assert!(verify_ed25519_signature(test_pubkey, test_signature, &tampered_payload).is_err());
        assert!(validate_payload_bytes(&tampered_payload, test_signature, test_pubkey).is_err());

        // 4. Tampered signature fails closed (corrupted signature bytes)
        let decoded_text = String::from_utf8(STANDARD.decode(test_signature).unwrap()).unwrap();
        let mut lines: Vec<String> = decoded_text.lines().map(|s| s.to_string()).collect();
        let corrupted_line2 = format!("{}AAAA", &lines[1][..lines[1].len() - 4]);
        lines[1] = corrupted_line2;
        let tampered_sig_text = lines.join("\n");
        let tampered_signature = STANDARD.encode(tampered_sig_text);
        assert!(verify_ed25519_signature(test_pubkey, &tampered_signature, &genuine_payload).is_err());

        // 5. Wrong key fails closed (verifying with DEFAULT_UPDATER_PUBKEY instead of test_pubkey)
        assert!(verify_ed25519_signature(DEFAULT_UPDATER_PUBKEY, test_signature, &genuine_payload).is_err());
    }

    #[test]
    fn test_live_tauri_cli_signing_integration() {
        // If npx is available in the environment, generate an ephemeral keypair dynamically
        // and run live signing with tauri signer sign, leaving zero static secret literals in code.
        let keygen_output = std::process::Command::new("npx")
            .args(&["--workspace", "@laap/desktop", "tauri", "signer", "generate", "-p", ""])
            .output();

        let (privkey, pubkey) = match keygen_output {
            Ok(ref output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut lines = stdout.lines();
                let mut priv_opt = None;
                let mut pub_opt = None;
                while let Some(line) = lines.next() {
                    if line.contains("Private:") {
                        priv_opt = lines.next().map(|s| s.trim().to_string());
                    } else if line.contains("Public:") {
                        pub_opt = lines.next().map(|s| s.trim().to_string());
                    }
                }
                match (priv_opt, pub_opt) {
                    (Some(privk), Some(pubk)) if !privk.is_empty() && !pubk.is_empty() => (privk, pubk),
                    _ => return,
                }
            }
            _ => return,
        };

        let temp_dir = std::env::temp_dir();
        let payload_path = temp_dir.join(format!("laap_live_sign_test_{}.bin", std::process::id()));

        #[cfg(target_os = "macos")]
        let mut test_payload = vec![0x1f, 0x8b, 0x08, 0x00];
        #[cfg(not(target_os = "macos"))]
        let mut test_payload = vec![0x4d, 0x5a, 0x90, 0x00];
        test_payload.extend_from_slice(b"Live Tauri Signer Integration Test Binary Payload");

        std::fs::write(&payload_path, &test_payload).expect("write test payload");

        let sign_result = std::process::Command::new("npx")
            .args(&[
                "--workspace",
                "@laap/desktop",
                "tauri",
                "signer",
                "sign",
                "-p",
                "",
                payload_path.to_str().unwrap(),
            ])
            .env("TAURI_SIGNING_PRIVATE_KEY", &privkey)
            .output();

        if let Ok(output) = sign_result {
            if output.status.success() {
                let sig_path = temp_dir.join(format!("laap_live_sign_test_{}.bin.sig", std::process::id()));
                if sig_path.exists() {
                    let sig_content = std::fs::read_to_string(&sig_path).expect("read sig file");
                    
                    // Validate with exact production functions
                    let valid = validate_payload_bytes(&test_payload, sig_content.trim(), &pubkey);
                    assert!(valid.is_ok(), "Live Tauri CLI signature must validate: {:?}", valid);

                    // Tamper detection with live signature
                    let mut tampered = test_payload.clone();
                    tampered[6] ^= 0xaa;
                    let invalid = validate_payload_bytes(&tampered, sig_content.trim(), &pubkey);
                    assert!(invalid.is_err(), "Tampered payload must fail verification");

                    let _ = std::fs::remove_file(sig_path);
                }
            }
        }

        let _ = std::fs::remove_file(payload_path);
    }
}
