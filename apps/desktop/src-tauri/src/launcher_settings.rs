use crate::local_store::LocalAccountStorage;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresenceMode {
    #[default]
    Online,
    Offline,
}
impl LauncherSettings {
    pub fn select_startup_mode(&mut self) {
        self.presence_mode = self.startup_presence;
    }
}
impl PresenceMode {
    pub fn command(self) -> &'static str {
        match self {
            Self::Online => "online",
            Self::Offline => "offline",
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LauncherSettings {
    pub riot_client_path: Option<String>,
    pub presence_enabled: bool,
    pub presence_mode: PresenceMode,
    pub startup_presence: PresenceMode,
}
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());
pub fn load() -> Result<LauncherSettings, String> {
    read_from(&LocalAccountStorage::default_storage_dir().join("launcher-settings.json"))
}
fn read_from(path: &Path) -> Result<LauncherSettings, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
            "Launcher settings are damaged. Restore launcher-settings.json from a backup.".into()
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(LauncherSettings::default()),
        Err(e) => Err(format!("Unable to read launcher settings: {e}")),
    }
}
pub fn update(
    action: impl FnOnce(&mut LauncherSettings) -> Result<(), String>,
) -> Result<LauncherSettings, String> {
    let _guard = SETTINGS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let root = LocalAccountStorage::default_storage_dir();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("launcher-settings.lock"))
        .map_err(|e| e.to_string())?;
    lock.lock_exclusive().map_err(|e| e.to_string())?;
    let path = root.join("launcher-settings.json");
    let mut settings = read_from(&path)?;
    action(&mut settings)?;
    atomic_write(
        &path,
        &serde_json::to_vec(&settings).map_err(|e| e.to_string())?,
    )?;
    Ok(settings)
}
pub(crate) fn atomic_write(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("Missing destination directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(".laap-{:032x}.tmp", rand::random::<u128>()));
    let result = (|| {
        crate::riot::session_manager::write_private(&temp, bytes)?;
        fs::OpenOptions::new()
            .write(true)
            .open(&temp)
            .and_then(|file| file.sync_all())
            .map_err(|e| e.to_string())?;
        #[cfg(not(target_os = "windows"))]
        fs::rename(&temp, destination).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{
                MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
            };
            let from: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
            let to: Vec<u16> = destination
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            if unsafe {
                MoveFileExW(
                    from.as_ptr(),
                    to.as_ptr(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preferences_replace_atomically_on_the_host_platform() {
        let root =
            std::env::temp_dir().join(format!("laap-preferences-{:032x}", rand::random::<u128>()));
        let path = root.join("launcher-settings.json");
        atomic_write(&path, br#"{"presence_mode":"online"}"#).unwrap();
        atomic_write(
            &path,
            br#"{"presence_mode":"offline","presence_enabled":true}"#,
        )
        .unwrap();
        let settings = read_from(&path).unwrap();
        assert!(settings.presence_enabled);
        assert_eq!(settings.presence_mode, PresenceMode::Offline);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn old_session_mode_does_not_become_the_startup_default() {
        let settings: LauncherSettings =
            serde_json::from_str(r#"{"presence_mode":"offline"}"#).unwrap();
        let saved = serde_json::to_value(settings.clone()).unwrap();
        assert_eq!(saved["startup_presence"], "online");
        let mut current = settings;
        current.select_startup_mode();
        assert_eq!(current.presence_mode, PresenceMode::Online);
    }
    #[test]
    fn offline_startup_choice_survives_settings_round_trip() {
        let settings: LauncherSettings =
            serde_json::from_str(r#"{"startup_presence":"offline","presence_mode":"online"}"#)
                .unwrap();
        let saved = serde_json::to_value(settings.clone()).unwrap();
        assert_eq!(saved["startup_presence"], "offline");
        assert_eq!(saved["presence_mode"], "online");
        let mut current = settings;
        current.select_startup_mode();
        assert_eq!(current.presence_mode, PresenceMode::Offline);
    }
    #[test]
    fn old_settings_default_to_normal_online_launches() {
        let settings: LauncherSettings = serde_json::from_str("{}").unwrap();
        assert!(!settings.presence_enabled);
        assert_eq!(settings.presence_mode, PresenceMode::Online);
        assert!(settings.riot_client_path.is_none());
    }
}
