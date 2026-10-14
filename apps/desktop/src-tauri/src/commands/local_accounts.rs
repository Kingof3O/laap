use crate::local_store::{LocalAccount, LocalAccountSummary, LocalStore};

/// Lists all accounts stored in the local standalone vault.
#[tauri::command]
pub async fn list_local_accounts() -> Result<Vec<LocalAccountSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || list_local_accounts_sync())
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn list_local_accounts_sync() -> Result<Vec<LocalAccountSummary>, String> {
    let store = LocalStore::new()?;
    store.list_summaries()
}

/// Returns the full local account details including its session blob.
#[tauri::command]
pub async fn get_local_account(id: String) -> Result<LocalAccount, String> {
    tauri::async_runtime::spawn_blocking(move || get_local_account_sync(id))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn get_local_account_sync(id: String) -> Result<LocalAccount, String> {
    let store = LocalStore::new()?;
    let accounts = store.load_accounts()?;
    accounts
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| "Account not found".to_string())
}

/// Saves or updates a local account in the local standalone vault.
#[tauri::command]
pub async fn save_local_account(
    name: String,
    region: String,
    session_blob: String,
    rank: Option<String>,
    notes: Option<String>,
    favorite: Option<bool>,
    customization: Option<crate::local_store::ProfileCustomization>,
) -> Result<LocalAccountSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_local_account_sync(
            name,
            region,
            session_blob,
            rank,
            notes,
            favorite,
            customization,
        )
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn save_local_account_sync(
    name: String,
    region: String,
    session_blob: String,
    rank: Option<String>,
    notes: Option<String>,
    favorite: Option<bool>,
    customization: Option<crate::local_store::ProfileCustomization>,
) -> Result<LocalAccountSummary, String> {
    let store = LocalStore::new()?;
    let account = store.create_profile(
        crate::local_store::ProfileDetails {
            name,
            region,
            rank,
            notes: notes.unwrap_or_default(),
            favorite: favorite.unwrap_or(false),
            customization,
        },
        session_blob,
    )?;
    Ok(LocalAccountSummary::from(&account))
}

/// Deletes an account from the local standalone vault.
#[tauri::command]
pub async fn delete_local_account(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_local_account_sync(id))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn delete_local_account_sync(id: String) -> Result<(), String> {
    let store = LocalStore::new()?;
    store.delete_account(&id)
}

/// 1-Click Launches an account from the local standalone vault.
#[tauri::command]
pub async fn launch_local_account(id: String, confirmed: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_local_account_sync(id, confirmed))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn launch_local_account_sync(id: String, confirmed: Option<bool>) -> Result<(), String> {
    crate::commands::session::launch_local(&id, confirmed.unwrap_or(false))
}

#[tauri::command]
pub async fn edit_local_account(
    id: String,
    details: crate::local_store::ProfileDetails,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || edit_local_account_sync(id, details))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn edit_local_account_sync(
    id: String,
    details: crate::local_store::ProfileDetails,
) -> Result<(), String> {
    LocalStore::new()?.edit_profile(&id, details)
}

#[tauri::command]
pub async fn refresh_local_account(id: String, session_blob: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || refresh_local_account_sync(id, session_blob))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn refresh_local_account_sync(id: String, session_blob: String) -> Result<(), String> {
    LocalStore::new()?.refresh_session(&id, session_blob)
}
