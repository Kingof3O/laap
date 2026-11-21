use crate::local_store::{LocalAccountStorage, LocalStore};

use super::models::{LiveStatusResult, LiveStatusSettingsSummary, SaveLiveStatusSettingsInput};
use super::orchestration::check_account_live_status_with_account;
use super::storage::{build_settings_summary, read_config_from, read_secrets_from, save_settings_to_dir};

#[tauri::command]
pub async fn get_live_status_settings() -> Result<LiveStatusSettingsSummary, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = LocalAccountStorage::default_storage_dir();
        let config = read_config_from(&dir)?;
        let secrets = read_secrets_from(&dir)?;
        Ok(build_settings_summary(&config, &secrets))
    })
    .await
    .map_err(|e| format!("Native operation failed: {e}"))?
}

#[tauri::command]
pub async fn save_live_status_settings(
    input: SaveLiveStatusSettingsInput,
) -> Result<LiveStatusSettingsSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = LocalAccountStorage::default_storage_dir();
        save_settings_to_dir(&dir, input)
    })
    .await
    .map_err(|e| format!("Native operation failed: {e}"))?
}

#[tauri::command]
pub async fn check_account_live_status(
    account_id: Option<String>,
    region: String,
    name: String,
    bypass_cache: Option<bool>,
) -> Result<LiveStatusResult, String> {
    let dir = LocalAccountStorage::default_storage_dir();
    let account = if let Some(ref id) = account_id {
        let store = LocalStore::new()?;
        store
            .load_accounts()?
            .into_iter()
            .find(|acc| &acc.id == id)
    } else {
        None
    };

    if account_id.is_some() && account.is_none() {
        return Err("Select an active profile to check its live status.".into());
    }
    check_account_live_status_with_account(
        &dir,
        account_id.as_deref(),
        account.as_ref(),
        region,
        name,
        bypass_cache,
    )
    .await
}
