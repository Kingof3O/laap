use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalAccount {
    pub id: String,
    pub name: String,
    pub region: String,
    #[serde(default)]
    pub rank: Option<String>,
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
            has_session: !account.session_blob.trim().is_empty(),
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
