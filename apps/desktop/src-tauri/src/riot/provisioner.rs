use super::{
    session_format::has_persisted_session,
    session_manager::{write_private, RiotSessionManager},
};
use std::{fs, path::PathBuf};

/// A synchronous, explicitly owned sandbox. Polling is initiated by the UI;
/// cancelled sandboxes never fall back to the user's active session.
#[derive(Debug)]
pub struct RiotProvisioner {
    manager: RiotSessionManager,
    staging: Option<PathBuf>,
    originals: Vec<(String, bool)>,
}
impl Default for RiotProvisioner {
    fn default() -> Self {
        Self::new()
    }
}
impl RiotProvisioner {
    pub fn new() -> Self {
        Self::with_manager(RiotSessionManager::new())
    }
    pub fn with_manager(manager: RiotSessionManager) -> Self {
        Self {
            manager,
            staging: None,
            originals: vec![],
        }
    }
    pub fn prepare_for_provisioning(&mut self) -> Result<(), String> {
        if self.staging.is_some() {
            return Err("Sign-in sandbox already started".into());
        }
        self.manager.stop_processes()?;
        fs::create_dir_all(self.manager.data_dir()).map_err(|e| e.to_string())?;
        let staging = self
            .manager
            .data_dir()
            .join(format!(".laap-provision-{:032x}", rand::random::<u128>()));
        fs::create_dir(&staging).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&staging, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let prepare = (|| {
            let mut originals = vec![];
            for name in super::RIOT_SETTINGS_FILENAMES {
                let path = self.manager.data_dir().join(name);
                originals.push((name.to_string(), path.exists()));
                if path.exists() {
                    write_private(
                        &staging.join(name),
                        &fs::read(path).map_err(|e| e.to_string())?,
                    )?;
                }
            }
            write_private(
                &staging.join("manifest.json"),
                &serde_json::to_vec(&originals).map_err(|e| e.to_string())?,
            )?;
            Ok::<_, String>(originals)
        })();
        match prepare {
            Ok(originals) => self.originals = originals,
            Err(error) => {
                let _ = fs::remove_dir_all(&staging);
                return Err(error);
            }
        }
        self.staging = Some(staging);
        for path in self.manager.settings_file_paths() {
            if path.exists() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn poll_captured_session(&self) -> Result<Option<String>, String> {
        if self.staging.is_none() {
            return Ok(None);
        }
        for path in self.manager.settings_file_paths() {
            match fs::read_to_string(path) {
                Ok(content) if has_persisted_session(&content) => return Ok(Some(content)),
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("Unable to read Riot sign-in: {error}")),
            }
        }
        Ok(None)
    }
    pub fn finish_and_restore(&mut self) -> Result<(), String> {
        self.finish_and_restore_confirmed(false)
    }
    pub fn finish_and_restore_confirmed(&mut self, confirmed: bool) -> Result<(), String> {
        let Some(staging) = self.staging.as_ref() else {
            return Ok(());
        };
        self.manager.stop_processes_confirmed(confirmed)?;
        Self::restore(&self.manager, staging, &self.originals)?;
        fs::remove_dir_all(staging)
            .map_err(|e| format!("Unable to remove sign-in staging files: {e}"))?;
        self.staging = None;
        self.originals.clear();
        Ok(())
    }
    fn restore(
        manager: &RiotSessionManager,
        staging: &std::path::Path,
        originals: &[(String, bool)],
    ) -> Result<(), String> {
        for (name, existed) in originals {
            if !super::RIOT_SETTINGS_FILENAMES.contains(&name.as_str()) {
                return Err("Invalid sandbox recovery manifest".into());
            }
            let path = manager.data_dir().join(name);
            if *existed {
                write_private(
                    &path,
                    &fs::read(staging.join(name)).map_err(|e| e.to_string())?,
                )?;
            } else if path.exists() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn recover_abandoned(manager: &RiotSessionManager) -> Result<bool, String> {
        if !manager.data_dir().exists() {
            return Ok(false);
        }
        let mut restored = false;
        for entry in fs::read_dir(manager.data_dir()).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir()
                || !entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".laap-provision-")
            {
                continue;
            }
            let staging = entry.path();
            let manifest = staging.join("manifest.json");
            if !manifest.exists() {
                fs::remove_dir_all(staging).map_err(|e| e.to_string())?;
                continue;
            }
            let originals = serde_json::from_slice::<Vec<(String, bool)>>(
                &fs::read(manifest).map_err(|e| e.to_string())?,
            )
            .map_err(|_| "Invalid sandbox recovery manifest".to_string())?;
            Self::restore(manager, &staging, &originals)?;
            fs::remove_dir_all(staging).map_err(|e| e.to_string())?;
            restored = true;
        }
        Ok(restored)
    }
}
