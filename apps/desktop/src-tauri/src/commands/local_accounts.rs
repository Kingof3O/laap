use crate::local_store::{LocalAccount, LocalAccountSummary, LocalStore};

/// Lists all accounts stored in the local standalone vault.
#[tauri::command]
pub fn list_local_accounts() -> Result<Vec<LocalAccountSummary>, String> {
    let store = LocalStore::new();
    store.list_summaries()
}

/// Returns the full local account details including its session blob.
#[tauri::command]
pub fn get_local_account(id: String) -> Result<LocalAccount, String> {
    let store = LocalStore::new();
    let accounts = store.load_accounts()?;
    accounts
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| "Account not found".to_string())
}

/// Saves or updates a local account in the local standalone vault.
#[tauri::command]
pub fn save_local_account(
    name: String,
    region: String,
    session_blob: String,
) -> Result<LocalAccountSummary, String> {
    let store = LocalStore::new();
    let account = store.add_account(name, region, session_blob)?;
    Ok(LocalAccountSummary::from(&account))
}

/// Deletes an account from the local standalone vault.
#[tauri::command]
pub fn delete_local_account(id: String) -> Result<(), String> {
    let store = LocalStore::new();
    store.delete_account(&id)
}

/// 1-Click Launches an account from the local standalone vault.
#[tauri::command]
pub fn launch_local_account(id: String) -> Result<(), String> {
    let store = LocalStore::new();
    store.launch_account(&id)
}
