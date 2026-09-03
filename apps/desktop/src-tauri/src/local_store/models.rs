use serde::{Deserialize, Serialize};

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
