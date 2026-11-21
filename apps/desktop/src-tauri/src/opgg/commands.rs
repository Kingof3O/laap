use crate::local_store::models::Game;
use super::client::fetch_opgg_summoner;
use super::models::SummonerProfile;

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
