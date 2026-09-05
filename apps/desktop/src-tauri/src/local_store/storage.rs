use std::fs;
use std::io::Write;
use std::path::PathBuf;

use super::crypto::LocalSecretBox;
use super::models::LocalAccount;

pub const LOCAL_STORE_FILENAME: &str = "laap_local_accounts.json";

#[derive(Debug, Clone)]
pub struct LocalAccountStorage {
    storage_dir: PathBuf,
    secret_box: LocalSecretBox,
}

impl LocalAccountStorage {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            storage_dir: Self::default_storage_dir(),
            secret_box: LocalSecretBox::load_or_create()?,
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
                return PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("LAAP");
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
            .map_err(|error| format!("Failed to read local accounts store: {error}"))?;
        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        let mut accounts = serde_json::from_str::<Vec<LocalAccount>>(&content)
            .map_err(|error| format!("Failed to parse local accounts store: {error}"))?;
        let mut migrated_legacy_plaintext = false;
        for account in &mut accounts {
            let context = format!("local-account:{}", account.id);
            let (plaintext, legacy) = self.secret_box.decrypt(&account.session_blob, &context)?;
            account.session_blob = plaintext;
            migrated_legacy_plaintext |= legacy;
        }

        if migrated_legacy_plaintext {
            self.save(&accounts)?;
        }
        Ok(accounts)
    }

    pub fn save(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        fs::create_dir_all(&self.storage_dir)
            .map_err(|error| format!("Failed to create storage directory: {error}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.storage_dir, fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("Failed to secure storage directory: {error}"))?;
        }

        let mut encrypted_accounts = accounts.to_vec();
        for account in &mut encrypted_accounts {
            let context = format!("local-account:{}", account.id);
            account.session_blob = self.secret_box.encrypt(&account.session_blob, &context)?;
        }
        let json = serde_json::to_vec_pretty(&encrypted_accounts)
            .map_err(|error| format!("Failed to serialize local accounts: {error}"))?;

        let destination = self.file_path();
        let temporary = self
            .storage_dir
            .join(format!("{LOCAL_STORE_FILENAME}.{}.tmp", std::process::id()));
        let mut file = fs::File::create(&temporary)
            .map_err(|error| format!("Failed to create temporary local store: {error}"))?;
        file.write_all(&json)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Failed to write local accounts store: {error}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("Failed to secure local accounts store: {error}"))?;
        }

        if let Err(first_error) = fs::rename(&temporary, &destination) {
            #[cfg(target_os = "windows")]
            {
                if destination.exists() {
                    fs::remove_file(&destination).map_err(|error| {
                        format!("Failed to replace local accounts store: {error}")
                    })?;
                    fs::rename(&temporary, &destination).map_err(|error| {
                        format!("Failed to replace local accounts store: {error}")
                    })?;
                } else {
                    return Err(format!(
                        "Failed to replace local accounts store: {first_error}"
                    ));
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err(format!(
                    "Failed to replace local accounts store: {first_error}"
                ));
            }
        }

        Ok(())
    }
}
