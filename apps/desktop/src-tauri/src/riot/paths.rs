use std::path::PathBuf;

pub const RIOT_SETTINGS_FILENAMES: [&str; 2] = [
    "RiotGamesPrivateSettings.yaml",
    "RiotClientPrivateSettings.yaml",
];

/// Detects the standard Riot Client Data directory per platform.
pub fn detect_riot_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join("Riot Games")
                .join("Riot Client")
                .join("Data");
        }
        if let Some(base_dirs) = directories::BaseDirs::new() {
            return base_dirs
                .data_local_dir()
                .join("Riot Games")
                .join("Riot Client")
                .join("Data");
        }
        PathBuf::from(r"C:\Users\Default\AppData\Local\Riot Games\Riot Client\Data")
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(base_dirs) = directories::BaseDirs::new() {
            return base_dirs
                .data_dir()
                .join("Riot Games")
                .join("Riot Client")
                .join("Data");
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Riot Games")
                .join("Riot Client")
                .join("Data");
        }
        PathBuf::from("/Library/Application Support/Riot Games/Riot Client/Data")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        PathBuf::from(".riot_data")
    }
}
