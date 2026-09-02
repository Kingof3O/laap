use std::fs;
use std::time::Instant;
use super::session_manager::RiotSessionManager;

/// Orchestrates Riot Client login capture in a sandboxed, clean session.
#[derive(Debug)]
pub struct RiotProvisioner {
    manager: RiotSessionManager,
    started_at: Instant,
    captured_session: Option<String>,
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
            started_at: Instant::now(),
            captured_session: None,
        }
    }

    pub fn with_manager(manager: RiotSessionManager) -> Self {
        Self {
            manager,
            started_at: Instant::now(),
            captured_session: None,
        }
    }

    pub fn prepare_for_provisioning(&mut self) -> Result<(), String> {
        RiotSessionManager::terminate_riot_processes()?;

        for (settings_path, backup_path) in self
            .manager
            .settings_file_paths()
            .iter()
            .zip(self.manager.backup_file_paths().iter())
        {
            if settings_path.exists() && !backup_path.exists() {
                let _ = fs::copy(settings_path, backup_path);
            }
            if settings_path.exists() {
                let _ = fs::remove_file(settings_path);
            }
        }

        self.started_at = Instant::now();
        self.captured_session = None;
        Ok(())
    }

    pub fn poll_captured_session(&self) -> Result<Option<String>, String> {
        if let Some(session) = &self.captured_session {
            return Ok(Some(session.clone()));
        }
        for path in self.manager.settings_file_paths() {
            if path.exists() {
                if let Ok(metadata) = fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(elapsed) = modified.elapsed() {
                            if elapsed.as_secs() > 1800 {
                                continue;
                            }
                        }
                    }
                }
                if let Ok(content) = fs::read_to_string(&path) {
                    if content.contains("login_remember_me_tokens:")
                        || content.contains("rso_token:")
                        || content.contains("rso_access_token:")
                        || content.contains("remember_me")
                    {
                        return Ok(Some(content));
                    }
                }
            }
        }
        Ok(None)
    }

    pub fn finish_and_restore(&mut self) -> Result<(), String> {
        RiotSessionManager::terminate_riot_processes()?;

        for (settings_path, backup_path) in self
            .manager
            .settings_file_paths()
            .iter()
            .zip(self.manager.backup_file_paths().iter())
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
}
