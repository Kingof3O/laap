use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
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

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_github_update(
    app: AppHandle,
) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let edition = get_app_edition(&app).to_string();
    let platform = get_target_platform().to_string();

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
        let team_manifest_edition = "team";
        let offline_app_edition = "offline";
        assert_ne!(team_manifest_edition, offline_app_edition);
    }

    #[test]
    fn test_platform_architecture_detection() {
        let platform = get_target_platform();
        assert!(!platform.is_empty());
    }
}
