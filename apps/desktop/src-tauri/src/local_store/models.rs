use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Game {
    #[default]
    League,
    Valorant,
}

impl Game {
    pub const ALL: [Game; 2] = [Game::League, Game::Valorant];

    pub fn label(&self) -> &'static str {
        match self {
            Game::League => "League",
            Game::Valorant => "VALORANT",
        }
    }

    pub fn launch_product(&self) -> &'static str {
        match self {
            Game::League => "league_of_legends",
            Game::Valorant => "valorant",
        }
    }

    pub fn default_rank_label(&self) -> &'static str {
        "Unranked"
    }
}

pub fn default_games() -> Vec<Game> {
    vec![Game::League]
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ProfileCustomization {
    pub icon_asset: Option<String>,
    pub icon_source: Option<String>,
    pub icon_id: Option<u32>,
    pub auto_sync_icon: bool,
    pub auto_sync_rank: bool,
    pub auto_sync_valorant_rank: bool,
    pub valorant_icon_asset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalAccount {
    pub id: String,
    pub name: String,
    pub region: String,
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(default)]
    pub riot_id: Option<String>,
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
    #[serde(default = "default_games")]
    pub games: Vec<Game>,
    #[serde(default)]
    pub valorant_rank: Option<String>,
    #[serde(default)]
    pub last_game: Option<Game>,
}

impl LocalAccount {
    pub fn riot_id_for_lookup(&self) -> Option<String> {
        self.riot_id
            .as_ref()
            .filter(|id| !id.trim().is_empty())
            .cloned()
            .or_else(|| {
                if self.name.contains('#') {
                    Some(self.name.clone())
                } else {
                    crate::riot::session_format::detect_details(&self.session_blob).name
                }
            })
    }

    pub fn rank_for(&self, game: Game) -> Option<&str> {
        match game {
            Game::League => self.rank.as_deref(),
            Game::Valorant => self.valorant_rank.as_deref(),
        }
    }

    pub fn supports(&self, game: Game) -> bool {
        self.games.contains(&game)
    }

    pub fn set_rank(&mut self, game: Game, rank: Option<String>) {
        match game {
            Game::League => self.rank = rank,
            Game::Valorant => self.valorant_rank = rank,
        }
    }
}

pub type LocalAccountFull = LocalAccount;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAccountSummary {
    pub id: String,
    pub name: String,
    pub region: String,
    pub rank: Option<String>,
    #[serde(default)]
    pub riot_id: Option<String>,
    pub notes: String,
    pub favorite: bool,
    pub customization: ProfileCustomization,
    pub session_status: String,
    pub has_session: bool,
    #[serde(default)]
    pub has_puuid: bool,
    pub created_at: String,
    pub last_used_at: Option<String>,
    #[serde(default = "default_games")]
    pub games: Vec<Game>,
    #[serde(default)]
    pub valorant_rank: Option<String>,
    #[serde(default)]
    pub last_game: Option<Game>,
}

impl LocalAccountSummary {
    pub fn rank_for(&self, game: Game) -> Option<&str> {
        match game {
            Game::League => self.rank.as_deref(),
            Game::Valorant => self.valorant_rank.as_deref(),
        }
    }

    pub fn supports(&self, game: Game) -> bool {
        self.games.contains(&game)
    }
}

impl From<&LocalAccount> for LocalAccountSummary {
    fn from(account: &LocalAccount) -> Self {
        Self {
            id: account.id.clone(),
            name: account.name.clone(),
            region: account.region.clone(),
            rank: account.rank.clone(),
            riot_id: account.riot_id_for_lookup(),
            notes: account.notes.clone(),
            favorite: account.favorite,
            customization: account.customization.clone(),
            session_status: crate::riot::session_format::session_status(
                &account.session_blob,
                account.session_updated_at.as_deref(),
            )
            .into(),
            has_session: crate::riot::session_format::has_persisted_session(&account.session_blob),
            has_puuid: account
                .puuid
                .as_deref()
                .is_some_and(|puuid| !puuid.trim().is_empty()),
            created_at: account.created_at.clone(),
            last_used_at: account.last_used_at.clone(),
            games: account.games.clone(),
            valorant_rank: account.valorant_rank.clone(),
            last_game: account.last_game,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(account.games, vec![Game::League]);
        assert_eq!(account.valorant_rank, None);
        assert_eq!(account.last_game, None);
        assert_eq!(account.customization.auto_sync_valorant_rank, false);
    }

    #[test]
    fn game_enum_serde_and_properties() {
        assert_eq!(serde_json::to_string(&Game::League).unwrap(), "\"league\"");
        assert_eq!(serde_json::to_string(&Game::Valorant).unwrap(), "\"valorant\"");

        assert_eq!(serde_json::from_str::<Game>("\"league\"").unwrap(), Game::League);
        assert_eq!(serde_json::from_str::<Game>("\"valorant\"").unwrap(), Game::Valorant);

        assert_eq!(Game::ALL, [Game::League, Game::Valorant]);
        assert_eq!(Game::League.label(), "League");
        assert_eq!(Game::Valorant.label(), "VALORANT");
        assert_eq!(Game::League.launch_product(), "league_of_legends");
        assert_eq!(Game::Valorant.launch_product(), "valorant");
    }

    #[test]
    fn local_account_rank_helpers_and_support() {
        let mut account = LocalAccount {
            id: "test".into(),
            name: "Test#123".into(),
            region: "EUW".into(),
            rank: Some("Diamond I".into()),
            riot_id: None,
            notes: String::new(),
            favorite: false,
            puuid: None,
            session_updated_at: None,
            customization: ProfileCustomization::default(),
            session_blob: "test".into(),
            created_at: "now".into(),
            last_used_at: None,
            games: vec![Game::League, Game::Valorant],
            valorant_rank: Some("Ascendant 2".into()),
            last_game: Some(Game::Valorant),
        };

        assert!(account.supports(Game::League));
        assert!(account.supports(Game::Valorant));
        assert_eq!(account.rank_for(Game::League), Some("Diamond I"));
        assert_eq!(account.rank_for(Game::Valorant), Some("Ascendant 2"));

        account.set_rank(Game::League, Some("Master".into()));
        account.set_rank(Game::Valorant, None);
        assert_eq!(account.rank_for(Game::League), Some("Master"));
        assert_eq!(account.rank_for(Game::Valorant), None);

        let summary = LocalAccountSummary::from(&account);
        assert_eq!(summary.games, vec![Game::League, Game::Valorant]);
        assert_eq!(summary.rank_for(Game::League), Some("Master"));
        assert_eq!(summary.rank_for(Game::Valorant), None);
        assert_eq!(summary.last_game, Some(Game::Valorant));
    }
}
