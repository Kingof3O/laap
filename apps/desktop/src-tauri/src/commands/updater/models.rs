use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
pub struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub html_url: Option<String>,
    pub published_at: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub assets: Vec<GitHubAsset>,
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
    pub platforms: HashMap<String, PlatformUpdateInfo>,
}
