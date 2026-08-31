use std::process::Command;
use super::{DeviceIdentity, ProcessSnapshot};

const LEAGUE_LAUNCH_ARGS: [&str; 2] = ["--launch-product=league_of_legends", "--launch-patchline=live"];

#[tauri::command]
pub(crate) fn device_public_key() -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.public_key()).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn sign_device_nonce(nonce: String) -> Result<String, String> {
    DeviceIdentity::load_or_create().map(|identity| identity.sign_nonce(&nonce)).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn runtime_snapshot() -> ProcessSnapshot { ProcessSnapshot::detect() }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_arguments_are_normal_league_arguments_without_secrets() {
        assert_eq!(LEAGUE_LAUNCH_ARGS, ["--launch-product=league_of_legends", "--launch-patchline=live"]);
        assert!(LEAGUE_LAUNCH_ARGS.iter().all(|argument| !argument.contains("password") && !argument.contains("token")));
    }
}
