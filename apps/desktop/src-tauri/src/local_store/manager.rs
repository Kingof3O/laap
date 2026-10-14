use super::{
    models::{LocalAccount, LocalAccountSummary},
    storage::LocalAccountStorage,
};
use crate::riot::session_format::{detect_details, has_persisted_session};
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct LocalStore {
    storage: LocalAccountStorage,
}
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProfileDetails {
    pub name: String,
    pub region: String,
    pub rank: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub customization: Option<super::ProfileCustomization>,
}
impl ProfileDetails {
    fn validate(&mut self) -> Result<(), String> {
        self.name = self.name.trim().to_string();
        self.region = self.region.trim().to_uppercase();
        self.rank = self
            .rank
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if self.name.is_empty() || self.name.chars().count() > 120 {
            return Err("Profile name must contain 1–120 characters".into());
        }
        if ![
            "NA", "EUW", "EUNE", "KR", "LAN", "LAS", "OCE", "TR", "RU", "JP", "BR", "SEA", "SG",
            "TW", "VN", "PH", "TH", "ME",
        ]
        .contains(&self.region.as_str())
        {
            return Err("Choose a supported region".into());
        }
        if self.rank.as_ref().is_some_and(|s| s.chars().count() > 40)
            || self.notes.chars().count() > 2000
        {
            return Err("Rank must be at most 40 characters; notes at most 2000".into());
        }
        if let Some(customization) = &self.customization {
            if let Some(asset) = &customization.icon_asset {
                crate::profile_assets::validate_asset_key(asset)?;
            }
            if customization
                .icon_source
                .as_deref()
                .is_some_and(|source| !["upload", "riot", "game"].contains(&source))
            {
                return Err("Invalid icon source".into());
            }
        }
        Ok(())
    }
}
impl LocalStore {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            storage: LocalAccountStorage::new()?,
        })
    }
    #[cfg(test)]
    pub fn with_custom_dir(storage_dir: std::path::PathBuf) -> Self {
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
        Ok(self
            .load_accounts()?
            .iter()
            .map(LocalAccountSummary::from)
            .collect())
    }
    pub fn add_account(
        &self,
        name: String,
        region: String,
        session_blob: String,
        rank: Option<String>,
    ) -> Result<LocalAccount, String> {
        self.create_profile(
            ProfileDetails {
                name,
                region,
                rank,
                notes: String::new(),
                favorite: false,
                customization: None,
            },
            session_blob,
        )
    }
    pub fn create_profile(
        &self,
        mut details: ProfileDetails,
        session_blob: String,
    ) -> Result<LocalAccount, String> {
        details.validate()?;
        if !has_persisted_session(&session_blob) {
            return Err(
                "No reusable saved login found. Sign in with Stay signed in enabled.".into(),
            );
        }
        let detected = detect_details(&session_blob);
        self.storage.update(|accounts| {
            if detected.puuid.as_ref().is_some_and(|id| {
                accounts
                    .iter()
                    .any(|account| account.puuid.as_ref() == Some(id))
            }) {
                return Err(
                    "This Riot account is already saved. Use Sign in again on its profile.".into(),
                );
            }
            let account = LocalAccount {
                id: format!("{:032x}", rand::random::<u128>()),
                name: details.name,
                region: details.region,
                rank: details.rank,
                notes: details.notes,
                favorite: details.favorite,
                customization: details.customization.unwrap_or_default(),
                puuid: detected.puuid,
                session_blob,
                session_updated_at: Some(Utc::now().to_rfc3339()),
                created_at: Utc::now().to_rfc3339(),
                last_used_at: None,
            };
            accounts.push(account.clone());
            Ok(account)
        })
    }
    pub fn edit_profile(&self, id: &str, mut details: ProfileDetails) -> Result<(), String> {
        details.validate()?;
        self.storage.update(|accounts| {
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or("Profile not found")?;
            account.name = details.name;
            account.region = details.region;
            let keep_live_rank = account.customization.auto_sync_rank
                && details
                    .customization
                    .as_ref()
                    .is_some_and(|value| value.auto_sync_rank);
            if !keep_live_rank {
                account.rank = details.rank;
            }
            account.notes = details.notes;
            account.favorite = details.favorite;
            if let Some(mut customization) = details.customization {
                if account.customization.auto_sync_icon && customization.auto_sync_icon {
                    customization.icon_asset = account.customization.icon_asset.clone();
                    customization.icon_source = account.customization.icon_source.clone();
                    customization.icon_id = account.customization.icon_id;
                }
                account.customization = customization;
            }
            Ok(())
        })
    }
    pub fn refresh_session(&self, id: &str, session: String) -> Result<(), String> {
        if !has_persisted_session(&session) {
            return Err("No reusable saved login found".into());
        }
        let detected = detect_details(&session);
        self.storage.update(|accounts| {
            if detected.puuid.as_ref().is_some_and(|puuid| accounts.iter().any(|a| a.id != id && a.puuid.as_ref() == Some(puuid))) { return Err("That Riot login belongs to a different saved profile.".into()); }
            let account = accounts.iter_mut().find(|a| a.id == id).ok_or("Profile not found")?;
            if account.puuid.as_ref().zip(detected.puuid.as_ref()).is_some_and(|(a,b)| a != b) { return Err("You signed in to a different Riot account. Sign in to this profile's original account.".into()); }
            account.session_blob = session; account.session_updated_at = Some(Utc::now().to_rfc3339());
            if detected.puuid.is_some() { account.puuid = detected.puuid; } Ok(())
        })
    }
    pub fn delete_account(&self, id: &str) -> Result<(), String> {
        self.storage.update(|accounts| {
            let size = accounts.len();
            accounts.retain(|a| a.id != id);
            if size == accounts.len() {
                return Err("Profile not found".into());
            }
            Ok(())
        })
    }

    pub fn apply_customization_sync(
        &self,
        id: &str,
        puuid: &str,
        rank: Option<String>,
        icon: Option<(String, u32)>,
    ) -> Result<bool, String> {
        self.storage.update(|accounts| {
            let Some(account) = accounts.iter_mut().find(|account| account.id == id) else {
                return Ok(false);
            };
            if account.puuid.as_deref() != Some(puuid) {
                return Ok(false);
            }
            let mut changed = false;
            if account.customization.auto_sync_rank {
                if let Some(rank) = rank {
                    if account.rank.as_ref() != Some(&rank) {
                        account.rank = Some(rank);
                        changed = true;
                    }
                }
            }
            if account.customization.auto_sync_icon {
                if let Some((asset, icon_id)) = icon {
                    account.customization.icon_asset = Some(asset);
                    account.customization.icon_id = Some(icon_id);
                    account.customization.icon_source = Some("game".into());
                    changed = true;
                }
            }
            Ok(changed)
        })
    }

    pub fn session_for(&self, id: &str) -> Result<String, String> {
        let account = self
            .load_accounts()?
            .into_iter()
            .find(|a| a.id == id)
            .ok_or("Profile not found")?;
        if !has_persisted_session(&account.session_blob) {
            return Err("Sign in required. Use Sign in again on this profile.".into());
        }
        Ok(account.session_blob)
    }
    pub fn mark_played(&self, id: &str) -> Result<(), String> {
        self.storage.update(|accounts| {
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or("Profile not found")?;
            account.last_used_at = Some(Utc::now().to_rfc3339());
            Ok(())
        })
    }
}
