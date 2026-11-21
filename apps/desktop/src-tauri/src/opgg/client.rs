use crate::local_store::models::Game;
use super::league::{opgg_region_slug, parse_opgg_meta, urlencoding_simple};
use super::models::SummonerProfile;
use super::valorant::parse_opgg_valorant_html;

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
