pub mod device;
pub mod monitor;

use std::process::Command;

pub use device::DeviceIdentity;
pub use monitor::{ProcessSnapshot, RuntimeMonitor, RuntimeState};

#[tauri::command]
pub fn device_public_key() -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.public_key()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sign_device_nonce(nonce: String) -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.sign_nonce(&nonce)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn runtime_snapshot() -> ProcessSnapshot {
    ProcessSnapshot::detect()
}

/// Opens the user's installed Riot Client without credentials or launch
/// arguments. Authentication remains entirely inside Riot's supported client.
#[tauri::command]
pub fn launch_riot_client() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").args(["-a", "Riot Client"]).spawn().map(|_| ()).map_err(|error| error.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            std::env::var("PROGRAMFILES").ok().map(|root| format!("{root}\\Riot Vanguard\\RiotClientServices.exe")),
            std::env::var("PROGRAMFILES").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
            std::env::var("LOCALAPPDATA").ok().map(|root| format!("{root}\\Riot Games\\Riot Client\\RiotClientServices.exe")),
        ];
        let path = candidates.into_iter().flatten().find(|candidate| std::path::Path::new(candidate).exists()).ok_or_else(|| "Riot Client was not found".to_string())?;
        Command::new(path).spawn().map(|_| ()).map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { Err("This desktop build only supports macOS and Windows".to_string()) }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![device_public_key, sign_device_nonce, runtime_snapshot, launch_riot_client])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
