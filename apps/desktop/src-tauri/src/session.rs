use std::fs;
use std::path::PathBuf;
use sysinfo::System;

const RIOT_SETTINGS_FILENAMES: [&str; 2] = [
    "RiotGamesPrivateSettings.yaml",
    "RiotClientPrivateSettings.yaml",
];

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
            data_dir: Self::detect_riot_data_dir(),
        }
    }

    pub fn with_custom_dir(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

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

    /// Checks if any Riot Client or League process is currently running.
    pub fn is_riot_running() -> bool {
        let mut system = System::new_all();
        system.refresh_all();
        for process in system.processes().values() {
            let name = process.name().to_string_lossy().to_ascii_lowercase();
            if name.contains("riotclientservices")
                || name.contains("riot client")
                || name.contains("leagueclientux")
                || name.contains("leagueclient")
                || name.contains("league of legends")
                || name.contains("leagueoflegends")
            {
                return true;
            }
        }
        false
    }

    /// Gracefully terminates any running Riot Client or League processes and waits until all file locks are released.
    pub fn terminate_riot_processes() -> Result<(), String> {
        let mut system = System::new_all();
        system.refresh_all();

        let mut found = false;
        for process in system.processes().values() {
            let name = process.name().to_string_lossy().to_ascii_lowercase();
            if name.contains("riotclientservices")
                || name.contains("riot client")
                || name.contains("leagueclientux")
                || name.contains("leagueclient")
                || name.contains("league of legends")
                || name.contains("leagueoflegends")
            {
                found = true;
                let _ = process.kill();
            }
        }

        if found {
            // Wait up to 2 seconds for processes to fully exit and release file handles
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if !Self::is_riot_running() {
                    break;
                }
            }
        }

        Ok(())
    }

    /// Injects an authenticated session token into Riot Client directory.
    /// Safely creates a backup of existing settings if present.
    pub fn inject_session(&self, session_yaml: &str) -> Result<(), String> {
        Self::terminate_riot_processes()?;
        fs::create_dir_all(&self.data_dir).map_err(|e| format!("Failed to create Riot data dir: {e}"))?;

        for name in &RIOT_SETTINGS_FILENAMES {
            let settings_path = self.data_dir.join(name);
            let backup_path = self.data_dir.join(format!("{name}.backup"));

            // If settings file exists and we don't have a backup yet, back it up
            if settings_path.exists() && !backup_path.exists() {
                let _ = fs::copy(&settings_path, &backup_path);
            }

            // Write the new managed session token
            let _ = fs::write(&settings_path, session_yaml);
        }

        Ok(())
    }

    /// Cleans up the managed session and restores the user's original backup.
    pub fn cleanup_session(&self) -> Result<(), String> {
        for name in &RIOT_SETTINGS_FILENAMES {
            let settings_path = self.data_dir.join(name);
            let backup_path = self.data_dir.join(format!("{name}.backup"));

            // Remove the temporary managed session
            if settings_path.exists() {
                let _ = fs::remove_file(&settings_path);
            }

            // Restore original user settings if backup exists
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, &settings_path);
            }
        }

        Ok(())
    }

    /// Reads currently existing active session YAML on disk if present.
    pub fn read_active_session(&self) -> Option<String> {
        for path in self.settings_file_paths() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if is_valid_session_blob(&content) {
                        return Some(content);
                    }
                }
            }
        }
        None
    }
}

/// Automates capturing new session tokens in an isolated provisioner workflow.
#[derive(Debug, Clone)]
pub struct RiotProvisioner {
    manager: RiotSessionManager,
    initial_content: Option<String>,
}

impl Default for RiotProvisioner {
    fn default() -> Self {
        Self::new()
    }
}

impl RiotProvisioner {
    pub fn new() -> Self {
        Self {
            manager: RiotSessionManager::new(),
            initial_content: None,
        }
    }

    pub fn with_manager(manager: RiotSessionManager) -> Self {
        Self {
            manager,
            initial_content: None,
        }
    }

    /// Starts provisioning by preparing a clean session state.
    pub fn prepare_for_provisioning(&mut self) -> Result<(), String> {
        RiotSessionManager::terminate_riot_processes()?;
        fs::create_dir_all(&self.manager.data_dir)
            .map_err(|e| format!("Failed to create Riot data dir: {e}"))?;

        // Read initial content from any existing settings file
        self.initial_content = self.manager.read_active_session();

        for name in &RIOT_SETTINGS_FILENAMES {
            let settings_path = self.manager.data_dir.join(name);
            let backup_path = self.manager.data_dir.join(format!("{name}.backup"));

            if settings_path.exists() {
                if !backup_path.exists() {
                    let _ = fs::copy(&settings_path, &backup_path);
                }
                let _ = fs::remove_file(&settings_path);
            }
        }

        Ok(())
    }

    /// Polls the settings file to check if Riot Client has written a new authenticated session.
    pub fn poll_captured_session(&self) -> Result<Option<String>, String> {
        for path in self.manager.settings_file_paths() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if is_valid_session_blob(&content) {
                        return Ok(Some(content));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Finishes provisioning: restores backup settings.
    pub fn finish_and_restore(&self) -> Result<(), String> {
        self.manager.cleanup_session()
    }
}

fn is_valid_session_blob(content: &str) -> bool {
    let has_token = content.contains("refresh_token") && content.contains("id_token");
    let is_logged_out = content.contains("riot-client: null")
        || content.contains("id_token: null")
        || content.contains("refresh_token: null");

    has_token && !is_logged_out && content.len() > 100
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn test_session_injection_and_cleanup() {
        let test_dir = temp_dir().join(format!("laap-test-session-{}", rand::random::<u32>()));
        let manager = RiotSessionManager::with_custom_dir(test_dir.clone());

        let fake_session = "psl:\n  authorization:\n    riot-client:\n      id_token: fake_jwt_token_here_with_enough_length_to_be_valid\n      refresh_token: fake_refresh\n      scopes:\n      - openid\n";

        manager.inject_session(fake_session).unwrap();
        assert!(manager.read_active_session().is_some());

        manager.cleanup_session().unwrap();
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_provisioner_flow() {
        let test_dir = temp_dir().join(format!("laap-test-prov-{}", rand::random::<u32>()));
        let manager = RiotSessionManager::with_custom_dir(test_dir.clone());
        let mut provisioner = RiotProvisioner::with_manager(manager.clone());

        provisioner.prepare_for_provisioning().unwrap();
        assert_eq!(provisioner.poll_captured_session().unwrap(), None);

        let active_yaml = "psl:\n  authorization:\n    riot-client:\n      id_token: token_jwt_data_example_for_provisioning_test\n      refresh_token: refresh_data\n";
        fs::write(test_dir.join("RiotGamesPrivateSettings.yaml"), active_yaml).unwrap();

        let captured = provisioner.poll_captured_session().unwrap();
        assert!(captured.is_some());

        provisioner.finish_and_restore().unwrap();
        let _ = fs::remove_dir_all(test_dir);
    }
}
