use super::storage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GamePathConfig {
    pub custom_game_path: Option<String>,
    pub detected_game_path: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("game_path_config.json"))
}

pub fn detect_league_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Check default common locations
        let common = [
            r"C:\Riot Games\League of Legends",
            r"D:\Riot Games\League of Legends",
            r"E:\Riot Games\League of Legends",
            r"C:\Program Files\Riot Games\League of Legends",
            r"C:\Program Files (x86)\Riot Games\League of Legends",
        ];
        for path in &common {
            let p = Path::new(path);
            if p.exists() && (p.join("LeagueClient.exe").exists() || p.join("Game").exists()) {
                return Some(path.to_string());
            }
        }

        // 2. Check Windows Registry
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Riot Games, Inc\League of Legends") {
            if let Ok(location) = key.get_value::<String, _>("Location") {
                if Path::new(&location).exists() {
                    return Some(location);
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let mac_path = "/Applications/League of Legends.app";
        if Path::new(mac_path).exists() {
            return Some(mac_path.to_string());
        }
    }

    None
}

#[tauri::command]
pub fn get_game_path(app: AppHandle) -> Result<String, String> {
    let p = config_path(&app)?;
    let cfg = storage::read::<GamePathConfig>(&p, 64 * 1024)?.unwrap_or_default();
    if let Some(custom) = cfg.custom_game_path {
        if Path::new(&custom).exists() {
            return Ok(custom);
        }
    }
    if let Some(detected) = detect_league_path() {
        return Ok(detected);
    }
    Err("League of Legends game installation not detected.".into())
}

#[tauri::command]
pub fn set_game_path(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err("The specified path does not exist.".into());
    }
    if !p.is_dir() {
        return Err("The specified path is not a directory.".into());
    }

    let p_cfg = config_path(&app)?;
    let mut cfg = storage::read::<GamePathConfig>(&p_cfg, 64 * 1024)?.unwrap_or_default();
    cfg.custom_game_path = Some(trimmed.to_string());
    storage::write(&p_cfg, &cfg)?;
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn open_folder_in_explorer(folder_path: String) -> Result<bool, String> {
    let trimmed = folder_path.trim();
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err("Folder does not exist.".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {e}"))?;
        Ok(true)
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {e}"))?;
        Ok(true)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_path_config_serialization() {
        let cfg = GamePathConfig {
            custom_game_path: Some(r"C:\Games\League of Legends".into()),
            detected_game_path: None,
        };
        let serialized = serde_json::to_string(&cfg).unwrap();
        assert!(serialized.contains("C:\\\\Games\\\\League of Legends"));
    }
}
