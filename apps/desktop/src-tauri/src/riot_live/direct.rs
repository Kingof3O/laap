use chrono::Utc;

use super::models::{LiveStatusMode, LiveStatusResult, INVALID_PUUID_ERR_PREFIX, MAX_CACHE_ENTRIES};
use super::rate_limiter::{check_and_record_rate_limit, parse_retry_after, set_cooldown, LIVE_STATE};
use super::routing::{sanitize_api_puuid, segment_url};

pub async fn query_direct(
    client: &reqwest::Client,
    account_base: &str,
    spectator_base: &str,
    platform: &str,
    api_key: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
) -> Result<LiveStatusResult, String> {
    let mem_key = riot_id.as_ref().map(|(game_name, tag_line)| {
        format!(
            "{platform}\0{}\0{}",
            game_name.to_ascii_lowercase(),
            tag_line.to_ascii_lowercase()
        )
    });
    let sanitized_known = sanitize_api_puuid(known_puuid.as_deref());
    let puuid = match sanitized_known {
        Some(existing) => existing,
        None => {
            let (game_name, tag_line) = riot_id.ok_or_else(|| {
                "Account needs a Riot ID with #TAG (e.g. Name#EUW) or an imported Riot session to resolve PUUID."
                    .to_string()
            })?;
            let mem_key = mem_key.clone().expect("riot_id present");
            let from_mem = LIVE_STATE
                .lock()
                .ok()
                .and_then(|state| state.puuid_cache.get(&mem_key).cloned());
            match sanitize_api_puuid(from_mem.as_deref()) {
                Some(cached) => cached,
                None => {
                    check_and_record_rate_limit(platform, true)?;
                    let url = segment_url(
                        account_base,
                        &[
                            "riot",
                            "account",
                            "v1",
                            "accounts",
                            "by-riot-id",
                            &game_name,
                            &tag_line,
                        ],
                    )?;
                    let response = client
                        .get(url)
                        .header("X-Riot-Token", api_key)
                        .send()
                        .await
                        .map_err(|_| "Unable to contact Riot Account API".to_string())?;
                    let status = response.status().as_u16();
                    if status == 429 {
                        let secs = parse_retry_after(response.headers());
                        set_cooldown(platform, secs);
                        return Err(format!(
                            "[RATE_LIMITED] Riot API rate limit reached; retry in {secs}s"
                        ));
                    }
                    if status == 401 || status == 403 {
                        return Err("[AUTH_REQUIRED] Riot rejected your Personal API key.".into());
                    }
                    if status == 404 {
                        return Err("Riot ID was not found on Riot Account API.".into());
                    }
                    if !response.status().is_success() {
                        return Err(format!("Riot Account API returned HTTP {status}"));
                    }
                    let json: serde_json::Value = response
                        .json()
                        .await
                        .map_err(|_| "Invalid Riot Account API JSON".to_string())?;
                    let resolved = json["puuid"]
                        .as_str()
                        .filter(|s| !s.is_empty() && s.len() <= 150)
                        .ok_or_else(|| "Riot Account response missing puuid".to_string())?
                        .to_string();
                    if let Ok(mut state) = LIVE_STATE.lock() {
                        if state.puuid_cache.len() >= MAX_CACHE_ENTRIES {
                            if let Some(first) = state.puuid_cache.keys().next().cloned() {
                                state.puuid_cache.remove(&first);
                            }
                        }
                        state.puuid_cache.insert(mem_key, resolved.clone());
                    }
                    resolved
                }
            }
        }
    };

    check_and_record_rate_limit(platform, true)?;
    let url = segment_url(
        spectator_base,
        &["lol", "spectator", "v5", "active-games", "by-summoner", &puuid],
    )?;
    let response = client
        .get(url)
        .header("X-Riot-Token", api_key)
        .send()
        .await
        .map_err(|_| "Unable to contact Riot Spectator API".to_string())?;
    let status = response.status().as_u16();
    let checked_at = Utc::now().to_rfc3339();
    if status == 404 {
        return Ok(LiveStatusResult {
            configured: true,
            mode: LiveStatusMode::Direct,
            in_game: false,
            cached: false,
            puuid: Some(puuid),
            platform: platform.to_string(),
            checked_at,
            game_id: None,
            game_mode: None,
            game_type: None,
            queue_id: None,
            game_length_seconds: None,
            champion_id: None,
        });
    }
    if status == 429 {
        let secs = parse_retry_after(response.headers());
        set_cooldown(platform, secs);
        return Err(format!(
            "[RATE_LIMITED] Riot Spectator API rate limit reached; retry in {secs}s"
        ));
    }
    if status == 401 || status == 403 {
        return Err("[AUTH_REQUIRED] Riot rejected your Personal API key.".into());
    }
    if status == 400 {
        if let Ok(mut state) = LIVE_STATE.lock() {
            if let Some(key) = mem_key.as_deref() {
                state.puuid_cache.remove(key);
            }
            state.puuid_cache.retain(|_, v| v != &puuid);
        }
        return Err(format!(
            "{INVALID_PUUID_ERR_PREFIX}Riot Spectator API returned HTTP 400"
        ));
    }
    if !response.status().is_success() {
        return Err(format!("Riot Spectator API returned HTTP {status}"));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Invalid Riot Spectator API response".to_string())?;
    let champion_id = body["participants"].as_array().and_then(|list| {
        list.iter()
            .find(|p| p["puuid"].as_str() == Some(puuid.as_str()))
            .and_then(|p| p["championId"].as_u64())
            .and_then(|n| u32::try_from(n).ok())
    });

    Ok(LiveStatusResult {
        configured: true,
        mode: LiveStatusMode::Direct,
        in_game: true,
        cached: false,
        puuid: Some(puuid),
        platform: platform.to_string(),
        checked_at,
        game_id: body["gameId"].as_u64(),
        game_mode: body["gameMode"].as_str().map(str::to_string),
        game_type: body["gameType"].as_str().map(str::to_string),
        queue_id: body["gameQueueConfigId"]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok()),
        game_length_seconds: body["gameLength"].as_u64(),
        champion_id,
    })
}
