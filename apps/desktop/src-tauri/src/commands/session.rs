use std::process::Command;
use std::sync::Mutex;
use crate::riot::{RiotProvisioner, RiotSessionManager};

pub const LEAGUE_LAUNCH_ARGS: [&str; 2] = [
    "--launch-product=league_of_legends",
    "--launch-patchline=live",
];

static PROVISIONER: Mutex<Option<RiotProvisioner>> = Mutex::new(None);

#[tauri::command]
pub fn is_riot_running() -> bool {
    RiotSessionManager::is_riot_running()
}

/// Forcefully closes all running Riot Client and League processes.
#[tauri::command]
pub fn close_riot_client() -> Result<(), String> {
    RiotSessionManager::terminate_riot_processes()
}

/// Injects the managed Riot session token YAML before launching.
#[tauri::command]
pub fn inject_account_session(session_yaml: String) -> Result<(), String> {
    let manager = RiotSessionManager::new();
    manager.inject_session(&session_yaml)
}

/// Cleans up the managed Riot session and restores original user settings.
#[tauri::command]
pub fn cleanup_account_session() -> Result<(), String> {
    let manager = RiotSessionManager::new();
    manager.cleanup_session()
}

/// Opens Riot Client without credentials or launch arguments.
#[tauri::command]
pub fn launch_riot_client() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Riot Client", "--args", LEAGUE_LAUNCH_ARGS[0], LEAGUE_LAUNCH_ARGS[1]])
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            std::env::var("PROGRAMFILES").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
            std::env::var("LOCALAPPDATA").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
        ];
        let path = candidates
            .into_iter()
            .flatten()
            .find(|candidate| std::path::Path::new(candidate).exists())
            .ok_or_else(|| "Riot Client was not found".to_string())?;
        Command::new(path)
            .args(LEAGUE_LAUNCH_ARGS)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("This desktop build only supports macOS and Windows".to_string())
    }
}

/// Starts an automated 1-click provisioning session for admins.
#[tauri::command]
pub fn start_provisioning_session() -> Result<(), String> {
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
pub fn capture_active_session() -> Result<Option<String>, String> {
    let manager = RiotSessionManager::new();
    Ok(manager.read_active_session())
}

/// Polls for captured session credentials written by Riot Client upon login.
#[tauri::command]
pub fn poll_provisioning_session() -> Result<Option<String>, String> {
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
pub fn finish_provisioning_session() -> Result<(), String> {
    let mut lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    if let Some(mut provisioner) = lock.take() {
        provisioner.finish_and_restore()
    } else {
        Ok(())
    }
}

/// Cancels provisioning session and restores previous state.
#[tauri::command]
pub fn cancel_provisioning_session() -> Result<(), String> {
    let mut lock = PROVISIONER.lock().map_err(|e| e.to_string())?;
    if let Some(mut provisioner) = lock.take() {
        provisioner.finish_and_restore()
    } else {
        Ok(())
    }
}

/// Opens an external URL in the user's default system browser.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
