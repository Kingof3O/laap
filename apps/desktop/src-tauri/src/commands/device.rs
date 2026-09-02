use crate::DeviceIdentity;

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
