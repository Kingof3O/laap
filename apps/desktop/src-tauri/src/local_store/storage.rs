use super::{crypto::LocalSecretBox, models::LocalAccount};
use fs2::FileExt;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};

pub const LOCAL_STORE_FILENAME: &str = "laap_local_accounts.json";
static WRITE_LOCK: Mutex<()> = Mutex::new(());
#[derive(Debug, Clone)]
pub struct LocalAccountStorage {
    storage_dir: PathBuf,
    secret_box: LocalSecretBox,
}
impl LocalAccountStorage {
    pub fn new() -> Result<Self, String> {
        let storage_dir = Self::default_storage_dir();
        fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(storage_dir.join("vault-key.lock"))
            .map_err(|e| e.to_string())?;
        lock.lock_exclusive().map_err(|e| e.to_string())?;
        let secret_box = LocalSecretBox::load_or_create()?;
        Ok(Self {
            storage_dir,
            secret_box,
        })
    }
    #[cfg(test)]
    pub fn with_custom_dir(storage_dir: PathBuf) -> Self {
        Self {
            storage_dir,
            secret_box: LocalSecretBox::ephemeral(),
        }
    }
    pub fn default_storage_dir() -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            directories::BaseDirs::new()
                .map(|dirs| dirs.config_dir().join("LAAP"))
                .unwrap_or_else(|| PathBuf::from("C:\\LAAP"))
        }
        #[cfg(target_os = "macos")]
        {
            directories::BaseDirs::new()
                .map(|dirs| dirs.data_dir().join("LAAP"))
                .unwrap_or_else(|| PathBuf::from("/Library/Application Support/LAAP"))
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            PathBuf::from(".laap_local")
        }
    }
    pub fn file_path(&self) -> PathBuf {
        self.storage_dir.join(LOCAL_STORE_FILENAME)
    }
    fn locked<T>(&self, action: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let _guard = match WRITE_LOCK.lock() {
            Ok(guard) => guard,
            Err(error) => {
                WRITE_LOCK.clear_poison();
                error.into_inner()
            }
        };
        fs::create_dir_all(&self.storage_dir).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.storage_dir, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.storage_dir.join("vault.lock"))
            .map_err(|e| e.to_string())?;
        lock.lock_exclusive()
            .map_err(|e| format!("Unable to lock local vault: {e}"))?;
        action()
    }
    pub fn load(&self) -> Result<Vec<LocalAccount>, String> {
        self.locked(|| self.load_unlocked())
    }
    pub fn save(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        self.locked(|| self.save_unlocked(accounts))
    }
    pub fn update<T>(
        &self,
        action: impl FnOnce(&mut Vec<LocalAccount>) -> Result<T, String>,
    ) -> Result<T, String> {
        self.locked(|| {
            let mut accounts = self.load_unlocked()?;
            let result = action(&mut accounts)?;
            self.save_unlocked(&accounts)?;
            Ok(result)
        })
    }
    fn load_unlocked(&self) -> Result<Vec<LocalAccount>, String> {
        let content = match fs::read_to_string(self.file_path()) {
            Ok(content) => content,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(e) => return Err(format!("Failed to read local vault: {e}")),
        };
        if content.trim().is_empty() {
            return Ok(vec![]);
        }
        let entries: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|_| {
            "Local vault JSON is damaged. Preserve the file and restore from a backup.".to_string()
        })?;
        let total = entries.len();
        let mut accounts = vec![];
        let mut changed = false;
        for (index, entry) in entries.into_iter().enumerate() {
            let parsed = serde_json::from_value::<LocalAccount>(entry.clone())
                .map_err(|_| "Invalid account record".to_string())
                .and_then(|mut account| {
                    let (session, legacy) = self.secret_box.decrypt(
                        &account.session_blob,
                        &format!("local-account:{}", account.id),
                    )?;
                    account.session_blob = session;
                    if account.puuid.is_none() {
                        account.puuid =
                            crate::riot::session_format::detect_details(&account.session_blob)
                                .puuid;
                        changed |= account.puuid.is_some();
                    }
                    changed |= legacy;
                    Ok(account)
                });
            match parsed {
                Ok(account) => accounts.push(account),
                Err(error) => {
                    // Preserve the original encrypted record. Never log session material.
                    let path = self.storage_dir.join(format!(
                        "quarantine-{:032x}-{index}.json",
                        rand::random::<u128>()
                    ));
                    self.atomic_write(
                        &path,
                        &serde_json::to_vec(&entry).map_err(|e| e.to_string())?,
                    )?;
                    eprintln!("LAAP: quarantined invalid vault record {index}: {error}");
                    changed = true;
                }
            }
        }
        if total > 0 && accounts.is_empty() {
            return Err("No readable profiles in the vault. Original records are preserved; check the OS keychain or restore a backup.".into());
        }
        if changed {
            self.save_unlocked(&accounts)?;
        }
        Ok(accounts)
    }
    fn save_unlocked(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        let mut encrypted = accounts.to_vec();
        for account in &mut encrypted {
            account.session_blob = self.secret_box.encrypt(
                &account.session_blob,
                &format!("local-account:{}", account.id),
            )?;
        }
        self.atomic_write(
            &self.file_path(),
            &serde_json::to_vec_pretty(&encrypted).map_err(|e| e.to_string())?,
        )
    }
    fn atomic_write(&self, destination: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
        let temporary = self
            .storage_dir
            .join(format!("vault.{:032x}.tmp", rand::random::<u128>()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
            file.write_all(bytes)
                .and_then(|_| file.sync_all())
                .map_err(|e| e.to_string())?;
            drop(file);
            #[cfg(not(target_os = "windows"))]
            fs::rename(&temporary, destination)
                .map_err(|e| format!("Failed to replace local vault: {e}"))?;
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows_sys::Win32::Storage::FileSystem::{
                    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
                };
                let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
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
                    return Err(format!(
                        "Failed to replace local vault: {}",
                        std::io::Error::last_os_error()
                    ));
                }
            }
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }
}
