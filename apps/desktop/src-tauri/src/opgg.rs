use crate::local_store::models::Game;
use serde::{Deserialize, Serialize};

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

pub fn valorant_tier_to_rank(tier: u32) -> &'static str {
    match tier {
        0 => "Unranked",
        1..=2 => "Unranked",
        3 => "Iron 1",
        4 => "Iron 2",
        5 => "Iron 3",
        6 => "Bronze 1",
        7 => "Bronze 2",
        8 => "Bronze 3",
        9 => "Silver 1",
        10 => "Silver 2",
        11 => "Silver 3",
        12 => "Gold 1",
        13 => "Gold 2",
        14 => "Gold 3",
        15 => "Platinum 1",
        16 => "Platinum 2",
        17 => "Platinum 3",
        18 => "Diamond 1",
        19 => "Diamond 2",
        20 => "Diamond 3",
        21 => "Ascendant 1",
        22 => "Ascendant 2",
        23 => "Ascendant 3",
        24 => "Immortal 1",
        25 => "Immortal 2",
        26 => "Immortal 3",
        27 => "Radiant",
        _ => "Unranked",
    }
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn opgg_region_slug(region: &str) -> &'static str {
    match region.to_ascii_uppercase().as_str() {
        "EUW" | "EUW1" => "euw",
        "EUNE" | "EUN1" => "eune",
        "NA" | "NA1" => "na",
        "KR" => "kr",
        "BR" | "BR1" => "br",
        "LAN" | "LA1" => "lan",
        "LAS" | "LA2" => "las",
        "OCE" | "OC1" => "oce",
        "TR" | "TR1" => "tr",
        "RU" => "ru",
        "JP" | "JP1" => "jp",
        "ME" | "ME1" => "me",
        "SG" | "SG2" => "sg",
        "TW" | "TW2" => "tw",
        "VN" | "VN2" => "vn",
        "PH" | "PH2" => "ph",
        "TH" | "TH2" => "th",
        _ => "euw",
    }
}

pub fn urlencoding_simple(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub fn parse_opgg_meta(
    html: &str,
    summoner_name: &str,
    tag_line: &str,
    region: &str,
) -> Result<SummonerProfile, String> {
    let extract_content = |needle: &str| -> Option<&str> {
        let idx = html.find(needle)?;
        let slice = &html[idx..];
        let (content_idx, quote_char) = if let Some(i) = slice.find("content=\"") {
            (i + 9, '"')
        } else if let Some(i) = slice.find("content='") {
            (i + 9, '\'')
        } else {
            return None;
        };
        let rest = &slice[content_idx..];
        let end_idx = rest.find(quote_char)?;
        Some(&rest[..end_idx])
    };

    let content = extract_content("name=\"description\"")
        .or_else(|| extract_content("name='description'"))
        .or_else(|| extract_content("name=\"twitter:description\""))
        .or_else(|| extract_content("name='twitter:description'"))
        .or_else(|| extract_content("property=\"og:description\""))
        .ok_or_else(|| "OP.GG meta description not found".to_string())?;

    let opgg_region = opgg_region_slug(region);
    let opgg_url = format!(
        "https://op.gg/lol/summoners/{}/{}-{}",
        opgg_region,
        urlencoding_simple(summoner_name),
        urlencoding_simple(tag_line)
    );

    let parts: Vec<&str> = content.split(" / ").collect();
    let mut tier = "UNRANKED".to_string();
    let mut rank = String::new();
    let mut lp: u32 = 0;
    let mut wins: u32 = 0;
    let mut losses: u32 = 0;
    let mut win_rate: u32 = 0;

    if parts.len() > 1 {
        let rank_part = parts[1].trim();
        if rank_part.contains("LP") {
            let tokens: Vec<&str> = rank_part.split_whitespace().collect();
            if tokens.len() >= 4 && tokens.last() == Some(&"LP") {
                tier = tokens[0].to_string();
                rank = tokens[1].to_string();
                lp = tokens[2].parse().unwrap_or(0);
            } else if tokens.len() == 3 && tokens.last() == Some(&"LP") {
                tier = tokens[0].to_string();
                rank = String::new();
                lp = tokens[1].parse().unwrap_or(0);
            }
        }
    }

    if parts.len() > 2 {
        let stats_part = parts[2].trim();
        if let Some(win_idx) = stats_part.find("Win") {
            wins = stats_part[..win_idx].trim().parse().unwrap_or(0);
            let after_win = &stats_part[win_idx + 3..];
            if let Some(lose_idx) = after_win.find("Lose") {
                losses = after_win[..lose_idx].trim().parse().unwrap_or(0);
            }
        }
        if let Some(rate_idx) = stats_part.find("Win rate ") {
            let rate_str = &stats_part[rate_idx + 9..];
            let num_str = rate_str.trim_end_matches('%').trim();
            win_rate = num_str.parse().unwrap_or(0);
        } else if wins + losses > 0 {
            win_rate = ((wins as f64 / (wins + losses) as f64) * 100.0).round() as u32;
        }
    }

    let roman_rank = match rank.as_str() {
        "1" => "I",
        "2" => "II",
        "3" => "III",
        "4" => "IV",
        other => other,
    };

    let formatted_rank = if tier.to_ascii_uppercase() == "UNRANKED" || tier.is_empty() {
        "Unranked".to_string()
    } else if !roman_rank.is_empty() {
        format!("{} {} ({} LP)", tier, roman_rank, lp)
    } else {
        format!("{} ({} LP)", tier, lp)
    };

    let formatted_win_rate = if wins + losses == 0 {
        "Unranked (0 games)".to_string()
    } else {
        format!("{}W - {}L ({}%)", wins, losses, win_rate)
    };

    let avatar_url = extract_league_avatar_url(html);

    Ok(SummonerProfile {
        summoner_name: summoner_name.to_string(),
        tag_line: tag_line.to_string(),
        region: region.to_string(),
        tier,
        rank,
        league_points: lp,
        wins,
        losses,
        fetched_at: now(),
        source: "OP.GG Public Profile".to_string(),
        win_rate,
        formatted_rank,
        formatted_win_rate,
        opgg_url,
        game: Game::League,
        level: None,
        puuid: None,
        avatar_url,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValorantProfileJson {
    game_name: Option<String>,
    tag_line: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    level: Option<u32>,
    region: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    competitive_tier: Option<u32>,
    puuid: Option<String>,
}

fn deserialize_opt_u32<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: Option<serde_json::Value> = serde::Deserialize::deserialize(deserializer)?;
    match v {
        Some(serde_json::Value::Number(n)) => Ok(n.as_u64().map(|v| v as u32)),
        Some(serde_json::Value::String(s)) => Ok(s.parse::<u32>().ok()),
        _ => Ok(None),
    }
}

fn extract_profile_slice(html: &str) -> Option<ValorantProfileJson> {
    let bytes = html.as_bytes();
    let needle = "profile";
    let mut search_idx = 0;

    while let Some(rel_idx) = html[search_idx..].find(needle) {
        let p_idx = search_idx + rel_idx;
        search_idx = p_idx + needle.len();

        let escaped = if p_idx >= 2 && bytes[p_idx - 2] == b'\\' && bytes[p_idx - 1] == b'"' {
            true
        } else if p_idx >= 1 && bytes[p_idx - 1] == b'"' {
            false
        } else {
            continue;
        };

        let end_quote_pos = if escaped {
            if p_idx + needle.len() + 1 < bytes.len()
                && bytes[p_idx + needle.len()] == b'\\'
                && bytes[p_idx + needle.len() + 1] == b'"'
            {
                p_idx + needle.len() + 2
            } else {
                continue;
            }
        } else if p_idx + needle.len() < bytes.len() && bytes[p_idx + needle.len()] == b'"' {
            p_idx + needle.len() + 1
        } else {
            continue;
        };

        let mut pos = end_quote_pos;
        while pos < bytes.len()
            && (bytes[pos] == b' '
                || bytes[pos] == b'\t'
                || bytes[pos] == b'\r'
                || bytes[pos] == b'\n')
        {
            pos += 1;
        }
        if pos >= bytes.len() || bytes[pos] != b':' {
            continue;
        }
        pos += 1;
        while pos < bytes.len()
            && (bytes[pos] == b' '
                || bytes[pos] == b'\t'
                || bytes[pos] == b'\r'
                || bytes[pos] == b'\n')
        {
            pos += 1;
        }
        if pos >= bytes.len() || bytes[pos] != b'{' {
            continue;
        }

        let start_brace_idx = pos;
        let escaped_quotes = escaped;

        // Scan for matching closing brace
        let mut depth = 0usize;
        let mut in_string = false;
        let mut i = start_brace_idx;
        let mut end_idx = None;

        while i < bytes.len() {
            if !in_string {
                if escaped_quotes && i + 1 < bytes.len() && bytes[i] == b'\\' && bytes[i + 1] == b'"'
                {
                    in_string = true;
                    i += 2;
                } else if !escaped_quotes && bytes[i] == b'"' {
                    in_string = true;
                    i += 1;
                } else if bytes[i] == b'{' {
                    depth += 1;
                    i += 1;
                } else if bytes[i] == b'}' {
                    depth -= 1;
                    if depth == 0 {
                        end_idx = Some(i + 1);
                        break;
                    }
                    i += 1;
                } else {
                    i += 1;
                }
            } else {
                if escaped_quotes {
                    if i + 1 < bytes.len() && bytes[i] == b'\\' && bytes[i + 1] == b'"' {
                        let mut slash_count = 0;
                        let mut k = i;
                        while k > start_brace_idx && bytes[k - 1] == b'\\' {
                            slash_count += 1;
                            k -= 1;
                        }
                        if slash_count % 2 == 0 {
                            in_string = false;
                        }
                        i += 2;
                    } else {
                        i += 1;
                    }
                } else if bytes[i] == b'"' {
                    let mut slash_count = 0;
                    let mut k = i;
                    while k > start_brace_idx && bytes[k - 1] == b'\\' {
                        slash_count += 1;
                        k -= 1;
                    }
                    if slash_count % 2 == 0 {
                        in_string = false;
                    }
                    i += 1;
                } else {
                    i += 1;
                }
            }
        }

        if let Some(end) = end_idx {
            let slice = &html[start_brace_idx..end];
            let json_candidate = if escaped_quotes {
                slice.replace("\\\"", "\"")
            } else {
                slice.to_string()
            };
            if let Ok(prof) = serde_json::from_str::<ValorantProfileJson>(&json_candidate) {
                if prof.competitive_tier.is_some()
                    || prof.game_name.is_some()
                    || prof.puuid.is_some()
                    || prof.level.is_some()
                {
                    return Some(prof);
                }
            }
        }
    }

    None
}

pub fn extract_valorant_avatar_url(html: &str) -> Option<String> {
    // 1. Check for OP.GG Assets/PlayerCards/...
    let needle = "Assets/PlayerCards/";
    if let Some(pos) = html.find(needle) {
        let after = &html[pos + needle.len()..];
        let end_rel = after
            .find(['"', '\'', '?', ' ', '&', '\\', '<', '>'])
            .unwrap_or(after.len());
        let filename = &after[..end_rel];
        if !filename.is_empty() {
            return Some(format!(
                "https://c-valorant-api.op.gg/Assets/PlayerCards/{}",
                filename
            ));
        }
    }
    // 2. Generic playercards search
    if let Some(pos) = html.find("/playercards/") {
        if let Some(start_rel) = html[..pos].rfind("https://") {
            let rest = &html[start_rel..];
            let end_rel = rest
                .find(['"', '\'', '?', ' ', '&', '\\', '<', '>'])
                .unwrap_or(rest.len());
            return Some(rest[..end_rel].to_string());
        }
    }
    None
}

pub fn extract_league_avatar_url(html: &str) -> Option<String> {
    let needle = "profile_icons/profileIcon";
    if let Some(pos) = html.find(needle) {
        if let Some(start_rel) = html[..pos].rfind("https://") {
            let rest = &html[start_rel..];
            let end_rel = rest
                .find(['"', '\'', '?', ' ', '&', '\\', '<', '>'])
                .unwrap_or(rest.len());
            return Some(rest[..end_rel].to_string());
        }
    }
    None
}

pub fn parse_opgg_valorant_html(
    html: &str,
    summoner_name: &str,
    tag_line: &str,
    region: &str,
) -> Result<SummonerProfile, String> {
    let parsed = extract_profile_slice(html)
        .or_else(|| {
            if html.contains("&quot;") {
                let unent = html.replace("&quot;", "\"");
                extract_profile_slice(&unent)
            } else {
                None
            }
        })
        .ok_or_else(|| "OP.GG VALORANT profile not found in page".to_string())?;

    let tier_num = parsed.competitive_tier.unwrap_or(0);
    let formatted_rank = valorant_tier_to_rank(tier_num).to_string();

    let (tier, rank) = if let Some((t, r)) = formatted_rank.split_once(' ') {
        (t.to_string(), r.to_string())
    } else {
        (formatted_rank.clone(), String::new())
    };

    let final_name = parsed
        .game_name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| summoner_name.to_string());
    let final_tag = parsed
        .tag_line
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| tag_line.to_string());
    let final_region = parsed
        .region
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| region.to_string());

    let opgg_url = format!(
        "https://op.gg/valorant/profile/{}-{}",
        urlencoding_simple(&final_name),
        urlencoding_simple(&final_tag)
    );

    let avatar_url = extract_valorant_avatar_url(html);

    Ok(SummonerProfile {
        summoner_name: final_name,
        tag_line: final_tag,
        region: final_region,
        tier,
        rank,
        league_points: 0,
        wins: 0,
        losses: 0,
        fetched_at: now(),
        source: "OP.GG Public Profile".to_string(),
        win_rate: 0,
        formatted_rank,
        formatted_win_rate: "Unranked (0 games)".to_string(),
        opgg_url,
        game: Game::Valorant,
        level: parsed.level,
        puuid: parsed.puuid.filter(|s| !s.trim().is_empty()),
        avatar_url,
    })
}

pub async fn fetch_opgg_summoner(
    client: &reqwest::Client,
    summoner_name: &str,
    tag_line: &str,
    region: &str,
    game: Game,
) -> Result<SummonerProfile, String> {
    let (url, opgg_region_display) = match game {
        Game::League => {
            let opgg_region = opgg_region_slug(region);
            let slug = format!(
                "{}-{}",
                urlencoding_simple(summoner_name),
                urlencoding_simple(tag_line)
            );
            (
                format!("https://op.gg/lol/summoners/{}/{}", opgg_region, slug),
                opgg_region.to_string(),
            )
        }
        Game::Valorant => {
            let slug = format!(
                "{}-{}",
                urlencoding_simple(summoner_name),
                urlencoding_simple(tag_line)
            );
            (
                format!("https://op.gg/valorant/profile/{}", slug),
                "valorant".to_string(),
            )
        }
    };

    let response = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("OP.GG request failed: {e}"))?;

    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!(
            "Summoner '{summoner_name}#{tag_line}' not found on OP.GG ({opgg_region_display})"
        ));
    }

    if !status.is_success() {
        return Err(format!("OP.GG returned HTTP status {}", status));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read OP.GG body: {e}"))?;

    match game {
        Game::League => parse_opgg_meta(&text, summoner_name, tag_line, region),
        Game::Valorant => parse_opgg_valorant_html(&text, summoner_name, tag_line, region),
    }
}

#[tauri::command]
pub async fn fetch_opgg_summoner_stats(
    summoner_name: String,
    tag_line: String,
    region: String,
    game: Option<Game>,
) -> Result<SummonerProfile, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let (name, tag) = if let Some((n, t)) = summoner_name.split_once('#') {
        (
            n.trim(),
            if !tag_line.trim().is_empty() {
                tag_line.trim()
            } else {
                t.trim()
            },
        )
    } else {
        (
            summoner_name.trim(),
            if tag_line.trim().is_empty() {
                region.trim()
            } else {
                tag_line.trim()
            },
        )
    };

    fetch_opgg_summoner(
        &client,
        name,
        tag,
        &region,
        game.unwrap_or(Game::League),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opgg_meta_description() {
        let html = r#"<html><head><meta name="description" content="Kingof3O#EUW / Platinum 2 17 LP / 136Win 139Lose Win rate 49% / Wukong - 115Win 120Lose Win rate 49%"><img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg"/></head></html>"#;
        let p = parse_opgg_meta(html, "Kingof3O", "EUW", "EUW").unwrap();
        assert_eq!(p.game, Game::League);
        assert_eq!(p.tier, "Platinum");
        assert_eq!(p.rank, "2");
        assert_eq!(p.league_points, 17);
        assert_eq!(p.wins, 136);
        assert_eq!(p.losses, 139);
        assert_eq!(p.win_rate, 49);
        assert_eq!(p.formatted_rank, "Platinum II (17 LP)");
        assert_eq!(p.formatted_win_rate, "136W - 139L (49%)");
        assert_eq!(p.opgg_url, "https://op.gg/lol/summoners/euw/Kingof3O-EUW");
        assert_eq!(
            p.avatar_url.as_deref(),
            Some("https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg")
        );
    }

    #[test]
    fn parses_apex_opgg_meta_description() {
        let html = r#"<html><head><meta name="description" content="Hide on bush#KR1 / Master 831 LP / 448Win 371Lose Win rate 55% / Yone - 31Win"></head></html>"#;
        let p = parse_opgg_meta(html, "Hide on bush", "KR1", "KR").unwrap();
        assert_eq!(p.game, Game::League);
        assert_eq!(p.tier, "Master");
        assert_eq!(p.league_points, 831);
        assert_eq!(p.wins, 448);
        assert_eq!(p.losses, 371);
        assert_eq!(p.win_rate, 55);
        assert_eq!(p.formatted_rank, "Master (831 LP)");
        assert_eq!(p.formatted_win_rate, "448W - 371L (55%)");
    }

    #[test]
    fn valorant_tier_mapping_boundaries() {
        assert_eq!(valorant_tier_to_rank(0), "Unranked");
        assert_eq!(valorant_tier_to_rank(1), "Unranked");
        assert_eq!(valorant_tier_to_rank(2), "Unranked");
        assert_eq!(valorant_tier_to_rank(3), "Iron 1");
        assert_eq!(valorant_tier_to_rank(4), "Iron 2");
        assert_eq!(valorant_tier_to_rank(5), "Iron 3");
        assert_eq!(valorant_tier_to_rank(6), "Bronze 1");
        assert_eq!(valorant_tier_to_rank(7), "Bronze 2");
        assert_eq!(valorant_tier_to_rank(8), "Bronze 3");
        assert_eq!(valorant_tier_to_rank(9), "Silver 1");
        assert_eq!(valorant_tier_to_rank(10), "Silver 2");
        assert_eq!(valorant_tier_to_rank(11), "Silver 3");
        assert_eq!(valorant_tier_to_rank(12), "Gold 1");
        assert_eq!(valorant_tier_to_rank(13), "Gold 2");
        assert_eq!(valorant_tier_to_rank(14), "Gold 3");
        assert_eq!(valorant_tier_to_rank(15), "Platinum 1");
        assert_eq!(valorant_tier_to_rank(16), "Platinum 2");
        assert_eq!(valorant_tier_to_rank(17), "Platinum 3");
        assert_eq!(valorant_tier_to_rank(18), "Diamond 1");
        assert_eq!(valorant_tier_to_rank(19), "Diamond 2");
        assert_eq!(valorant_tier_to_rank(20), "Diamond 3");
        assert_eq!(valorant_tier_to_rank(21), "Ascendant 1");
        assert_eq!(valorant_tier_to_rank(22), "Ascendant 2");
        assert_eq!(valorant_tier_to_rank(23), "Ascendant 3");
        assert_eq!(valorant_tier_to_rank(24), "Immortal 1");
        assert_eq!(valorant_tier_to_rank(25), "Immortal 2");
        assert_eq!(valorant_tier_to_rank(26), "Immortal 3");
        assert_eq!(valorant_tier_to_rank(27), "Radiant");
        assert_eq!(valorant_tier_to_rank(28), "Unranked");
        assert_eq!(valorant_tier_to_rank(99), "Unranked");
    }

    #[test]
    fn parses_valorant_rsc_html_fixture() {
        let fixture = r#"
        <!DOCTYPE html><html><body>
        <script>
        self.__next_f.push([1,"7:[\"$\",\"$L8\",null,{\"profile\":{\"gameName\":\"Jett\",\"tagLine\":\"NA1\",\"level\":52,\"region\":\"na\",\"competitiveTier\":21,\"puuid\":\"c7b12d34-5678-90ab-cdef-1234567890ab\"},\"tierHistories\":[]}]"]);
        </script>
        <img src="https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png?image=w_128"/>
        </body></html>
        "#;

        let p = parse_opgg_valorant_html(fixture, "Jett", "NA1", "NA").unwrap();
        assert_eq!(p.game, Game::Valorant);
        assert_eq!(p.summoner_name, "Jett");
        assert_eq!(p.tag_line, "NA1");
        assert_eq!(p.region, "na");
        assert_eq!(p.tier, "Ascendant");
        assert_eq!(p.rank, "1");
        assert_eq!(p.formatted_rank, "Ascendant 1");
        assert_eq!(p.league_points, 0);
        assert_eq!(p.level, Some(52));
        assert_eq!(
            p.puuid.as_deref(),
            Some("c7b12d34-5678-90ab-cdef-1234567890ab")
        );
        assert_eq!(p.opgg_url, "https://op.gg/valorant/profile/Jett-NA1");
        assert_eq!(
            p.avatar_url.as_deref(),
            Some("https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png")
        );
    }

    #[test]
    fn parses_valorant_html_fixture_tier_0() {
        let fixture = r#"{"profile":{"gameName":"NewPlayer","tagLine":"0000","level":10,"region":"eu","competitiveTier":0,"puuid":"p-0"}}"#;
        let p = parse_opgg_valorant_html(fixture, "NewPlayer", "0000", "EUW").unwrap();
        assert_eq!(p.formatted_rank, "Unranked");
        assert_eq!(p.tier, "Unranked");
        assert_eq!(p.rank, "");
        assert_eq!(p.level, Some(10));
    }

    #[test]
    fn parses_valorant_html_fixture_tier_3() {
        let fixture = r#"<script>self.__next_f.push([1,"\"profile\":{\"gameName\":\"IronGuy\",\"tagLine\":\"1234\",\"level\":25,\"region\":\"na\",\"competitiveTier\":3,\"puuid\":\"p-3\"}"])</script>"#;
        let p = parse_opgg_valorant_html(fixture, "IronGuy", "1234", "NA").unwrap();
        assert_eq!(p.formatted_rank, "Iron 1");
        assert_eq!(p.tier, "Iron");
        assert_eq!(p.rank, "1");
    }

    #[test]
    fn parses_valorant_html_fixture_tier_26() {
        let fixture = r#"{"profile":{"gameName":"ProGuy","tagLine":"KR1","level":210,"region":"kr","competitiveTier":26,"puuid":"p-26"}}"#;
        let p = parse_opgg_valorant_html(fixture, "ProGuy", "KR1", "KR").unwrap();
        assert_eq!(p.formatted_rank, "Immortal 3");
        assert_eq!(p.tier, "Immortal");
        assert_eq!(p.rank, "3");
    }

    #[test]
    fn parses_valorant_html_fixture_tier_27() {
        let fixture = r#"<script>self.__next_f.push([1,"\"profile\":{\"gameName\":\"RadiantGod\",\"tagLine\":\"VAL\",\"level\":340,\"region\":\"na\",\"competitiveTier\":27,\"puuid\":\"p-27\"}"])</script>"#;
        let p = parse_opgg_valorant_html(fixture, "RadiantGod", "VAL", "NA").unwrap();
        assert_eq!(p.formatted_rank, "Radiant");
        assert_eq!(p.tier, "Radiant");
        assert_eq!(p.rank, "");
    }

    #[test]
    fn parses_valorant_html_fixture_unused_1_and_2() {
        let fixture1 = r#"{"profile":{"gameName":"Unused1","tagLine":"VAL","level":5,"region":"na","competitiveTier":1,"puuid":"p-1"}}"#;
        let p1 = parse_opgg_valorant_html(fixture1, "Unused1", "VAL", "NA").unwrap();
        assert_eq!(p1.formatted_rank, "Unranked");

        let fixture2 = r#"{"profile":{"gameName":"Unused2","tagLine":"VAL","level":5,"region":"na","competitiveTier":2,"puuid":"p-2"}}"#;
        let p2 = parse_opgg_valorant_html(fixture2, "Unused2", "VAL", "NA").unwrap();
        assert_eq!(p2.formatted_rank, "Unranked");
    }

    #[test]
    fn parses_valorant_html_fixture_unknown_28() {
        let fixture = r#"{"profile":{"gameName":"FutureTier","tagLine":"VAL","level":100,"region":"na","competitiveTier":28,"puuid":"p-28"}}"#;
        let p = parse_opgg_valorant_html(fixture, "FutureTier", "VAL", "NA").unwrap();
        assert_eq!(p.formatted_rank, "Unranked");
    }

    #[test]
    fn puuid_identity_check_rules() {
        // Matching PUUIDs pass
        assert!(verify_puuid_identity(Some("puuid-xyz"), Some("puuid-xyz")).is_ok());

        // Mismatched PUUIDs fail with specific error
        let err = verify_puuid_identity(Some("puuid-xyz"), Some("puuid-other")).unwrap_err();
        assert_eq!(
            err,
            "OP.GG returned a different Riot account; saved rank kept."
        );

        // Missing on either side succeeds
        assert!(verify_puuid_identity(None, Some("puuid-xyz")).is_ok());
        assert!(verify_puuid_identity(Some("puuid-xyz"), None).is_ok());
        assert!(verify_puuid_identity(None, None).is_ok());
        assert!(verify_puuid_identity(Some(""), Some("puuid-xyz")).is_ok());
        assert!(verify_puuid_identity(Some("puuid-xyz"), Some("")).is_ok());
    }

    #[test]
    fn unparseable_valorant_page_returns_error() {
        let html = r#"<html><head><meta name="description" content="Search results for Player#NA1"></head><body>Not found</body></html>"#;
        let res = parse_opgg_valorant_html(html, "Player", "NA1", "NA");
        assert!(res.is_err());
        assert_eq!(
            res.unwrap_err(),
            "OP.GG VALORANT profile not found in page"
        );
    }
}
