use std::fs;
use std::path::PathBuf;
use super::models::LocalAccount;

pub const LOCAL_STORE_FILENAME: &str = "laap_local_accounts.json";

#[derive(Debug, Clone)]
pub struct LocalAccountStorage {
    storage_dir: PathBuf,
}

impl Default for LocalAccountStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalAccountStorage {
    pub fn new() -> Self {
        Self {
            storage_dir: Self::default_storage_dir(),
        }
    }

    pub fn with_custom_dir(storage_dir: PathBuf) -> Self {
        Self { storage_dir }
    }

    pub fn default_storage_dir() -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                return PathBuf::from(appdata).join("LAAP");
            }
            if let Some(base_dirs) = directories::BaseDirs::new() {
                return base_dirs.config_dir().join("LAAP");
            }
            PathBuf::from("C:\\LAAP")
        }
        #[cfg(target_os = "macos")]
        {
            if let Some(base_dirs) = directories::BaseDirs::new() {
                return base_dirs.data_dir().join("LAAP");
            }
            if let Ok(home) = std::env::var("HOME") {
                return PathBuf::from(home).join("Library").join("Application Support").join("LAAP");
            }
            PathBuf::from("/Library/Application Support/LAAP")
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            PathBuf::from(".laap_local")
        }
    }

    pub fn file_path(&self) -> PathBuf {
        self.storage_dir.join(LOCAL_STORE_FILENAME)
    }

    pub fn load(&self) -> Result<Vec<LocalAccount>, String> {
        let path = self.file_path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read local accounts store: {e}"))?;

        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        serde_json::from_str::<Vec<LocalAccount>>(&content)
            .map_err(|e| format!("Failed to parse local accounts store: {e}"))
    }

    pub fn save(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        fs::create_dir_all(&self.storage_dir)
            .map_err(|e| format!("Failed to create storage dir: {e}"))?;

        let json = serde_json::to_string_pretty(accounts)
            .map_err(|e| format!("Failed to serialize local accounts: {e}"))?;

        fs::write(self.file_path(), json)
            .map_err(|e| format!("Failed to write local accounts store: {e}"))?;

        Ok(())
    }
}
