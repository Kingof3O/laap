use crate::DeviceIdentity;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub platform: &'static str,
    pub device_name: String,
    pub app_version: &'static str,
}

#[tauri::command]
pub fn device_public_key() -> Result<String, String> {
    DeviceIdentity::load_or_create()
        .map(|identity| identity.public_key())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sign_device_nonce(nonce: String) -> Result<String, String> {
    DeviceIdentity::load_or_create()
        .map(|identity| identity.sign_nonce(&nonce))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn device_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "unknown"
    }
}

#[tauri::command]
pub fn device_info() -> DeviceInfo {
    DeviceInfo {
        platform: device_platform(),
        device_name: sysinfo::System::host_name().unwrap_or_else(|| "LAAP Desktop".to_string()),
        app_version: env!("CARGO_PKG_VERSION"),
    }
}
