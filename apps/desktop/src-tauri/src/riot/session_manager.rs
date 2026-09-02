use std::fs;
use std::path::PathBuf;
use super::paths::{detect_riot_data_dir, RIOT_SETTINGS_FILENAMES};
use super::process::{is_riot_running, terminate_riot_processes};

/// Manages Riot Client session token files for isolated 1-click launch and teardown.
#[derive(Debug, Clone)]
pub struct RiotSessionManager {
    data_dir: PathBuf,
}

impl Default for RiotSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RiotSessionManager {
    pub fn new() -> Self {
        Self {
            data_dir: detect_riot_data_dir(),
        }
    }

    pub fn with_custom_dir(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub fn settings_file_paths(&self) -> Vec<PathBuf> {
        RIOT_SETTINGS_FILENAMES
            .iter()
            .map(|name| self.data_dir.join(name))
            .collect()
    }

    pub fn backup_file_paths(&self) -> Vec<PathBuf> {
        RIOT_SETTINGS_FILENAMES
            .iter()
            .map(|name| self.data_dir.join(format!("{name}.backup")))
            .collect()
    }

    pub fn is_riot_running() -> bool {
        is_riot_running()
    }

    pub fn terminate_riot_processes() -> Result<(), String> {
        terminate_riot_processes()
    }

    pub fn inject_session(&self, session_yaml: &str) -> Result<(), String> {
        Self::terminate_riot_processes()?;

        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir).map_err(|e| e.to_string())?;
        }

        for (settings_path, backup_path) in self
            .settings_file_paths()
            .iter()
            .zip(self.backup_file_paths().iter())
        {
            if settings_path.exists() && !backup_path.exists() {
                let _ = fs::copy(settings_path, backup_path);
            }
            fs::write(settings_path, session_yaml).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn cleanup_session(&self) -> Result<(), String> {
        Self::terminate_riot_processes()?;

        for (settings_path, backup_path) in self
            .settings_file_paths()
            .iter()
            .zip(self.backup_file_paths().iter())
        {
            if backup_path.exists() {
                let _ = fs::copy(backup_path, settings_path);
                let _ = fs::remove_file(backup_path);
            } else if settings_path.exists() {
                let _ = fs::remove_file(settings_path);
            }
        }

        Ok(())
    }

    pub fn read_active_session(&self) -> Option<String> {
        for path in self.settings_file_paths() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if content.contains("login_remember_me_tokens:")
                        || content.contains("rso_token:")
                        || content.contains("rso_access_token:")
                        || content.contains("remember_me")
                    {
                        return Some(content);
                    }
                }
            }
        }
        None
    }
}
