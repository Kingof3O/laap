/// Maps UI region codes to Riot `(accountCluster, platform)` hosts.
/// Cross-game `account-v1` only exists on `americas`, `europe`, and `asia` (including OCE/SEA).
pub fn resolve_routing(region: &str) -> Result<(&'static str, &'static str), String> {
    Ok(match region.trim().to_ascii_uppercase().as_str() {
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
        "OCE" | "OC1" => ("asia", "oc1"),
        "SEA" | "SG" | "SG2" | "PH" | "PH2" | "TH" | "TH2" => ("asia", "sg2"),
        "TW" | "TW2" => ("asia", "tw2"),
        "VN" | "VN2" => ("asia", "vn2"),
        _ => return Err("Unsupported Riot platform region".into()),
    })
}

/// Validates and canonicalizes a Cloudflare Worker base URL without keeping a trailing `/api/riot/live-status`.
pub fn normalize_worker_url(raw: &str) -> Result<Option<String>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| "Worker URL must be a valid HTTPS URL.".to_string())?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Worker URL cannot embed credentials.".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Worker URL should be a base origin without query parameters.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Worker URL must include a hostname.".to_string())?;
    let is_loopback = host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1";
    match parsed.scheme() {
        "https" => {}
        "http" if is_loopback => {}
        _ => return Err("Worker URL must use https://.".into()),
    }

    let mut clean = parsed.as_str().trim_end_matches('/').to_string();
    for suffix in ["/api/riot/live-status", "/api"] {
        if clean.ends_with(suffix) {
            clean.truncate(clean.len() - suffix.len());
        }
    }
    Ok(Some(clean))
}

pub fn split_riot_id(raw: &str) -> Option<(String, String)> {
    let (name, tag) = raw.rsplit_once('#')?;
    let name = name.trim();
    let tag = tag.trim();
    if name.is_empty()
        || tag.is_empty()
        || name.chars().count() > 32
        || tag.chars().count() > 16
        || name.chars().chain(tag.chars()).any(char::is_control)
    {
        return None;
    }
    Some((name.to_string(), tag.to_string()))
}

pub fn segment_url(base: &str, segments: &[&str]) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(base).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Invalid Riot API URL".to_string())?
        .extend(segments);
    Ok(url)
}

/// RSO/LCU `sub` identifiers are 36-char RFC 4122 UUIDs; Riot Developer `spectator-v5` rejects them with HTTP 400.
pub fn is_uuid_36(raw: &str) -> bool {
    let bytes = raw.trim().as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(idx, ch)| match idx {
        8 | 13 | 18 | 23 => *ch == b'-',
        _ => ch.is_ascii_hexdigit(),
    })
}

pub fn sanitize_api_puuid(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|p| !p.is_empty() && p.len() <= 150 && !is_uuid_36(p))
        .map(str::to_string)
}

pub fn api_puuid_entry_key(platform: &str, account_id: &str) -> String {
    format!("{}:{account_id}", platform.trim().to_ascii_lowercase())
}
