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
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUzNDM5QzAzQjE1NzQxRjUKUldTY2JicXRCSnBnU0lrcnI3Vk1YTUw0TG1uWmVJNXcxTEtYQXB3QnNXU2s3T0tKWHoxV0h5OHMK";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
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

pub fn get_app_edition(app: &AppHandle) -> &'static str {
    let identifier = app.config().identifier.to_lowercase();
    if identifier.contains("offline") {
        "offline"
    } else {
        "team"
    }
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

/// Parses a 32-byte ed25519 public key from either raw base64 or Minisign public key format
pub fn parse_public_key_bytes(raw_key: &str) -> Result<[u8; 32], String> {
    let trimmed = raw_key.trim();
    let base64_part = if trimmed.contains("minisign public key") {
        trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign public key format".to_string())?
            .trim()
    } else {
        trimmed
    };

    let decoded = STANDARD
        .decode(base64_part)
        .map_err(|e| format!("Base64 decoding failed for public key: {e}"))?;

    // Raw 32 bytes or minisign 42 bytes (2 bytes algorithm + 8 bytes key ID + 32 bytes pubkey)
    if decoded.len() == 32 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded);
        Ok(key)
    } else if decoded.len() == 42 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded[10..42]);
        Ok(key)
    } else {
        Err(format!(
            "Invalid public key length: expected 32 or 42 bytes, got {}",
            decoded.len()
        ))
    }
}

/// Parses a 64-byte ed25519 signature from either raw base64 or Minisign signature format
pub fn parse_signature_bytes(raw_sig: &str) -> Result<[u8; 64], String> {
    let trimmed = raw_sig.trim();
    let base64_part = if trimmed.contains("untrusted comment") {
        trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign signature format".to_string())?
            .trim()
    } else {
        trimmed
    };

    let decoded = STANDARD
        .decode(base64_part)
        .map_err(|e| format!("Base64 decoding failed for signature: {e}"))?;

    // Raw 64 bytes or minisign 74 bytes (2 bytes algorithm + 8 bytes key ID + 64 bytes signature)
    if decoded.len() == 64 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded);
        Ok(sig)
    } else if decoded.len() == 74 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded[10..74]);
        Ok(sig)
    } else {
        Err(format!(
            "Invalid signature length: expected 64 or 74 bytes, got {}",
            decoded.len()
        ))
    }
}

/// Verifies an ed25519 / minisign signature against data bytes
pub fn verify_ed25519_signature(
    public_key_str: &str,
    signature_str: &str,
    data: &[u8],
) -> Result<(), String> {
    let pubkey_bytes = parse_public_key_bytes(public_key_str)?;
    let sig_bytes = parse_signature_bytes(signature_str)?;

    let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
        .map_err(|e| format!("Invalid ed25519 verifying key: {e}"))?;
    let signature = Signature::from_bytes(&sig_bytes);

    verifying_key
        .verify(data, &signature)
        .map_err(|e| format!("Cryptographic signature verification failed: {e}"))
}

pub fn validate_manifest_edition(
    manifest_edition: Option<&str>,
    download_url: &str,
    app_edition: &str,
) -> Result<(), String> {
    if let Some(declared) = manifest_edition {
        if !declared.eq_ignore_ascii_case(app_edition) {
            return Err(format!(
                "Edition isolation violation: Manifest declared edition '{declared}' does not match installed application edition '{app_edition}'"
            ));
        }
    }

    let url_lower = download_url.to_lowercase();
    if app_edition == "offline" && !url_lower.contains("offline") {
        return Err("Edition isolation violation: Offline edition cannot install non-offline update bundle.".into());
    }
    if app_edition == "team" && url_lower.contains("offline") {
        return Err("Edition isolation violation: Team edition cannot install offline update bundle.".into());
    }

    Ok(())
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_updater_preflight_status() -> PreflightSafetyStatus {
    let provisioning_busy = crate::commands::session::owns_provisioning();
    let snapshot = crate::riot::runtime_snapshot();
    let active_match = snapshot.active_match();
    let riot_running = snapshot.running();

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

    // Enforce edition isolation on updater manifest and download URL
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

    // 6. Cleanup before applying installer with defensive error handling
    if force_close_riot.unwrap_or(false) && immediate_preflight.riot_running {
        if let Err(e) = crate::riot::terminate_riot_processes() {
            eprintln!("Non-fatal warning terminating Riot processes before update: {e}");
        }
        let recheck = crate::riot::runtime_snapshot();
        if recheck.active_match() {
            let _ = app.emit("laap:update-status", "deferred");
            return Err("INSTALLATION_DEFERRED: Active match detected during process shutdown. Aborting installation to protect active game.".into());
        }
    }

    if let Err(e) = crate::presence::stop_proxy() {
        eprintln!("Non-fatal warning stopping presence proxy before update: {e}");
    }
    if let Err(e) = crate::tray::prepare_quit(true).await {
        eprintln!("Non-fatal warning preparing tray quit before update: {e}");
    }

    let _ = app.emit("laap:update-status", "installing");

    // 7. Apply update
    update
        .install(bytes)
        .map_err(|e| format!("Failed to apply update installer: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        let _ = app.restart();
    }

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
                return Ok(UpdateCheckResult {
                    has_update,
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

    // 1. Try fetching edition-specific update manifest (e.g. latest-team.json or latest-offline.json)
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
                // Validate edition if declared in manifest
                if let Some(ref manifest_edition) = manifest.edition {
                    if !manifest_edition.eq_ignore_ascii_case(&edition) {
                        return Err(format!(
                            "Edition mismatch: App edition is '{edition}' but update manifest is for '{manifest_edition}'"
                        ));
                    }
                }

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

                return Ok(UpdateCheckResult {
                    has_update,
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

    // 2. Fallback to GitHub Releases API
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
    let expected_substr = if edition == "offline" { "offline" } else { "desktop" };
    let matching_asset = release.assets.iter().find(|a| {
        let lower = a.name.to_lowercase();
        lower.contains(expected_substr) && (lower.ends_with(".exe") || lower.ends_with(".zip") || lower.ends_with(".dmg") || lower.ends_with(".tar.gz"))
    });

    let download_url = matching_asset.map(|a| a.browser_download_url.clone());

    Ok(UpdateCheckResult {
        has_update,
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

        // Defense-in-depth URL filename mismatch fails even if manifest declared edition is None
        assert!(validate_manifest_edition(
            None,
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.nsis.zip",
            "offline"
        ).is_err());

        assert!(validate_manifest_edition(
            None,
            "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Offline-1.0.0-x64-setup.nsis.zip",
            "team"
        ).is_err());
    }

    #[test]
    fn test_platform_architecture_detection() {
        let platform = get_target_platform();
        assert!(!platform.is_empty());
    }
}
