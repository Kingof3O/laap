use chrono::Utc;
use serde::Deserialize;

use super::crypto::{hmac_sha256_hex, random_nonce_hex, sha256_hex};
use super::models::{LiveStatusMode, LiveStatusResult, INVALID_PUUID_ERR_PREFIX};
use super::rate_limiter::{check_and_record_rate_limit, parse_retry_after, set_cooldown};
use super::routing::sanitize_api_puuid;

pub async fn query_worker(
    client: &reqwest::Client,
    worker_base_url: &str,
    worker_token: Option<&str>,
    region: &str,
    platform: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
    bypass_cache: bool,
) -> Result<LiveStatusResult, String> {
    check_and_record_rate_limit(platform, false)?;
    let known_puuid = sanitize_api_puuid(known_puuid.as_deref());
    let (game_name, tag_line) = match riot_id {
        Some((name, tag)) => (Some(name), Some(tag)),
        None => (None, None),
    };
    if known_puuid.is_none() && (game_name.is_none() || tag_line.is_none()) {
        return Err(
            "Account needs a Riot ID with #TAG (e.g. Name#EUW) or an imported Riot session to check status."
                .into(),
        );
    }

    let payload = serde_json::json!({
        "region": region,
        "puuid": known_puuid,
        "gameName": game_name,
        "tagLine": tag_line,
        "bypassCache": bypass_cache,
    });
    let body_text = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let path = "/api/riot/live-status";
    let url = format!("{worker_base_url}{path}");
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json");
    if let Some(secret) = worker_token.map(str::trim).filter(|t| !t.is_empty()) {
        let timestamp = Utc::now().timestamp().to_string();
        let nonce = random_nonce_hex()?;
        let body_hash = sha256_hex(body_text.as_bytes());
        let canonical = format!("{timestamp}\n{nonce}\nPOST\n{path}\n{body_hash}");
        let signature = hmac_sha256_hex(secret.as_bytes(), canonical.as_bytes());
        request = request
            .header("X-Laap-Timestamp", timestamp)
            .header("X-Laap-Nonce", nonce)
            .header("X-Laap-Signature", signature);
    }
    request = request.body(body_text);

    let response = request
        .send()
        .await
        .map_err(|_| "Unable to contact Cloudflare Worker proxy.".to_string())?;
    let status = response.status().as_u16();
    if status == 429 {
        let secs = parse_retry_after(response.headers());
        set_cooldown(platform, secs);
        return Err(format!(
            "[RATE_LIMITED] Worker Riot rate limit reached; retry in {secs}s"
        ));
    }
    if status == 401 || status == 403 {
        return Err("[AUTH_REQUIRED] Cloudflare Worker rejected the proxy token.".into());
    }
    if !response.status().is_success() {
        let body = response.json::<serde_json::Value>().await.ok();
        let code = body
            .as_ref()
            .and_then(|v| v["error"]["code"].as_str())
            .map(str::to_string);
        let detail = body
            .as_ref()
            .and_then(|v| v["error"]["message"].as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("Worker returned HTTP {status}"));
        if matches!(code.as_deref(), Some("INVALID_PUUID" | "RIOT_INVALID_PUUID"))
            || detail.contains("HTTP 400")
        {
            return Err(format!("{INVALID_PUUID_ERR_PREFIX}{detail}"));
        }
        return Err(detail);
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WorkerPayload {
        in_game: bool,
        puuid: String,
        platform: String,
        cached: bool,
        checked_at: String,
        game_id: Option<u64>,
        game_mode: Option<String>,
        game_type: Option<String>,
        queue_id: Option<u32>,
        game_length_seconds: Option<u64>,
        champion_id: Option<u32>,
    }

    let payload: WorkerPayload = response
        .json()
        .await
        .map_err(|_| "Worker returned invalid live-status payload.".to_string())?;
    Ok(LiveStatusResult {
        configured: true,
        mode: LiveStatusMode::Worker,
        in_game: payload.in_game,
        cached: payload.cached,
        puuid: Some(payload.puuid),
        platform: payload.platform,
        checked_at: payload.checked_at,
        game_id: payload.game_id,
        game_mode: payload.game_mode,
        game_type: payload.game_type,
        queue_id: payload.queue_id,
        game_length_seconds: payload.game_length_seconds,
        champion_id: payload.champion_id,
    })
}
