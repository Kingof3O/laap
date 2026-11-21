use crate::local_store::models::Game;
use super::assets::league_champion_icon_url;
use super::models::{now, ChampionStat, SummonerProfile};
use super::tiers::roman_rank;

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

pub fn extract_league_level(html: &str) -> Option<u32> {
    let needles = ["mt-[-11px]", "mt-\\[-11px\\]", "profile_icons/profileIcon"];
    for needle in needles {
        let mut search_idx = 0;
        while let Some(rel) = html[search_idx..].find(needle) {
            let pos = search_idx + rel;
            search_idx = pos + needle.len();
            let slice = &html[pos..html.len().min(pos + 800)];

            // 1. Check for HTML span: <span ...>197</span>
            if let Some(span_end) = slice.find("</span>") {
                if let Some(span_start) = slice[..span_end].rfind('>') {
                    let text = slice[span_start + 1..span_end].trim();
                    if let Ok(lvl) = text.parse::<u32>() {
                        if lvl > 0 && lvl < 50_000 {
                            return Some(lvl);
                        }
                    }
                }
            }

            // 2. Check for Next.js / RSC JSON: "children": 197
            let mut c_search = 0;
            while let Some(c_rel) = slice[c_search..].find("\"children\":") {
                let c_pos = c_search + c_rel + 11;
                c_search = c_pos;
                let rest = slice[c_pos..].trim_start();
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    if let Ok(lvl) = digits.parse::<u32>() {
                        if lvl > 0 && lvl < 50_000 {
                            return Some(lvl);
                        }
                    }
                }
            }
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

    let roman_rank = roman_rank(&rank);

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

    let mut top_champions = Vec::new();
    if parts.len() > 3 {
        let champs_part = parts[3..].join(" / ");
        for chunk in champs_part.split(',') {
            let chunk = chunk.trim();
            if chunk.is_empty() {
                continue;
            }
            if let Some((champ_name, rest)) = chunk.split_once('-') {
                let name = champ_name.trim();
                if name.is_empty() {
                    continue;
                }
                let mut c_wins = 0;
                let mut c_losses = 0;
                let mut c_win_rate = 0;

                if let Some(win_idx) = rest.find("Win") {
                    c_wins = rest[..win_idx].trim().parse().unwrap_or(0);
                    let after_win = &rest[win_idx + 3..];
                    if let Some(lose_idx) = after_win.find("Lose") {
                        c_losses = after_win[..lose_idx].trim().parse().unwrap_or(0);
                    }
                }
                if let Some(rate_idx) = rest.find("Win rate ") {
                    let rate_str = &rest[rate_idx + 9..];
                    let num_str = rate_str.trim_end_matches('%').trim();
                    c_win_rate = num_str.parse().unwrap_or(0);
                } else if c_wins + c_losses > 0 {
                    c_win_rate =
                        ((c_wins as f64 / (c_wins + c_losses) as f64) * 100.0).round() as u32;
                }

                let icon_url = league_champion_icon_url(name);
                top_champions.push(ChampionStat {
                    name: name.to_string(),
                    icon_url,
                    wins: c_wins,
                    losses: c_losses,
                    win_rate: c_win_rate,
                    count: c_wins + c_losses,
                });
                if top_champions.len() >= 3 {
                    break;
                }
            }
        }
    }

    let level = extract_league_level(html);
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
        level,
        puuid: None,
        avatar_url,
        rr: None,
        top_champions,
        combat_stats: None,
    })
}
