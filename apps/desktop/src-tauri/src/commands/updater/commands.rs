use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

use super::models::{
    DownloadProgress, GitHubRelease, InstallUpdateResult, PreflightSafetyStatus,
    TauriUpdateManifest, UpdateCheckResult, DEFAULT_UPDATER_PUBKEY, GITHUB_REPO,
};
use super::platform::{get_target_platform, is_newer};
use super::safety::{
    set_install_transition_active, validate_manifest_edition, validate_payload_bytes,
    TransitionGuard,
};

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_updater_preflight_status() -> PreflightSafetyStatus {
    let provisioning_busy = crate::commands::session::owns_provisioning();
    let (active_match, riot_running) = {
        let snapshot = crate::riot::runtime_snapshot();
        (snapshot.active_match(), snapshot.running())
    };

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
    // 0. Prevent simultaneous launches during update installation transition
    // Set lock
    set_install_transition_active(true);
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
    let declared_edition = update.raw_json.get("edition").and_then(|v| v.as_str());
    if let Err(e) = validate_manifest_edition(declared_edition, update.download_url.as_str()) {
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
    if let Err(e) = validate_manifest_edition(declared_edition, update.download_url.as_str()) {
        let _ = app.emit("laap:update-status", "error");
        return Err(e);
    }

    // 6. Cleanup before applying installer: NEVER ignore failures of mandatory safety operations
    if force_close_riot.unwrap_or(false) && immediate_preflight.riot_running {
        crate::riot::terminate_riot_processes()
            .map_err(|e| format!("Mandatory safety operation failed: unable to terminate Riot processes before update: {e}"))?;
    }

    crate::presence::stop_proxy()
        .map_err(|e| format!("Mandatory safety operation failed: unable to stop presence proxy before update: {e}"))?;

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
            set_install_transition_active(false);
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
    let edition = crate::product::update_channel().to_string();
    let platform = get_target_platform().to_string();

    // 1. First check official Tauri updater plugin (handles cryptographic signature & official endpoints)
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let declared_edition = update.raw_json.get("edition").and_then(|v| v.as_str());
            if validate_manifest_edition(declared_edition, update.download_url.as_str()).is_ok() {
                let remote_ver = update.version.trim_start_matches('v').to_string();
                let has_update = is_newer(&remote_ver, &current_version);
                let has_sig = !update.signature.trim().is_empty();
                return Ok(UpdateCheckResult {
                    has_update,
                    is_installable: has_update && has_sig,
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

    // 2. Try fetching the Offline update manifest
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
                    validate_manifest_edition(declared_edition, d_url).is_ok()
                } else {
                    false
                };

                let has_sig = signature.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
                let is_installable = has_update && edition_valid && has_sig && download_url.is_some();

                return Ok(UpdateCheckResult {
                    has_update,
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
    let matching_asset = release.assets.iter().find(|a| {
        let lower = a.name.to_lowercase();
        lower.contains("offline") && (lower.ends_with(".exe") || lower.ends_with(".zip") || lower.ends_with(".dmg") || lower.ends_with(".tar.gz"))
    });

    let download_url = matching_asset.map(|a| a.browser_download_url.clone());

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
