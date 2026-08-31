pub mod device;
pub mod monitor;
mod commands;

pub use device::DeviceIdentity;
pub use monitor::{ClientState, ProcessSnapshot, RuntimeMonitor};

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::device_public_key, commands::sign_device_nonce, commands::runtime_snapshot, commands::launch_riot_client])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
