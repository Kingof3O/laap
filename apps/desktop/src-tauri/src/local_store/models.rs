#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ProfileCustomization {
    pub icon_asset: Option<String>,
    pub icon_source: Option<String>,
    pub icon_id: Option<u32>,
    pub auto_sync_icon: bool,
    pub auto_sync_rank: bool,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalAccount {
    pub id: String,
    pub name: String,
    pub region: String,
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub puuid: Option<String>,
    #[serde(default)]
    pub session_updated_at: Option<String>,
    #[serde(default)]
    pub customization: ProfileCustomization,
    pub session_blob: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAccountSummary {
    pub id: String,
    pub name: String,
    pub region: String,
    pub rank: Option<String>,
    pub notes: String,
    pub favorite: bool,
    pub customization: ProfileCustomization,
    pub session_status: String,
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
            rank: account.rank.clone(),
            notes: account.notes.clone(),
            favorite: account.favorite,
            customization: account.customization.clone(),
            session_status: crate::riot::session_format::session_status(
                &account.session_blob,
                account.session_updated_at.as_deref(),
            )
            .into(),
            has_session: crate::riot::session_format::has_persisted_session(&account.session_blob),
            created_at: account.created_at.clone(),
            last_used_at: account.last_used_at.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LocalAccount;

    #[test]
    fn profiles_saved_before_rank_labels_still_load() {
        let account: LocalAccount = serde_json::from_value(serde_json::json!({
            "id": "legacy-profile",
            "name": "Main",
            "region": "EUW",
            "session_blob": "test-session",
            "created_at": "2026-10-13T06:00:00Z",
            "last_used_at": null
        }))
        .unwrap();
        assert_eq!(account.rank, None);
        assert_eq!(account.session_blob, "test-session");
    }
}
