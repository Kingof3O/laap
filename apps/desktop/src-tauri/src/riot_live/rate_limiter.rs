use reqwest::header::HeaderMap;
use std::collections::{HashMap, VecDeque};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use super::models::{
    LiveStatusResult, LONG_LIMIT, LONG_WINDOW, MAX_CACHE_ENTRIES, SHORT_LIMIT, SHORT_WINDOW,
    STATUS_CACHE_TTL,
};

#[derive(Default)]
pub struct LiveRuntimeState {
    pub puuid_cache: HashMap<String, String>,
    pub status_cache: HashMap<String, (Instant, LiveStatusResult)>,
    pub retry_until_by_platform: HashMap<String, Instant>,
    pub recent_requests_by_platform: HashMap<String, VecDeque<Instant>>,
}

pub static LIVE_STATE: LazyLock<Mutex<LiveRuntimeState>> =
    LazyLock::new(|| Mutex::new(LiveRuntimeState::default()));

pub fn clear_status_cache() {
    if let Ok(mut state) = LIVE_STATE.lock() {
        state.status_cache.clear();
    }
}

pub fn parse_retry_after(headers: &HeaderMap) -> u64 {
    headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|s| s.clamp(1, 300))
        .unwrap_or(60)
}

pub fn check_and_record_rate_limit(platform: &str, enforce_window: bool) -> Result<(), String> {
    let mut state = LIVE_STATE
        .lock()
        .map_err(|_| "Live status rate limiter unavailable".to_string())?;
    let now = Instant::now();
    if let Some(&until) = state.retry_until_by_platform.get(platform) {
        if until > now {
            let secs = until.duration_since(now).as_secs().max(1);
            return Err(format!(
                "[RATE_LIMITED] Riot API cooldown active ({platform}); retry in {secs}s"
            ));
        }
        state.retry_until_by_platform.remove(platform);
    }

    if enforce_window {
        let log = state
            .recent_requests_by_platform
            .entry(platform.to_string())
            .or_default();
        while log
            .front()
            .is_some_and(|&ts| now.duration_since(ts) > LONG_WINDOW)
        {
            log.pop_front();
        }
        let short_count = log
            .iter()
            .filter(|&&ts| now.duration_since(ts) <= SHORT_WINDOW)
            .count();
        if short_count >= SHORT_LIMIT {
            return Err("[RATE_LIMITED] Riot 1-second burst guard reached; retry shortly".into());
        }
        if log.len() >= LONG_LIMIT {
            let oldest = *log.front().expect("checked non-empty");
            let wait = LONG_WINDOW
                .saturating_sub(now.duration_since(oldest))
                .as_secs()
                .max(1);
            return Err(format!(
                "[RATE_LIMITED] Riot 2-minute rate budget protected; retry in {wait}s"
            ));
        }
        log.push_back(now);
    }
    Ok(())
}

pub fn set_cooldown(platform: &str, seconds: u64) {
    if let Ok(mut state) = LIVE_STATE.lock() {
        state.retry_until_by_platform.insert(
            platform.to_string(),
            Instant::now() + Duration::from_secs(seconds.clamp(1, 300)),
        );
    }
}

pub fn get_cached_status(key: &str) -> Option<LiveStatusResult> {
    let mut state = LIVE_STATE.lock().ok()?;
    let now = Instant::now();
    let (created_at, entry) = state.status_cache.get(key)?;
    if now.duration_since(*created_at) < STATUS_CACHE_TTL {
        let mut cloned = entry.clone();
        cloned.cached = true;
        return Some(cloned);
    }
    state.status_cache.remove(key);
    None
}

pub fn put_cached_status(key: String, status: &LiveStatusResult) {
    if let Ok(mut state) = LIVE_STATE.lock() {
        if state.status_cache.len() >= MAX_CACHE_ENTRIES {
            if let Some(oldest_key) = state.status_cache.keys().next().cloned() {
                state.status_cache.remove(&oldest_key);
            }
        }
        state
            .status_cache
            .insert(key, (Instant::now(), status.clone()));
    }
}

pub fn clear_mem_puuid_cache(
    platform: &str,
    riot_id: Option<&(String, String)>,
    stale_puuid: Option<&str>,
) {
    let Ok(mut state) = LIVE_STATE.lock() else {
        return;
    };
    if let Some((game_name, tag_line)) = riot_id {
        let mem_key = format!(
            "{platform}\0{}\0{}",
            game_name.to_ascii_lowercase(),
            tag_line.to_ascii_lowercase()
        );
        state.puuid_cache.remove(&mem_key);
    }
    if let Some(stale) = stale_puuid {
        state.puuid_cache.retain(|_, v| v != stale);
    }
}
