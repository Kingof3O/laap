use crate::local_store::models::Game;
use serde::Deserialize;
use super::assets::{valorant_agent_from_id, valorant_agent_icon_url};
use super::league::urlencoding_simple;
use super::models::{now, ChampionStat, CombatStats, SummonerProfile};
use super::tiers::valorant_tier_to_rank;

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
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    rank: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    tier_progress: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    score: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    ranked_rating: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    rr: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    wins: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    losses: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    win_rate: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_f32")]
    kd: Option<f32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    headshot_rate: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    headshot_percentage: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32")]
    damage_per_round: Option<u32>,
    #[serde(default, alias = "most_character_id", alias = "mostCharacterId")]
    most_character_id: Option<String>,
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

fn deserialize_opt_f32<'de, D>(deserializer: D) -> Result<Option<f32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: Option<serde_json::Value> = serde::Deserialize::deserialize(deserializer)?;
    match v {
        Some(serde_json::Value::Number(n)) => Ok(n.as_f64().map(|v| v as f32)),
        Some(serde_json::Value::String(s)) => Ok(s.parse::<f32>().ok()),
        _ => Ok(None),
    }
}

pub fn extract_number_after(text: &str, needle: &str) -> Option<u32> {
    let pos = text.find(needle)?;
    let rest = text[pos + needle.len()..].trim_start();
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if !digits.is_empty() {
        digits.parse().ok()
    } else {
        None
    }
}

pub fn extract_f32_after(text: &str, needle: &str) -> Option<f32> {
    let pos = text.find(needle)?;
    let rest = text[pos + needle.len()..].trim_start();
    let num_str: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if !num_str.is_empty() {
        num_str.parse().ok()
    } else {
        None
    }
}

pub fn extract_valorant_agents(html: &str) -> Vec<ChampionStat> {
    let mut agents = Vec::new();
    let unescaped_candidate;
    let text = if html.contains("\\\"") {
        unescaped_candidate = html.replace("\\\"", "\"");
        &unescaped_candidate
    } else {
        html
    };

    let needles = ["\"agentName\":", "\"characterName\":", "\"agent\":{\"name\":"];
    for needle in needles {
        let mut search_idx = 0;
        while let Some(rel) = text[search_idx..].find(needle) {
            let pos = search_idx + rel;
            search_idx = pos + needle.len();
            let slice_start = pos + needle.len();
            let slice = &text[slice_start..text.len().min(slice_start + 600)];
            if let Some(name_start) = slice.find('"') {
                let rest_name = &slice[name_start + 1..];
                if let Some(name_end) = rest_name.find('"') {
                    let name = rest_name[..name_end].trim();
                    if !name.is_empty()
                        && name.len() < 30
                        && !agents
                            .iter()
                            .any(|a: &ChampionStat| a.name.eq_ignore_ascii_case(name))
                    {
                        let c_wins = extract_number_after(slice, "\"win\":")
                            .or_else(|| extract_number_after(slice, "\"wins\":"))
                            .unwrap_or(0);
                        let c_losses = extract_number_after(slice, "\"lose\":")
                            .or_else(|| extract_number_after(slice, "\"losses\":"))
                            .unwrap_or(0);
                        let c_games = extract_number_after(slice, "\"play\":")
                            .or_else(|| extract_number_after(slice, "\"games\":"))
                            .unwrap_or(c_wins + c_losses);
                        let c_win_rate = extract_number_after(slice, "\"winRate\":")
                            .unwrap_or_else(|| {
                                if c_wins + c_losses > 0 {
                                    ((c_wins as f64 / (c_wins + c_losses) as f64) * 100.0).round()
                                        as u32
                                } else {
                                    0
                                }
                            });
                        let icon_url = valorant_agent_icon_url(name);
                        agents.push(ChampionStat {
                            name: name.to_string(),
                            icon_url,
                            wins: c_wins,
                            losses: c_losses,
                            win_rate: c_win_rate,
                            count: c_games,
                        });
                        if agents.len() >= 3 {
                            return agents;
                        }
                    }
                }
            }
        }
        if !agents.is_empty() {
            return agents;
        }
    }
    agents
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

    let rr = parsed
        .rank
        .filter(|&r| r <= 100)
        .or(parsed.tier_progress)
        .or(parsed.score)
        .or(parsed.ranked_rating)
        .or(parsed.rr)
        .or_else(|| {
            extract_number_after(html, "\"tierProgress\":")
                .or_else(|| extract_number_after(html, "\"rankedRating\":"))
                .or_else(|| extract_number_after(html, "\"score\":"))
                .or_else(|| extract_number_after(html, "\"rr\":"))
        });

    let (wins, losses, win_rate) = {
        let w = parsed
            .wins
            .or_else(|| {
                extract_number_after(html, "\"wins\":")
                    .or_else(|| extract_number_after(html, "\"winCount\":"))
            })
            .unwrap_or(0);
        let l = parsed
            .losses
            .or_else(|| {
                extract_number_after(html, "\"losses\":")
                    .or_else(|| extract_number_after(html, "\"loseCount\":"))
            })
            .unwrap_or(0);
        let wr = if let Some(r) = parsed.win_rate {
            r
        } else if w + l > 0 {
            ((w as f64 / (w + l) as f64) * 100.0).round() as u32
        } else {
            0
        };
        (w, l, wr)
    };

    let formatted_win_rate = if wins + losses == 0 {
        "Unranked (0 games)".to_string()
    } else {
        format!("{}W - {}L ({}%)", wins, losses, win_rate)
    };

    let kd = parsed.kd.or_else(|| {
        extract_f32_after(html, "\"kd\":").or_else(|| extract_f32_after(html, "\"kda\":"))
    });
    let hs = parsed
        .headshot_rate
        .or(parsed.headshot_percentage)
        .or_else(|| {
            extract_number_after(html, "\"headshotPercentage\":")
                .or_else(|| extract_number_after(html, "\"headshotRate\":"))
        });
    let dpr = parsed.damage_per_round.or_else(|| {
        extract_number_after(html, "\"damagePerRound\":")
            .or_else(|| extract_number_after(html, "\"adr\":"))
    });

    let combat_stats = if kd.is_some() || hs.is_some() || dpr.is_some() {
        Some(CombatStats {
            kd,
            headshot_rate: hs,
            damage_per_round: dpr,
            win_rate: if win_rate > 0 { Some(win_rate) } else { None },
        })
    } else {
        None
    };

    let mut top_champions = extract_valorant_agents(html);
    if top_champions.is_empty() {
        if let Some(ref mid) = parsed.most_character_id {
            if let Some(agent_name) = valorant_agent_from_id(mid) {
                top_champions.push(ChampionStat {
                    name: agent_name.to_string(),
                    icon_url: valorant_agent_icon_url(agent_name),
                    wins: 0,
                    losses: 0,
                    win_rate: 0,
                    count: 0,
                });
            }
        }
    }

    Ok(SummonerProfile {
        summoner_name: final_name,
        tag_line: final_tag,
        region: final_region,
        tier,
        rank,
        league_points: 0,
        wins,
        losses,
        fetched_at: now(),
        source: "OP.GG Public Profile".to_string(),
        win_rate,
        formatted_rank,
        formatted_win_rate,
        opgg_url,
        game: Game::Valorant,
        level: parsed.level,
        puuid: parsed.puuid.filter(|s| !s.trim().is_empty()),
        avatar_url,
        rr,
        top_champions,
        combat_stats,
    })
}
