use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

static DEV_MODE: Mutex<bool> = Mutex::new(false);
static PERF_MODE: Mutex<bool> = Mutex::new(false);
static REGISTERED_HOTKEYS: Mutex<Vec<HotkeyConfig>> = Mutex::new(Vec::new());

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub file_path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub is_file: bool,
    pub is_dir: bool,
    pub modified_timestamp: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub hotkey_id: String,
    pub key_combination: String,
    pub action: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorReport {
    pub report_id: String,
    pub timestamp: String,
    pub context: String,
    pub error_details: String,
    pub os: String,
    pub app_version: String,
}

fn reports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("reports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn write_error_report(
    app: AppHandle,
    context: String,
    error_details: String,
) -> Result<String, String> {
    let dir = reports_dir(&app)?;
    let now = chrono::Utc::now();
    let report_id = format!("error_{}", now.format("%Y%m%d_%H%M%S_%f"));
    let report_file = dir.join(format!("{report_id}.json"));

    let report = ErrorReport {
        report_id: report_id.clone(),
        timestamp: now.to_rfc3339(),
        context,
        error_details,
        os: std::env::consts::OS.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
    };

    let data = serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?;
    fs::write(&report_file, data).map_err(|e| e.to_string())?;
    Ok(report_file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_developer_mode(enabled: bool) -> Result<bool, String> {
    let mut guard = DEV_MODE.lock().map_err(|_| "Dev mode lock unavailable.")?;
    *guard = enabled;
    Ok(enabled)
}

#[tauri::command]
pub fn get_developer_mode() -> Result<bool, String> {
    let guard = DEV_MODE.lock().map_err(|_| "Dev mode lock unavailable.")?;
    Ok(*guard)
}

#[tauri::command]
pub fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    let p = Path::new(&file_path);
    if !p.exists() {
        return Err("File or directory not found.".into());
    }

    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    let is_file = meta.is_file();
    let is_dir = meta.is_dir();
    let size_bytes = meta.len();

    let sha256 = if is_file && size_bytes <= 64 * 1024 * 1024 {
        let mut hasher = Sha256::new();
        let mut f = fs::File::open(p).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut hasher).map_err(|e| e.to_string())?;
        format!("{:x}", hasher.finalize())
    } else {
        String::new()
    };

    let modified_timestamp = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    Ok(FileInfo {
        file_path,
        size_bytes,
        sha256,
        is_file,
        is_dir,
        modified_timestamp,
    })
}

#[tauri::command]
pub fn register_hotkey(hotkey_id: String, key_combination: String, action: String) -> Result<bool, String> {
    let mut guard = REGISTERED_HOTKEYS.lock().map_err(|_| "Hotkey lock unavailable.")?;
    guard.retain(|h| h.hotkey_id != hotkey_id);
    guard.push(HotkeyConfig {
        hotkey_id,
        key_combination,
        action,
    });
    Ok(true)
}

#[tauri::command]
pub fn set_performance_mode(enabled: bool) -> Result<bool, String> {
    let mut guard = PERF_MODE.lock().map_err(|_| "Perf mode lock unavailable.")?;
    *guard = enabled;
    Ok(enabled)
}

#[tauri::command]
pub fn set_app_low_priority(low_priority: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::Threading::{
            GetCurrentProcess, SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
        };
        unsafe {
            let priority = if low_priority {
                BELOW_NORMAL_PRIORITY_CLASS
            } else {
                NORMAL_PRIORITY_CLASS
            };
            SetPriorityClass(GetCurrentProcess(), priority);
        }
    }
    Ok(low_priority)
}

#[tauri::command]
pub fn set_auto_launch(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable path: {e}"))?;
            let exe_str = exe_path.to_string_lossy();
            let status = Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "LAAP",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\"", exe_str),
                    "/f",
                ])
                .status()
                .map_err(|e| format!("Failed to execute reg.exe: {e}"))?;
            if !status.success() {
                return Err(format!("reg.exe add returned status: {:?}", status.code()));
            }
        } else {
            let _ = Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "LAAP",
                    "/f",
                ])
                .status();
        }
    }
    #[cfg(not(feature = "studio"))]
    let _ = crate::launcher_settings::update(|s| {
        s.auto_launch = enabled;
        Ok(())
    });
    Ok(enabled)
}

#[tauri::command]
pub fn get_auto_launch() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "LAAP",
            ])
            .output()
        {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("LAAP") {
                    return Ok(true);
                }
            }
        }
    }
    #[cfg(not(feature = "studio"))]
    {
        let s = crate::launcher_settings::load().unwrap_or_default();
        Ok(s.auto_launch)
    }
    #[cfg(feature = "studio")]
    Ok(false)
}

#[tauri::command]
pub fn set_minimize_to_tray(enabled: bool) -> Result<bool, String> {
    #[cfg(not(feature = "studio"))]
    {
        crate::launcher_settings::update(|s| {
            s.minimize_to_tray = enabled;
            Ok(())
        })
        .map(|s| s.minimize_to_tray)
    }
    #[cfg(feature = "studio")]
    Ok(enabled)
}

#[tauri::command]
pub fn get_minimize_to_tray() -> Result<bool, String> {
    #[cfg(not(feature = "studio"))]
    {
        let s = crate::launcher_settings::load().unwrap_or_default();
        Ok(s.minimize_to_tray)
    }
    #[cfg(feature = "studio")]
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_info_on_temp_file() {
        let temp = std::env::temp_dir().join("laap_file_info_test.txt");
        fs::write(&temp, b"test content").unwrap();
        let info = get_file_info(temp.to_string_lossy().to_string()).unwrap();
        assert!(info.is_file);
        assert_eq!(info.size_bytes, 12);
        assert!(!info.sha256.is_empty());
        let _ = fs::remove_file(temp);
    }

    #[cfg(not(feature = "studio"))]
    #[test]
    fn test_minimize_to_tray_settings_round_trip() {
        let set_res = set_minimize_to_tray(true).unwrap();
        assert!(set_res);
        let get_res = get_minimize_to_tray().unwrap();
        assert!(get_res);
        let reset_res = set_minimize_to_tray(false).unwrap();
        assert!(!reset_res);
    }

    #[cfg(not(feature = "studio"))]
    #[test]
    fn test_auto_launch_settings_load() {
        let status = get_auto_launch();
        assert!(status.is_ok());
    }
}
