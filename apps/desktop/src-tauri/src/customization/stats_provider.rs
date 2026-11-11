use super::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionStats {
    pub champion_id: String,
    pub games_played: u32,
    pub win_rate_percentage: f32,
    pub kda_ratio: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuneRecommendation {
    pub primary_tree: String,
    pub keystone: String,
    pub secondary_tree: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonerProfile {
    pub summoner_name: String,
    pub tag_line: String,
    pub region: String,
    pub tier: String,
    pub rank: String,
    pub league_points: u32,
    pub wins: u32,
    pub losses: u32,
    pub top_champions: Vec<ChampionStats>,
    pub recommended_runes: Vec<RuneRecommendation>,
}

fn cache_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let dir = storage::root(app)?.join("stats_cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{key}.json")))
}

fn region_to_routing(region: &str) -> (&'static str, &'static str) {
    match region.to_ascii_uppercase().as_str() {
        "NA" | "BR" | "LAN" | "LAS" => ("americas", "na1"),
        "EUW" => ("europe", "euw1"),
        "EUNE" => ("europe", "eun1"),
        "KR" => ("asia", "kr"),
        "JP" => ("asia", "jp1"),
        "OCE" => ("sea", "oc1"),
        _ => ("americas", "na1"),
    }
}

#[tauri::command]
pub async fn opgg_get_summoner_profile(
    app: AppHandle,
    summoner_name: String,
    tag_line: String,
    region: String,
) -> Result<SummonerProfile, String> {
    let clean_name = summoner_name.trim();
    let clean_tag = tag_line.trim();
    let clean_region = region.trim().to_uppercase();

    if clean_name.is_empty() || clean_tag.is_empty() {
        return Err("Summoner name and tagline are required.".into());
    }

    let cache_key = format!("{clean_region}_{clean_name}_{clean_tag}").to_lowercase();
    let p = cache_path(&app, &cache_key)?;

    // Check disk cache first
    if let Ok(Some(cached)) = storage::read::<SummonerProfile>(&p, 256 * 1024) {
        return Ok(cached);
    }

    let riot_key = std::env::var("RIOT_API_KEY").ok();
    if let Some(key) = riot_key {
        let (routing, platform) = region_to_routing(&clean_region);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        // 1. Get Account PUUID
        let account_url = format!(
            "https://{routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{clean_name}/{clean_tag}"
        );
        let account_resp = client
            .get(&account_url)
            .header("X-Riot-Token", &key)
            .send()
            .await
            .map_err(|e| format!("Riot Account API network error: {e}"))?;

        if !account_resp.status().is_success() {
            let status = account_resp.status();
            return Err(format!("Riot Account API error ({status}): Summoner not found or API key invalid."));
        }

        let account_data: serde_json::Value = account_resp.json().await.map_err(|e| e.to_string())?;
        let puuid = account_data["puuid"].as_str().ok_or_else(|| "Missing PUUID in Riot response.".to_string())?;

        // 2. Get Summoner by PUUID
        let summoner_url = format!("https://{platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid}");
        let summoner_resp = client
            .get(&summoner_url)
            .header("X-Riot-Token", &key)
            .send()
            .await
            .map_err(|e| format!("Riot Summoner API network error: {e}"))?;

        if !summoner_resp.status().is_success() {
            let status = summoner_resp.status();
            return Err(format!("Riot Summoner API error ({status})"));
        }

        let summoner_data: serde_json::Value = summoner_resp.json().await.map_err(|e| e.to_string())?;
        let summoner_id = summoner_data["id"].as_str().unwrap_or_default();

        // 3. Get Ranked Entries
        let league_url = format!("https://{platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/{summoner_id}");
        let league_resp = client
            .get(&league_url)
            .header("X-Riot-Token", &key)
            .send()
            .await
            .map_err(|e| format!("Riot League API network error: {e}"))?;

        let mut tier = "UNRANKED".to_string();
        let mut rank = "".to_string();
        let mut lp = 0u32;
        let mut wins = 0u32;
        let mut losses = 0u32;

        if league_resp.status().is_success() {
            if let Ok(entries) = league_resp.json::<Vec<serde_json::Value>>().await {
                for entry in entries {
                    if entry["queueType"].as_str() == Some("RANKED_SOLO_5x5") {
                        tier = entry["tier"].as_str().unwrap_or("UNRANKED").to_string();
                        rank = entry["rank"].as_str().unwrap_or("").to_string();
                        lp = entry["leaguePoints"].as_u64().unwrap_or(0) as u32;
                        wins = entry["wins"].as_u64().unwrap_or(0) as u32;
                        losses = entry["losses"].as_u64().unwrap_or(0) as u32;
                        break;
                    }
                }
            }
        }

        let profile = SummonerProfile {
            summoner_name: clean_name.to_string(),
            tag_line: clean_tag.to_string(),
            region: clean_region,
            tier,
            rank,
            league_points: lp,
            wins,
            losses,
            top_champions: vec![],
            recommended_runes: vec![],
        };

        // Cache authentic profile
        let _ = storage::write(&p, &profile);
        return Ok(profile);
    }

    Err("Live summoner statistics require a Riot Games API key. Configure RIOT_API_KEY in your settings or environment to fetch live summoner profiles.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_summoner_profile_serialization() {
        let profile = SummonerProfile {
            summoner_name: "Faker".into(),
            tag_line: "T1".into(),
            region: "KR".into(),
            tier: "Challenger".into(),
            rank: "I".into(),
            league_points: 1250,
            wins: 340,
            losses: 210,
            top_champions: vec![],
            recommended_runes: vec![],
        };
        let json = serde_json::to_string(&profile).unwrap();
        assert!(json.contains("Faker"));
        assert!(json.contains("Challenger"));
    }
}
