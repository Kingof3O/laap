pub mod device;
pub mod injection;
pub mod monitor;

pub use device::DeviceIdentity;
pub use injection::{LaunchRequest, SecureLauncher, TransientLaunchPayload};
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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![device_public_key, sign_device_nonce, runtime_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
