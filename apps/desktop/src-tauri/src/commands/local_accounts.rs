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

#[tauri::command]
pub async fn basic_profile_slots() -> Result<crate::local_store::ProfileSlots, String> {
    tauri::async_runtime::spawn_blocking(|| LocalStore::new()?.profile_slots())
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn select_basic_profiles(ids: Vec<String>) -> Result<crate::local_store::ProfileSlots, String> {
    tauri::async_runtime::spawn_blocking(move || LocalStore::new()?.select_profiles(ids))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn replace_basic_profile(active_id: String, locked_id: String) -> Result<crate::local_store::ProfileSlots, String> {
    tauri::async_runtime::spawn_blocking(move || LocalStore::new()?.replace_profile(&active_id, locked_id))
        .await.map_err(|error| error.to_string())?
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
    riot_id: Option<String>,
    games: Option<Vec<crate::local_store::Game>>,
    valorant_rank: Option<String>,
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
            riot_id,
            games,
            valorant_rank,
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
    riot_id: Option<String>,
    games: Option<Vec<crate::local_store::Game>>,
    valorant_rank: Option<String>,
) -> Result<LocalAccountSummary, String> {
    let store = LocalStore::new()?;
    let account = store.create_profile(
        crate::local_store::ProfileDetails {
            name,
            region,
            rank,
            riot_id,
            notes: notes.unwrap_or_default(),
            favorite: favorite.unwrap_or(false),
            customization,
            games: games.unwrap_or_else(crate::local_store::default_games),
            valorant_rank,
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
pub async fn launch_local_account(
    id: String,
    confirmed: Option<bool>,
    game: Option<crate::local_store::Game>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_local_account_sync(id, confirmed, game))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn launch_local_account_sync(
    id: String,
    confirmed: Option<bool>,
    game: Option<crate::local_store::Game>,
) -> Result<(), String> {
    crate::commands::session::launch_local(&id, confirmed.unwrap_or(false), game)
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

#[tauri::command]
pub async fn apply_opgg_profile(
    id: String,
    update: crate::local_store::OpggProfileUpdate,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        LocalStore::new()?.apply_opgg_profile(&id, update)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}

#[tauri::command]
pub async fn update_account_riot_id(id: String, riot_id: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = LocalStore::new()?;
        store.update_riot_id(&id, &riot_id)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
