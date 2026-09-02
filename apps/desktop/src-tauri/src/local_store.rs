use std::fs;
use std::path::PathBuf;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use super::session::RiotSessionManager;
use super::commands::launch_riot_client;

const LOCAL_STORE_FILENAME: &str = "laap_local_accounts.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalAccount {
    pub id: String,
    pub name: String,
    pub region: String,
    pub session_blob: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAccountSummary {
    pub id: String,
    pub name: String,
    pub region: String,
    pub has_session: bool,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl From<&LocalAccount> for LocalAccountSummary {
    fn from(account: &LocalAccount) -> Self {
        Self {
            id: account.id.clone(),
            name: account.name.clone(),
            region: account.region.clone(),
            has_session: !account.session_blob.trim().is_empty(),
            created_at: account.created_at.clone(),
            last_used_at: account.last_used_at.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LocalStore {
    storage_dir: PathBuf,
}

impl Default for LocalStore {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalStore {
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

    pub fn load_accounts(&self) -> Result<Vec<LocalAccount>, String> {
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

    pub fn save_accounts(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        fs::create_dir_all(&self.storage_dir)
            .map_err(|e| format!("Failed to create storage dir: {e}"))?;

        let json = serde_json::to_string_pretty(accounts)
            .map_err(|e| format!("Failed to serialize local accounts: {e}"))?;

        fs::write(self.file_path(), json)
            .map_err(|e| format!("Failed to write local accounts store: {e}"))?;

        Ok(())
    }

    pub fn list_summaries(&self) -> Result<Vec<LocalAccountSummary>, String> {
        let accounts = self.load_accounts()?;
        Ok(accounts.iter().map(LocalAccountSummary::from).collect())
    }

    pub fn add_account(&self, name: String, region: String, session_blob: String) -> Result<LocalAccount, String> {
        let mut accounts = self.load_accounts()?;
        let id = format!("{:08x}", rand::random::<u32>());
        let account = LocalAccount {
            id,
            name,
            region,
            session_blob,
            created_at: Utc::now().to_rfc3339(),
            last_used_at: None,
        };

        accounts.push(account.clone());
        self.save_accounts(&accounts)?;
        Ok(account)
    }

    pub fn delete_account(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.load_accounts()?;
        let before_len = accounts.len();
        accounts.retain(|a| a.id != id);

        if accounts.len() == before_len {
            return Err("Account not found in local store".to_string());
        }

        self.save_accounts(&accounts)?;
        Ok(())
    }

    pub fn launch_account(&self, id: &str) -> Result<(), String> {
        let mut accounts = self.load_accounts()?;
        let account_idx = accounts
            .iter()
            .position(|a| a.id == id)
            .ok_or_else(|| "Account not found in local store".to_string())?;

        let session_blob = accounts[account_idx].session_blob.clone();
        if session_blob.trim().is_empty() {
            return Err("This account has no captured session. Please provision it first.".to_string());
        }

        // Inject session
        let session_manager = RiotSessionManager::new();
        session_manager.inject_session(&session_blob)?;

        // Launch Riot Client
        launch_riot_client()?;

        // Update last used timestamp
        accounts[account_idx].last_used_at = Some(Utc::now().to_rfc3339());
        let _ = self.save_accounts(&accounts);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn test_local_store_crud() {
        let test_dir = temp_dir().join(format!("laap-test-local-{}", rand::random::<u32>()));
        let store = LocalStore::with_custom_dir(test_dir.clone());

        // 1. Initial list empty
        assert_eq!(store.load_accounts().unwrap().len(), 0);

        // 2. Add accounts
        let acc1 = store.add_account("Test#EUW".to_string(), "EUW".to_string(), "yaml-data-1".to_string()).unwrap();
        let acc2 = store.add_account("Test#NA".to_string(), "NA".to_string(), "yaml-data-2".to_string()).unwrap();

        let list = store.load_accounts().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Test#EUW");
        assert_eq!(list[1].name, "Test#NA");

        // 3. Summaries
        let summaries = store.list_summaries().unwrap();
        assert_eq!(summaries.len(), 2);
        assert!(summaries[0].has_session);

        // 4. Delete acc1
        store.delete_account(&acc1.id).unwrap();
        let list_after = store.load_accounts().unwrap();
        assert_eq!(list_after.len(), 1);
        assert_eq!(list_after[0].id, acc2.id);

        let _ = fs::remove_dir_all(&test_dir);
    }
}
