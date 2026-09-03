use std::path::PathBuf;
use chrono::Utc;
use crate::riot::RiotSessionManager;
use crate::commands::launch_riot_client;
use super::models::{LocalAccount, LocalAccountSummary};
use super::storage::LocalAccountStorage;

#[derive(Debug, Clone)]
pub struct LocalStore {
    storage: LocalAccountStorage,
}

impl Default for LocalStore {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalStore {
    pub fn new() -> Self {
        Self {
            storage: LocalAccountStorage::new(),
        }
    }

    pub fn with_custom_dir(storage_dir: PathBuf) -> Self {
        Self {
            storage: LocalAccountStorage::with_custom_dir(storage_dir),
        }
    }

    pub fn load_accounts(&self) -> Result<Vec<LocalAccount>, String> {
        self.storage.load()
    }

    pub fn save_accounts(&self, accounts: &[LocalAccount]) -> Result<(), String> {
        self.storage.save(accounts)
    }

    pub fn list_summaries(&self) -> Result<Vec<LocalAccountSummary>, String> {
        let accounts = self.load_accounts()?;
        Ok(accounts.iter().map(LocalAccountSummary::from).collect())
    }

    pub fn add_account(
        &self,
        name: String,
        region: String,
        session_blob: String,
    ) -> Result<LocalAccount, String> {
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
            return Err(
                "This account has no captured session. Please provision it first.".to_string(),
            );
        }

        // Inject session via RiotSessionManager
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
