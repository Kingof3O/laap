use crate::local_store::models::Game;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChampionStat {
    pub name: String,
    #[serde(alias = "icon_url")]
    pub icon_url: String,
    #[serde(default)]
    pub wins: u32,
    #[serde(default)]
    pub losses: u32,
    #[serde(default, alias = "win_rate")]
    pub win_rate: u32,
    #[serde(default, alias = "games")]
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CombatStats {
    #[serde(default, alias = "kd_ratio")]
    pub kd: Option<f32>,
    #[serde(default, alias = "headshot_percentage", alias = "headshot_rate")]
    pub headshot_rate: Option<u32>,
    #[serde(default, alias = "damage_per_round")]
    pub damage_per_round: Option<u32>,
    #[serde(default, alias = "win_rate")]
    pub win_rate: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonerProfile {
    #[serde(alias = "summoner_name")]
    pub summoner_name: String,
    #[serde(alias = "tag_line")]
    pub tag_line: String,
    pub region: String,
    pub tier: String,
    pub rank: String,
    #[serde(alias = "league_points")]
    pub league_points: u32,
    pub wins: u32,
    pub losses: u32,
    #[serde(alias = "fetched_at")]
    pub fetched_at: u64,
    pub source: String,
    #[serde(default, alias = "win_rate")]
    pub win_rate: u32,
    #[serde(default, alias = "formatted_rank")]
    pub formatted_rank: String,
    #[serde(default, alias = "formatted_win_rate")]
    pub formatted_win_rate: String,
    #[serde(default, alias = "opgg_url")]
    pub opgg_url: String,
    #[serde(default)]
    pub game: Game,
    #[serde(default)]
    pub level: Option<u32>,
    #[serde(default)]
    pub puuid: Option<String>,
    #[serde(default, alias = "avatar_url")]
    pub avatar_url: Option<String>,
    #[serde(default, alias = "rr")]
    pub rr: Option<u32>,
    #[serde(default, alias = "top_champions", alias = "topChampions")]
    pub top_champions: Vec<ChampionStat>,
    #[serde(default, alias = "combat_stats", alias = "combatStats")]
    pub combat_stats: Option<CombatStats>,
}

impl SummonerProfile {
    pub fn matches_saved_puuid(&self, saved_puuid: Option<&str>) -> Result<(), String> {
        verify_puuid_identity(saved_puuid, self.puuid.as_deref())
    }
}

pub fn verify_puuid_identity(
    saved_puuid: Option<&str>,
    opgg_puuid: Option<&str>,
) -> Result<(), String> {
    if let (Some(saved), Some(fetched)) = (saved_puuid, opgg_puuid) {
        let saved_trimmed = saved.trim();
        let fetched_trimmed = fetched.trim();
        if !saved_trimmed.is_empty()
            && !fetched_trimmed.is_empty()
            && saved_trimmed != fetched_trimmed
        {
            return Err("OP.GG returned a different Riot account; saved rank kept.".to_string());
        }
    }
    Ok(())
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
