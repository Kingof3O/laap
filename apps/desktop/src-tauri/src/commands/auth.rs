use keyring::Entry;

const KEYRING_SERVICE: &str = "com.laaP.desktop";
const KEYRING_ACCOUNT: &str = "laap-access-token-v1";

#[tauri::command]
pub fn load_access_token() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn store_access_token(token: String) -> Result<(), String> {
    if token.trim().is_empty() || token.len() > 4096 {
        return Err("Access token is invalid".to_string());
    }
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())?;
    entry
        .set_password(token.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_access_token() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
