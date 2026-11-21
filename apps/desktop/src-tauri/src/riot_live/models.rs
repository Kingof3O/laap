use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const SETTINGS_FILENAME: &str = "live-status-settings.json";
pub const SECRETS_FILENAME: &str = "live-status-secrets.enc";
pub const PUUID_CACHE_FILENAME: &str = "live-status-puuids.json";
pub const SECRETS_AAD: &str = "live-status-secrets:v1";
pub const INVALID_PUUID_ERR_PREFIX: &str = "[RIOT_INVALID_PUUID] ";
pub const STATUS_CACHE_TTL: Duration = Duration::from_secs(45);
pub const SHORT_WINDOW: Duration = Duration::from_secs(1);
pub const SHORT_LIMIT: usize = 18;
pub const LONG_WINDOW: Duration = Duration::from_secs(120);
pub const LONG_LIMIT: usize = 90;
pub const MAX_CACHE_ENTRIES: usize = 512;

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
pub struct LiveStatusSecrets {
    pub riot_api_key: String,
    pub worker_token: String,
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedApiPuuidEntry {
    pub puuid: String,
    pub updated_at: String,
}
