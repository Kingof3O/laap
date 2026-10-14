use super::paths::{detect_riot_data_dir, RIOT_SETTINGS_FILENAMES};
use super::process::{
    is_riot_running, runtime_snapshot, terminate_riot_processes, RuntimeSnapshot,
};
use super::session_format::has_persisted_session;
use std::fs;
use std::path::PathBuf;

/// Manages Riot Client session token files for isolated 1-click launch and teardown.
#[derive(Debug, Clone)]
pub struct RiotSessionManager {
    data_dir: PathBuf,
    #[cfg(test)]
    isolated: bool,
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
            #[cfg(test)]
            isolated: false,
        }
    }

    pub fn with_custom_dir(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            #[cfg(test)]
            isolated: true,
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

    pub fn is_riot_running() -> bool {
        is_riot_running()
    }

    pub fn terminate_riot_processes() -> Result<(), String> {
        terminate_riot_processes()
    }

    pub fn runtime_snapshot() -> RuntimeSnapshot {
        runtime_snapshot()
    }

    pub fn stop_processes(&self) -> Result<(), String> {
        self.stop_processes_confirmed(false)
    }
    pub fn stop_processes_confirmed(&self, confirmed: bool) -> Result<(), String> {
        #[cfg(test)]
        if self.isolated {
            return Ok(());
        }
        super::process::stop_riot(confirmed)
    }

    pub fn owner_matches(&self, expected: &str) -> bool {
        fs::read_to_string(self.data_dir.join(".laap-session-owner"))
            .is_ok_and(|owner| owner == expected)
    }
    pub fn set_owner(&self, owner: &str) -> Result<(), String> {
        write_private(&self.data_dir.join(".laap-session-owner"), owner.as_bytes())
    }
    pub fn data_dir(&self) -> &std::path::Path {
        &self.data_dir
    }

    pub fn inject_session(&self, session_yaml: &str) -> Result<(), String> {
        self.stop_processes()?;
        fs::create_dir_all(&self.data_dir).map_err(|e| e.to_string())?;
        let marker = self.data_dir.join(".laap-managed-session.json");
        if !marker.exists() {
            let mut missing = vec![];
            for (path, backup) in self
                .settings_file_paths()
                .iter()
                .zip(self.backup_file_paths())
            {
                if path.exists() && !backup.exists() {
                    write_private(&backup, &fs::read(path).map_err(|e| e.to_string())?)?;
                }
                if !path.exists() {
                    missing.push(
                        path.file_name()
                            .and_then(|n| n.to_str())
                            .ok_or("Invalid settings filename")?
                            .to_string(),
                    );
                }
            }
            write_private(
                &marker,
                &serde_json::to_vec(&missing).map_err(|e| e.to_string())?,
            )?;
        }
        for path in self.settings_file_paths() {
            if let Err(error) = write_private(&path, session_yaml.as_bytes()) {
                self.restore_managed()?;
                return Err(error);
            }
        }
        Ok(())
    }
    pub fn cleanup_session(&self) -> Result<(), String> {
        self.cleanup_session_confirmed(false)
    }
    pub fn cleanup_session_confirmed(&self, confirmed: bool) -> Result<(), String> {
        self.stop_processes_confirmed(confirmed)?;
        self.restore_managed()
    }
    fn restore_managed(&self) -> Result<(), String> {
        let marker = self.data_dir.join(".laap-managed-session.json");
        let missing = if marker.exists() {
            serde_json::from_slice::<Vec<String>>(&fs::read(&marker).map_err(|e| e.to_string())?)
                .map_err(|_| "Invalid managed-session recovery marker".to_string())?
        } else {
            vec![]
        };
        for (path, backup) in self
            .settings_file_paths()
            .iter()
            .zip(self.backup_file_paths())
        {
            if backup.exists() {
                write_private(path, &fs::read(&backup).map_err(|e| e.to_string())?)?;
            } else if missing
                .iter()
                .any(|name| Some(name.as_str()) == path.file_name().and_then(|n| n.to_str()))
                && path.exists()
            {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        // Backups are removed only after all original files were restored successfully.
        for backup in self.backup_file_paths() {
            if backup.exists() {
                fs::remove_file(backup).map_err(|e| e.to_string())?;
            }
        }
        if marker.exists() {
            fs::remove_file(marker).map_err(|e| e.to_string())?;
        }
        let owner = self.data_dir.join(".laap-session-owner");
        if owner.exists() {
            fs::remove_file(owner).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Restores configuration left behind by a crashed LAAP process without
    /// touching a currently running Riot or League process. The next launch
    /// can then start from the user's original settings again.
    pub fn recover_orphaned_session(&self) -> Result<bool, String> {
        #[cfg(test)]
        let running = !self.isolated && Self::is_riot_running();
        #[cfg(not(test))]
        let running = Self::is_riot_running();
        if running {
            return Ok(false);
        }
        let sandbox = super::RiotProvisioner::recover_abandoned(self)?;
        if self.data_dir.join(".laap-managed-session.json").exists()
            || self.backup_file_paths().iter().any(|path| path.exists())
        {
            self.restore_managed()?;
            return Ok(true);
        }
        Ok(sandbox)
    }

    pub fn read_active_session(&self) -> Option<String> {
        for path in self.settings_file_paths() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if has_persisted_session(&content) {
                        return Some(content);
                    }
                }
            }
        }
        None
    }
}

/// Write session files with restrictive permissions and replace only complete writes.
pub fn write_private(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let temp = path.with_extension(format!("{:032x}.tmp", rand::random::<u128>()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        #[cfg(not(target_os = "windows"))]
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{
                MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
            };
            let from: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
            let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
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
