use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub win_rate: u32,
    #[serde(default)]
    pub formatted_rank: String,
    #[serde(default)]
    pub formatted_win_rate: String,
    #[serde(default)]
    pub opgg_url: String,
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
    })
}

pub async fn fetch_opgg_summoner(
    client: &reqwest::Client,
    summoner_name: &str,
    tag_line: &str,
    region: &str,
) -> Result<SummonerProfile, String> {
    let opgg_region = opgg_region_slug(region);
    let slug = format!(
        "{}-{}",
        urlencoding_simple(summoner_name),
        urlencoding_simple(tag_line)
    );
    let url = format!("https://op.gg/lol/summoners/{}/{}", opgg_region, slug);

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
            "Summoner '{summoner_name}#{tag_line}' not found on OP.GG ({opgg_region})"
        ));
    }

    if !status.is_success() {
        return Err(format!("OP.GG returned HTTP status {}", status));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read OP.GG body: {e}"))?;
    parse_opgg_meta(&text, summoner_name, tag_line, region)
}

#[tauri::command]
pub async fn fetch_opgg_summoner_stats(
    summoner_name: String,
    tag_line: String,
    region: String,
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

    fetch_opgg_summoner(&client, name, tag, &region).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opgg_meta_description() {
        let html = r#"<html><head><meta name="description" content="Kingof3O#EUW / Platinum 2 17 LP / 136Win 139Lose Win rate 49% / Wukong - 115Win 120Lose Win rate 49%"></head></html>"#;
        let p = parse_opgg_meta(html, "Kingof3O", "EUW", "EUW").unwrap();
        assert_eq!(p.tier, "Platinum");
        assert_eq!(p.rank, "2");
        assert_eq!(p.league_points, 17);
        assert_eq!(p.wins, 136);
        assert_eq!(p.losses, 139);
        assert_eq!(p.win_rate, 49);
        assert_eq!(p.formatted_rank, "Platinum II (17 LP)");
        assert_eq!(p.formatted_win_rate, "136W - 139L (49%)");
        assert_eq!(p.opgg_url, "https://op.gg/lol/summoners/euw/Kingof3O-EUW");
    }

    #[test]
    fn parses_apex_opgg_meta_description() {
        let html = r#"<html><head><meta name="description" content="Hide on bush#KR1 / Master 831 LP / 448Win 371Lose Win rate 55% / Yone - 31Win"></head></html>"#;
        let p = parse_opgg_meta(html, "Hide on bush", "KR1", "KR").unwrap();
        assert_eq!(p.tier, "Master");
        assert_eq!(p.league_points, 831);
        assert_eq!(p.wins, 448);
        assert_eq!(p.losses, 371);
        assert_eq!(p.win_rate, 55);
        assert_eq!(p.formatted_rank, "Master (831 LP)");
        assert_eq!(p.formatted_win_rate, "448W - 371L (55%)");
    }
}
