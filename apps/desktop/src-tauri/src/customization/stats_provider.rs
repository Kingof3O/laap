use super::{provider_support, storage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::AppHandle;
static LAST: Mutex<u64> = Mutex::new(0);
#[derive(Clone, Debug, Serialize, Deserialize)]
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
    pub fetched_at: u64,
    pub source: String,
}
fn routing(region: &str) -> Result<(&'static str, &'static str), String> {
    Ok(match region.to_ascii_uppercase().as_str() {
        "NA" | "NA1" => ("americas", "na1"),
        "BR" | "BR1" => ("americas", "br1"),
        "LAN" | "LA1" => ("americas", "la1"),
        "LAS" | "LA2" => ("americas", "la2"),
        "EUW" | "EUW1" => ("europe", "euw1"),
        "EUNE" | "EUN1" => ("europe", "eun1"),
        "TR" | "TR1" => ("europe", "tr1"),
        "RU" => ("europe", "ru"),
        "ME" | "ME1" => ("europe", "me1"),
        "KR" => ("asia", "kr"),
        "JP" | "JP1" => ("asia", "jp1"),
        "OCE" | "OC1" => ("sea", "oc1"),
        "SG" | "SG2" => ("sea", "sg2"),
        "TW" | "TW2" => ("sea", "tw2"),
        "VN" | "VN2" => ("sea", "vn2"),
        _ => return Err("Unsupported Riot platform region".into()),
    })
}
fn segments(base: &str, path: &[&str]) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(base).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Invalid endpoint")?
        .extend(path);
    Ok(url)
}
async fn fetch_profile(
    client: &reqwest::Client,
    account_base: &str,
    league_base: &str,
    key: &str,
    name: &str,
    tag: &str,
    region: &str,
) -> Result<SummonerProfile, String> {
    let url = segments(
        account_base,
        &["riot", "account", "v1", "accounts", "by-riot-id", name, tag],
    )?;
    let response = client
        .get(url)
        .header("X-Riot-Token", key)
        .send()
        .await
        .map_err(|_| "Riot Account request failed")?;
    let account: serde_json::Value =
        serde_json::from_slice(&provider_support::bounded_body(response, 256 * 1024).await?)
            .map_err(|_| "Invalid Riot Account response")?;
    let puuid = account["puuid"]
        .as_str()
        .filter(|s| s.len() <= 150 && !s.is_empty())
        .ok_or("Missing account PUUID")?;
    let url = segments(
        league_base,
        &["lol", "league", "v4", "entries", "by-puuid", puuid],
    )?;
    let response = client
        .get(url)
        .header("X-Riot-Token", key)
        .send()
        .await
        .map_err(|_| "Riot League request failed")?;
    let entries: Vec<serde_json::Value> =
        serde_json::from_slice(&provider_support::bounded_body(response, 512 * 1024).await?)
            .map_err(|_| "Invalid ranked entries response")?;
    let mut p = SummonerProfile {
        summoner_name: name.into(),
        tag_line: tag.into(),
        region: region.into(),
        tier: "UNRANKED".into(),
        rank: String::new(),
        league_points: 0,
        wins: 0,
        losses: 0,
        fetched_at: now(),
        source: "Riot Games league-v4 · Ranked Solo/Duo".into(),
    };
    if let Some(e) = entries.iter().find(|v| v["queueType"] == "RANKED_SOLO_5x5") {
        p.tier = e["tier"].as_str().ok_or("Missing ranked tier")?.into();
        p.rank = e["rank"].as_str().ok_or("Missing ranked division")?.into();
        let n = |field: &str| -> Result<u32, String> {
            u32::try_from(e[field].as_u64().ok_or("Missing ranked field")?)
                .map_err(|_| "Invalid ranked number".into())
        };
        p.league_points = n("leaguePoints")?;
        p.wins = n("wins")?;
        p.losses = n("losses")?;
    }
    Ok(p)
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[tauri::command]
pub async fn opgg_get_summoner_profile(
    app: AppHandle,
    summoner_name: String,
    tag_line: String,
    region: String,
    consent: bool,
) -> Result<SummonerProfile, String> {
    if !consent {
        return Err("Consent required to send this Riot ID to the official stats provider".into());
    }
    let name = summoner_name.trim();
    let tag = tag_line.trim();
    let (route, platform) = routing(&region)?;
    if name.is_empty()
        || tag.is_empty()
        || name.chars().count() > 32
        || tag.chars().count() > 16
        || name.chars().chain(tag.chars()).any(char::is_control)
    {
        return Err("Enter a valid Riot name and tag".into());
    }
    let hash = format!(
        "{:x}",
        Sha256::digest(format!("{platform}\0{name}\0{tag}").as_bytes())
    );
    let path = storage::root(&app)?
        .join("stats_cache")
        .join(format!("{hash}.json"));
    if let Ok(Some(p)) = storage::read::<SummonerProfile>(&path, 256 * 1024) {
        if now().saturating_sub(p.fetched_at) < 300 {
            return Ok(p);
        }
    }
    {
        let mut last = LAST.lock().map_err(|_| "Stats limiter unavailable")?;
        if now().saturating_sub(*last) < 2 {
            return Err("Please wait before another stats lookup".into());
        }
        *last = now();
    }
    let key = provider_support::load(&app, "riot")?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let profile = fetch_profile(
        &client,
        &format!("https://{route}.api.riotgames.com"),
        &format!("https://{platform}.api.riotgames.com"),
        &key,
        name,
        tag,
        platform,
    )
    .await?;
    storage::write(&path, &profile)?;
    Ok(profile)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regions_do_not_fall_back_to_na() {
        assert_eq!(routing("EUW1").unwrap(), ("europe", "euw1"));
        assert_eq!(routing("BR1").unwrap(), ("americas", "br1"));
        assert!(routing("../NA1").is_err());
        let u = segments(
            "https://europe.api.riotgames.com",
            &[
                "riot",
                "account",
                "v1",
                "accounts",
                "by-riot-id",
                "a/b ?",
                "T#1",
            ],
        )
        .unwrap();
        assert!(u.as_str().contains("a%2Fb%20%3F/T%231"));
    }
    #[tokio::test]
    async fn authentic_http_contract_handles_unicode_and_rate_limit_without_invented_rank() {
        use axum::{http::StatusCode, routing::get, Router};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let router=Router::new().route("/riot/account/v1/accounts/by-riot-id/{name}/{tag}",get(||async{axum::Json(serde_json::json!({"puuid":"fixture-puuid"}))})).route("/lol/league/v4/entries/by-puuid/{id}",get(||async{axum::Json(serde_json::json!([{"queueType":"RANKED_SOLO_5x5","tier":"PLATINUM","rank":"II","leaguePoints":42,"wins":10,"losses":5}]))})).route("/rate",get(||async{(StatusCode::TOO_MANY_REQUESTS,[("retry-after","7")],"do not invent unranked")}));
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let c = reqwest::Client::new();
        let p = fetch_profile(&c, &base, &base, "fixture-key", "فنان / art", "TAG", "euw1")
            .await
            .unwrap();
        assert_eq!(p.tier, "PLATINUM");
        assert_eq!(p.league_points, 42);
        let r = c.get(format!("{base}/rate")).send().await.unwrap();
        assert!(provider_support::bounded_body(r, 1024)
            .await
            .unwrap_err()
            .contains("7"));
        task.abort();
    }
}
