use chrono::Utc;
use std::path::Path;
use std::time::Duration;

use crate::local_store::LocalAccount;
use crate::riot::session_format::detect_details;

use super::direct::query_direct;
use super::models::{LiveStatusConfig, LiveStatusMode, LiveStatusResult, LiveStatusSecrets, INVALID_PUUID_ERR_PREFIX};
use super::rate_limiter::{clear_mem_puuid_cache, get_cached_status, put_cached_status};
use super::routing::{is_uuid_36, resolve_routing, sanitize_api_puuid, split_riot_id};
use super::storage::{
    clear_cached_api_puuid, read_cached_api_puuid, read_config_from, read_secrets_from,
    resolve_builtin_worker, resolve_effective_worker_token, save_cached_api_puuid,
};
use super::worker::query_worker;

pub fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Unable to initialize HTTP client: {error}"))
}

pub fn resolve_account_live_identity(
    dir: &Path,
    account_id: Option<&str>,
    account: Option<&LocalAccount>,
    platform: &str,
    name: &str,
) -> Result<(Option<String>, Option<(String, String)>), String> {
    let cached_api_puuid = account_id.and_then(|id| read_cached_api_puuid(dir, platform, id));
    let legacy_non_uuid_puuid = account.and_then(|acc| sanitize_api_puuid(acc.puuid.as_deref()));
    let known_puuid = cached_api_puuid.or(legacy_non_uuid_puuid);

    let explicit_riot_id = account
        .and_then(|acc| acc.riot_id.as_deref())
        .and_then(split_riot_id);
    let session_riot_id = account
        .filter(|acc| !acc.session_blob.trim().is_empty())
        .and_then(|acc| detect_details(&acc.session_blob).name)
        .and_then(|detected| split_riot_id(&detected));
    let riot_id = split_riot_id(name).or(explicit_riot_id).or(session_riot_id);

    if known_puuid.is_none() && riot_id.is_none() {
        let has_local_uuid_only = account
            .and_then(|acc| acc.puuid.as_deref())
            .is_some_and(is_uuid_36);
        return Err(if has_local_uuid_only {
            "Account only has a local Riot Client UUID; add #TAG to its name (e.g. Name#EUW) or refresh its Riot session so LAAP can resolve its Spectator PUUID."
                .into()
        } else {
            "Add #TAG to the account name (e.g. Name#EUW) or import a signed-in Riot session so LAAP knows its PUUID."
                .into()
        });
    }

    Ok((known_puuid, riot_id))
}

pub async fn dispatch_live_query(
    client: &reqwest::Client,
    config: &LiveStatusConfig,
    secrets: &LiveStatusSecrets,
    region: &str,
    platform: &str,
    known_puuid: Option<String>,
    riot_id: Option<(String, String)>,
    bypass: bool,
) -> Result<LiveStatusResult, String> {
    match config.mode {
        LiveStatusMode::Off => unreachable!(),
        LiveStatusMode::Direct => {
            let api_key = if !secrets.riot_api_key.is_empty() {
                secrets.riot_api_key.clone()
            } else {
                std::env::var("RIOT_API_KEY")
                    .ok()
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .ok_or_else(|| {
                        "Configure your Riot Personal API key in Settings -> Advanced first."
                            .to_string()
                    })?
            };
            let (account_cluster, _) = resolve_routing(region)?;
            query_direct(
                client,
                &format!("https://{account_cluster}.api.riotgames.com"),
                &format!("https://{platform}.api.riotgames.com"),
                platform,
                &api_key,
                known_puuid,
                riot_id,
            )
            .await
        }
        LiveStatusMode::Worker => {
            let (builtin_url, builtin_tok) = resolve_builtin_worker();
            let worker_url = config
                .worker_url
                .as_deref()
                .or(builtin_url.as_deref())
                .ok_or_else(|| {
                    "Configure your Cloudflare Worker URL in Settings -> Advanced first.".to_string()
                })?;
            let token = resolve_effective_worker_token(
                worker_url,
                &secrets.worker_token,
                builtin_url.as_deref(),
                builtin_tok.as_deref(),
            );
            query_worker(
                client,
                worker_url,
                token.as_deref(),
                region,
                platform,
                known_puuid,
                riot_id,
                bypass,
            )
            .await
        }
    }
}

pub async fn check_account_live_status_with_account(
    dir: &Path,
    account_id: Option<&str>,
    account: Option<&LocalAccount>,
    region: String,
    name: String,
    bypass_cache: Option<bool>,
) -> Result<LiveStatusResult, String> {
    let config = read_config_from(dir)?;
    let (_, platform) = resolve_routing(&region)?;
    let bypass = bypass_cache.unwrap_or(false);

    if config.mode == LiveStatusMode::Off {
        return Ok(LiveStatusResult {
            configured: false,
            mode: LiveStatusMode::Off,
            in_game: false,
            cached: false,
            puuid: None,
            platform: platform.to_string(),
            checked_at: Utc::now().to_rfc3339(),
            game_id: None,
            game_mode: None,
            game_type: None,
            queue_id: None,
            game_length_seconds: None,
            champion_id: None,
        });
    }

    let (known_puuid, riot_id) =
        resolve_account_live_identity(dir, account_id, account, platform, &name)?;
    let cache_key = match known_puuid.as_deref() {
        Some(puuid) if !puuid.is_empty() => format!("{:?}:{platform}:p:{puuid}", config.mode),
        _ => match riot_id {
            Some((ref n, ref t)) => format!(
                "{:?}:{platform}:n:{}:{}",
                config.mode,
                n.to_ascii_lowercase(),
                t.to_ascii_lowercase()
            ),
            None => unreachable!("validated non-empty riot_id when known_puuid is None"),
        },
    };

    if !bypass {
        if let Some(cached) = get_cached_status(&cache_key) {
            return Ok(cached);
        }
    }

    let secrets = read_secrets_from(dir)?;
    let client = build_http_client()?;

    let first_attempt = dispatch_live_query(
        &client,
        &config,
        &secrets,
        &region,
        platform,
        known_puuid.clone(),
        riot_id.clone(),
        bypass,
    )
    .await;

    let result = match first_attempt {
        Ok(res) => res,
        Err(err) => {
            if let Some(clean_err) = err.strip_prefix(INVALID_PUUID_ERR_PREFIX) {
                if let Some(id) = account_id {
                    clear_cached_api_puuid(dir, platform, id);
                }
                clear_mem_puuid_cache(platform, riot_id.as_ref(), known_puuid.as_deref());
                if known_puuid.is_some() && riot_id.is_some() {
                    dispatch_live_query(
                        &client,
                        &config,
                        &secrets,
                        &region,
                        platform,
                        None,
                        riot_id,
                        true,
                    )
                    .await
                    .map_err(|retry_err| {
                        retry_err
                            .strip_prefix(INVALID_PUUID_ERR_PREFIX)
                            .unwrap_or(&retry_err)
                            .to_string()
                    })?
                } else {
                    return Err(clean_err.to_string());
                }
            } else {
                return Err(err);
            }
        }
    };

    if let (Some(id), Some(resolved_puuid)) = (account_id, result.puuid.as_deref()) {
        save_cached_api_puuid(dir, platform, id, resolved_puuid);
    }

    put_cached_status(cache_key, &result);
    if let Some(resolved_puuid) = result.puuid.as_deref() {
        if !resolved_puuid.trim().is_empty() && !is_uuid_36(resolved_puuid) {
            put_cached_status(
                format!("{:?}:{platform}:p:{resolved_puuid}", config.mode),
                &result,
            );
        }
    }
    Ok(result)
}
