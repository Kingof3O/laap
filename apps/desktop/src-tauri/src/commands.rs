use std::process::Command;
use std::sync::Mutex;
use super::DeviceIdentity;
use super::session::{RiotProvisioner, RiotSessionManager};

const LEAGUE_LAUNCH_ARGS: [&str; 2] = ["--launch-product=league_of_legends", "--launch-patchline=live"];

static PROVISIONER: Mutex<Option<RiotProvisioner>> = Mutex::new(None);

#[tauri::command]
pub(crate) fn device_public_key() -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.public_key()).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn sign_device_nonce(nonce: String) -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.sign_nonce(&nonce)).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn is_riot_running() -> bool {
    RiotSessionManager::is_riot_running()
}

#[tauri::command]
pub(crate) fn device_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    { "unknown" }
}

/// Forcefully closes all running Riot Client and League processes.
#[tauri::command]
pub(crate) fn close_riot_client() -> Result<(), String> {
    RiotSessionManager::terminate_riot_processes()
}

/// Injects the managed Riot session token YAML before launching.
#[tauri::command]
pub(crate) fn inject_account_session(session_yaml: String) -> Result<(), String> {
    let manager = RiotSessionManager::new();
    manager.inject_session(&session_yaml)
}

/// Cleans up the managed Riot session and restores original user settings.
#[tauri::command]
pub(crate) fn cleanup_account_session() -> Result<(), String> {
    let manager = RiotSessionManager::new();
    manager.cleanup_session()
}

/// Starts an automated 1-click provisioning session for admins.
#[tauri::command]
pub(crate) fn start_provisioning_session() -> Result<(), String> {
    let mut provisioner = RiotProvisioner::new();
    provisioner.prepare_for_provisioning()?;

    let mut lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    *lock = Some(provisioner);

    // Launch Riot Client to clean login screen
    launch_riot_client()?;

    Ok(())
}

/// Reads any currently active Riot session on disk.
#[tauri::command]
pub(crate) fn capture_active_session() -> Result<Option<String>, String> {
    let manager = RiotSessionManager::new();
    Ok(manager.read_active_session())
}

/// Polls for captured session credentials written by Riot Client upon login.
#[tauri::command]
pub(crate) fn poll_provisioning_session() -> Result<Option<String>, String> {
    let lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    if let Some(provisioner) = lock.as_ref() {
        provisioner.poll_captured_session()
    } else {
        let manager = RiotSessionManager::new();
        Ok(manager.read_active_session())
    }
}

/// Finishes provisioning session and cleans up temporary state.
#[tauri::command]
pub(crate) fn finish_provisioning_session() -> Result<(), String> {
    let mut lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    if let Some(provisioner) = lock.take() {
        provisioner.finish_and_restore()
    } else {
        Ok(())
    }
}

/// Cancels provisioning session and restores previous state.
#[tauri::command]
pub(crate) fn cancel_provisioning_session() -> Result<(), String> {
    let mut lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    if let Some(provisioner) = lock.take() {
        provisioner.finish_and_restore()
    } else {
        Ok(())
    }
}

/// Opens Riot Client without credentials or launch arguments.
#[tauri::command]
pub(crate) fn launch_riot_client() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { Command::new("open").args(["-a", "Riot Client", "--args", LEAGUE_LAUNCH_ARGS[0], LEAGUE_LAUNCH_ARGS[1]]).spawn().map(|_| ()).map_err(|error| error.to_string()) }
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            std::env::var("PROGRAMFILES").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
            std::env::var("LOCALAPPDATA").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
        ];
        let path = candidates.into_iter().flatten().find(|candidate| std::path::Path::new(candidate).exists()).ok_or_else(|| "Riot Client was not found".to_string())?;
        Command::new(path).args(LEAGUE_LAUNCH_ARGS).spawn().map(|_| ()).map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { Err("This desktop build only supports macOS and Windows".to_string()) }
}

/// Lists all accounts stored in the local standalone vault.
#[tauri::command]
pub(crate) fn list_local_accounts() -> Result<Vec<super::local_store::LocalAccountSummary>, String> {
    let store = super::local_store::LocalStore::new();
    store.list_summaries()
}

/// Returns the full local account details including its session blob.
#[tauri::command]
pub(crate) fn get_local_account(id: String) -> Result<super::local_store::LocalAccount, String> {
    let store = super::local_store::LocalStore::new();
    let accounts = store.load_accounts()?;
    accounts.into_iter().find(|a| a.id == id).ok_or_else(|| "Account not found".to_string())
}

/// Saves or updates a local account in the local standalone vault.
#[tauri::command]
pub(crate) fn save_local_account(name: String, region: String, session_blob: String) -> Result<super::local_store::LocalAccountSummary, String> {
    let store = super::local_store::LocalStore::new();
    let account = store.add_account(name, region, session_blob)?;
    Ok(super::local_store::LocalAccountSummary::from(&account))
}

/// Deletes an account from the local standalone vault.
#[tauri::command]
pub(crate) fn delete_local_account(id: String) -> Result<(), String> {
    let store = super::local_store::LocalStore::new();
    store.delete_account(&id)
}

/// 1-Click Launches an account from the local standalone vault.
#[tauri::command]
pub(crate) fn launch_local_account(id: String) -> Result<(), String> {
    let store = super::local_store::LocalStore::new();
    store.launch_account(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_arguments_are_normal_league_arguments_without_secrets() {
        assert_eq!(LEAGUE_LAUNCH_ARGS, ["--launch-product=league_of_legends", "--launch-patchline=live"]);
        assert!(LEAGUE_LAUNCH_ARGS.iter().all(|argument| !argument.contains("password") && !argument.contains("token")));
    }
}
