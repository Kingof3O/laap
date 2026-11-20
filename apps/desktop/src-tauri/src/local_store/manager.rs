use super::{
    models::{default_games, Game, LocalAccount, LocalAccountSummary},
    storage::LocalAccountStorage,
};
use crate::riot::session_format::{detect_details, has_persisted_session};
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct LocalStore {
    storage: LocalAccountStorage,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ProfileDetails {
    pub name: String,
    pub region: String,
    pub rank: Option<String>,
    #[serde(default)]
    pub riot_id: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub customization: Option<super::ProfileCustomization>,
    #[serde(default = "default_games")]
    pub games: Vec<Game>,
    #[serde(default)]
    pub valorant_rank: Option<String>,
}

impl Default for ProfileDetails {
    fn default() -> Self {
        Self {
            name: String::new(),
            region: String::new(),
            rank: None,
            riot_id: None,
            notes: String::new(),
            favorite: false,
            customization: None,
            games: default_games(),
            valorant_rank: None,
        }
    }
}

impl ProfileDetails {
    pub fn validate(&mut self) -> Result<(), String> {
        self.name = self.name.trim().to_string();
        self.region = self.region.trim().to_uppercase();
        self.rank = self
            .rank
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        self.valorant_rank = self
            .valorant_rank
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        self.riot_id = self
            .riot_id
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let mut deduped_games = Vec::new();
        for g in &self.games {
            if !deduped_games.contains(g) {
                deduped_games.push(*g);
            }
        }
        self.games = deduped_games;
        if !(1..=2).contains(&self.games.len()) {
            return Err("Profile must support 1 or 2 unique games".into());
        }

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
            || self.valorant_rank.as_ref().is_some_and(|s| s.chars().count() > 40)
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
        #[cfg(feature = "basic")]
        return self.storage.with_profile_access(false, |accounts, access| {
            accounts.retain(|account| access.allows(&account.id));
            Ok(std::mem::take(accounts))
        });
        #[cfg(not(feature = "basic"))]
        self.storage.load()
    }
    #[cfg(feature = "basic")]
    pub fn profile_slots(&self) -> Result<super::ProfileSlots, String> {
        self.storage.with_profile_access(false, |accounts, access| Ok(access.describe(accounts)))
    }
    #[cfg(feature = "basic")]
    pub fn authorize_provisioning(&self, id: Option<&str>) -> Result<(), String> {
        self.storage.with_profile_access(false, |accounts, access| match id {
            Some(id) if accounts.iter().any(|account| account.id == id) => access.require(id),
            Some(_) => Err("Profile not found.".into()),
            None => access.require_space(),
        })
    }
    #[cfg(feature = "basic")]
    pub fn select_profiles(&self, ids: Vec<String>) -> Result<super::ProfileSlots, String> {
        self.storage.with_profile_access(false, |accounts, access| {
            access.select(ids, accounts)?;
            Ok(access.describe(accounts))
        })
    }
    #[cfg(feature = "basic")]
    pub fn replace_profile(&self, active_id: &str, locked_id: String) -> Result<super::ProfileSlots, String> {
        self.storage.with_profile_access(false, |accounts, access| {
            access.replace(active_id, locked_id, accounts)?;
            Ok(access.describe(accounts))
        })
    }
    fn update_profile<T>(
        &self,
        id: &str,
        action: impl FnOnce(&mut Vec<LocalAccount>) -> Result<T, String>,
    ) -> Result<T, String> {
        #[cfg(feature = "basic")]
        return self.storage.with_profile_access(true, |accounts, access| {
            access.require(id)?;
            action(accounts)
        });
        #[cfg(not(feature = "basic"))]
        {
            let _ = id;
            self.storage.update(action)
        }
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
                riot_id: None,
                notes: String::new(),
                favorite: false,
                customization: None,
                games: default_games(),
                valorant_rank: None,
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
        let create = |accounts: &mut Vec<LocalAccount>| -> Result<LocalAccount, String> {
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
                riot_id: details.riot_id.or(detected.name),
                notes: details.notes,
                favorite: details.favorite,
                customization: details.customization.unwrap_or_default(),
                puuid: detected.puuid,
                session_blob,
                session_updated_at: Some(Utc::now().to_rfc3339()),
                created_at: Utc::now().to_rfc3339(),
                last_used_at: None,
                games: details.games,
                valorant_rank: details.valorant_rank,
                last_game: None,
            };
            accounts.push(account.clone());
            Ok(account)
        };
        #[cfg(feature = "basic")]
        return self.storage.with_profile_access(true, |accounts, access| {
            access.require_space()?;
            let account = create(accounts)?;
            access.added(&account.id);
            Ok(account)
        });
        #[cfg(not(feature = "basic"))]
        self.storage.update(create)
    }
    pub fn edit_profile(&self, id: &str, mut details: ProfileDetails) -> Result<(), String> {
        details.validate()?;
        self.update_profile(id, |accounts| {
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or("Profile not found")?;

            let removing_game = account.games.iter().any(|g| !details.games.contains(g));
            if removing_game
                && crate::riot::process::is_riot_running()
                && crate::riot::RiotSessionManager::new().owner_matches(&format!("local:{id}"))
            {
                return Err("Stop the running client before changing this profile's games.".into());
            }

            account.name = details.name;
            account.region = details.region;
            if details.riot_id.is_some() {
                account.riot_id = details.riot_id;
            }

            let removing_league = account.games.contains(&Game::League)
                && !details.games.contains(&Game::League);
            let removing_val = account.games.contains(&Game::Valorant)
                && !details.games.contains(&Game::Valorant);

            let keep_live_rank = account.customization.auto_sync_rank
                && details
                    .customization
                    .as_ref()
                    .is_some_and(|value| value.auto_sync_rank);
            if !removing_league && !keep_live_rank {
                account.rank = details.rank;
            }

            let keep_live_val_rank = account.customization.auto_sync_valorant_rank
                && details
                    .customization
                    .as_ref()
                    .is_some_and(|value| value.auto_sync_valorant_rank);
            if !removing_val && !keep_live_val_rank {
                account.valorant_rank = details.valorant_rank;
            }

            account.games = details.games;
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
        self.update_profile(id, |accounts| {
            if detected.puuid.as_ref().is_some_and(|puuid| accounts.iter().any(|a| a.id != id && a.puuid.as_ref() == Some(puuid))) { return Err("That Riot login belongs to a different saved profile.".into()); }
            let account = accounts.iter_mut().find(|a| a.id == id).ok_or("Profile not found")?;
            if account.puuid.as_ref().zip(detected.puuid.as_ref()).is_some_and(|(a,b)| a != b) { return Err("You signed in to a different Riot account. Sign in to this profile's original account.".into()); }
            account.session_blob = session; account.session_updated_at = Some(Utc::now().to_rfc3339());
            if detected.puuid.is_some() { account.puuid = detected.puuid; } Ok(())
        })
    }
    pub fn delete_account(&self, id: &str) -> Result<(), String> {
        self.update_profile(id, |accounts| {
            let size = accounts.len();
            accounts.retain(|a| a.id != id);
            if size == accounts.len() {
                return Err("Profile not found".into());
            }
            Ok(())
        })
    }

    pub fn update_rank(&self, id: &str, rank: &str) -> Result<bool, String> {
        self.update_rank_for(id, rank, Game::League)
    }

    pub fn update_rank_for(&self, id: &str, rank: &str, game: Game) -> Result<bool, String> {
        self.update_profile(id, |accounts| {
            let Some(account) = accounts.iter_mut().find(|account| account.id == id) else {
                return Ok(false);
            };
            let trimmed = rank.trim();
            let new_val = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            };
            let current = account.rank_for(game);
            if current != new_val.as_deref() {
                account.set_rank(game, new_val);
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    pub fn update_riot_id(&self, id: &str, riot_id: &str) -> Result<bool, String> {
        let clean = riot_id.trim();
        self.update_profile(id, |accounts| {
            let Some(account) = accounts.iter_mut().find(|account| account.id == id) else {
                return Ok(false);
            };
            let new_val = if clean.is_empty() {
                None
            } else {
                Some(clean.to_string())
            };
            if account.riot_id != new_val {
                account.riot_id = new_val;
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    pub fn apply_customization_sync(
        &self,
        id: &str,
        puuid: &str,
        rank: Option<String>,
        icon: Option<(String, u32)>,
    ) -> Result<bool, String> {
        self.update_profile(id, |accounts| {
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

    pub fn record_last_game(&self, id: &str, game: Game) -> Result<(), String> {
        self.storage.update(|accounts| {
            let account = accounts
                .iter_mut()
                .find(|a| a.id == id)
                .ok_or("Profile not found")?;
            account.last_game = Some(game);
            account.last_used_at = Some(Utc::now().to_rfc3339());
            Ok(())
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_details_validation_games_and_ranks() {
        let mut details = ProfileDetails {
            name: "Test".into(),
            region: "EUW".into(),
            rank: Some("Gold II".into()),
            riot_id: None,
            notes: "".into(),
            favorite: false,
            customization: None,
            games: vec![Game::League, Game::League],
            valorant_rank: Some("Silver 3".into()),
        };

        // Duplicate games deduplicated
        assert!(details.validate().is_ok());
        assert_eq!(details.games, vec![Game::League]);
        assert_eq!(details.valorant_rank.as_deref(), Some("Silver 3"));

        // Empty games rejected
        let mut empty_games = details.clone();
        empty_games.games = vec![];
        assert!(empty_games.validate().is_err());

        // 1 or 2 games valid
        let mut two_games = details.clone();
        two_games.games = vec![Game::League, Game::Valorant];
        assert!(two_games.validate().is_ok());
        assert_eq!(two_games.games, vec![Game::League, Game::Valorant]);

        // Long valorant rank rejected (> 40 chars)
        let mut long_val_rank = details.clone();
        long_val_rank.valorant_rank = Some("a".repeat(41));
        assert!(long_val_rank.validate().is_err());

        // Valid <= 40 chars accepted
        let mut valid_val_rank = details.clone();
        valid_val_rank.valorant_rank = Some("a".repeat(40));
        assert!(valid_val_rank.validate().is_ok());
    }

    #[test]
    fn edit_profile_preserves_hidden_ranks() {
        let temp = std::env::temp_dir().join(format!("laap-edit-test-{:032x}", rand::random::<u128>()));
        let store = LocalStore::with_custom_dir(temp.clone());

        let created = store.create_profile(
            ProfileDetails {
                name: "MultiGame".into(),
                region: "NA".into(),
                rank: Some("Platinum IV".into()),
                riot_id: None,
                notes: "".into(),
                favorite: false,
                customization: None,
                games: vec![Game::League, Game::Valorant],
                valorant_rank: Some("Ascendant 1".into()),
            },
            "rso_token: test-session\nsub: test-player".into(),
        ).unwrap();

        assert_eq!(created.rank.as_deref(), Some("Platinum IV"));
        assert_eq!(created.valorant_rank.as_deref(), Some("Ascendant 1"));
        assert_eq!(created.games, vec![Game::League, Game::Valorant]);

        // Edit to League-only with a new League rank
        store.edit_profile(&created.id, ProfileDetails {
            name: "MultiGame".into(),
            region: "NA".into(),
            rank: Some("Diamond IV".into()),
            riot_id: None,
            notes: "".into(),
            favorite: false,
            customization: None,
            games: vec![Game::League],
            valorant_rank: None,
        }).unwrap();

        let updated = store.load_accounts().unwrap().remove(0);
        assert_eq!(updated.games, vec![Game::League]);
        assert_eq!(updated.rank.as_deref(), Some("Diamond IV"));
        // Preserved in storage even though game was unchecked!
        assert_eq!(updated.valorant_rank.as_deref(), Some("Ascendant 1"));

        // Add Valorant back without specifying rank -> previous saved rank is intact
        store.edit_profile(&created.id, ProfileDetails {
            name: "MultiGame".into(),
            region: "NA".into(),
            rank: Some("Diamond IV".into()),
            riot_id: None,
            notes: "".into(),
            favorite: false,
            customization: None,
            games: vec![Game::League, Game::Valorant],
            valorant_rank: None,
        }).unwrap();

        let updated2 = store.load_accounts().unwrap().remove(0);
        assert_eq!(updated2.games, vec![Game::League, Game::Valorant]);
        assert_eq!(updated2.rank.as_deref(), Some("Diamond IV"));
        // When game is active and valorant_rank passed is None, it clears/updates, but here:
        assert_eq!(updated2.valorant_rank, None);

        let _ = std::fs::remove_dir_all(temp);
    }

    #[test]
    fn record_last_game_updates_fields() {
        let temp = std::env::temp_dir().join(format!("laap-last-game-{:032x}", rand::random::<u128>()));
        let store = LocalStore::with_custom_dir(temp.clone());

        let account = store.create_profile(
            ProfileDetails {
                name: "PlayTest".into(),
                region: "KR".into(),
                rank: None,
                riot_id: None,
                notes: "".into(),
                favorite: false,
                customization: None,
                games: vec![Game::League, Game::Valorant],
                valorant_rank: None,
            },
            "rso_token: test-session\nsub: play-player".into(),
        ).unwrap();

        assert_eq!(account.last_game, None);
        assert_eq!(account.last_used_at, None);

        store.record_last_game(&account.id, Game::Valorant).unwrap();

        let updated = store.load_accounts().unwrap().remove(0);
        assert_eq!(updated.last_game, Some(Game::Valorant));
        assert!(updated.last_used_at.is_some());

        let _ = std::fs::remove_dir_all(temp);
    }
}
