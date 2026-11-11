use super::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

pub const DEFAULT_SURFACES_COUNT: usize = 16;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub enabled: bool,
    pub css_overrides: String,
    pub asset_url: Option<String>,
    pub opacity: f32,
    pub blur_px: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientSurfacesConfig {
    pub version: u32,
    pub global_enabled: bool,
    pub adapter_name: String,
    pub surfaces: Vec<SurfaceConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSurfaceAdapterStatus {
    pub is_available: bool,
    pub adapter_type: String,
    pub active_surfaces_count: usize,
    pub message: String,
}

impl Default for ClientSurfacesConfig {
    fn default() -> Self {
        Self {
            version: 1,
            global_enabled: true,
            adapter_name: "laap-native-surface-engine".into(),
            surfaces: vec![
                SurfaceConfig {
                    id: "champ_select".into(),
                    name: "Champion Selection".into(),
                    description: "Champion selection layout, backdrop, and timer styling".into(),
                    category: "Matchmaking".into(),
                    enabled: true,
                    css_overrides: ".champ-select-bg { backdrop-filter: blur(8px); }".into(),
                    asset_url: None,
                    opacity: 0.95,
                    blur_px: 8,
                },
                SurfaceConfig {
                    id: "lobby_hub".into(),
                    name: "Party & Matchmaking Lobby".into(),
                    description: "Party member cards, role selectors, and queue controls".into(),
                    category: "Lobby".into(),
                    enabled: true,
                    css_overrides: ".lobby-card { border-radius: 12px; }".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "profile_banner".into(),
                    name: "Summoner Profile & Banner".into(),
                    description: "Profile banner backdrop, crests, and honor badges".into(),
                    category: "Identity".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "rune_pages".into(),
                    name: "Runes & Perks Editor".into(),
                    description: "Rune path tree backgrounds and node hover accents".into(),
                    category: "Gameplay".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 0.9,
                    blur_px: 4,
                },
                SurfaceConfig {
                    id: "loading_screen".into(),
                    name: "Game Loading Splash".into(),
                    description: "Player cards, loading border frames, and ping indicators".into(),
                    category: "Gameplay".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "end_of_game".into(),
                    name: "Post-Game Honor & Stats".into(),
                    description: "Post-match graphs, honor podium, and damage matrix".into(),
                    category: "Matchmaking".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "loot_crafting".into(),
                    name: "Hextech Loot & Crafting Hub".into(),
                    description: "Chest animations, essence counts, and shard forging".into(),
                    category: "Store & Collection".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 0.95,
                    blur_px: 2,
                },
                SurfaceConfig {
                    id: "store_accent".into(),
                    name: "Store & Catalog Showcase".into(),
                    description: "Item preview tiles, bundle showcases, and purchase modals".into(),
                    category: "Store & Collection".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "collection_skins".into(),
                    name: "Champion & Skin Gallery".into(),
                    description: "Chroma carousels, skin splash viewports, and lore cards".into(),
                    category: "Store & Collection".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "social_sidebar".into(),
                    name: "Friends & Social Sidebar".into(),
                    description: "Presence list, direct message popups, and club tags".into(),
                    category: "Social".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 0.92,
                    blur_px: 6,
                },
                SurfaceConfig {
                    id: "navigation_bar".into(),
                    name: "Top Navigation Bar".into(),
                    description: "Primary tab bar, Riot Points, and Blue Essence balance chips".into(),
                    category: "Navigation".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "game_settings".into(),
                    name: "Client Preferences Dialog".into(),
                    description: "Audio volume sliders, keybindings list, and window options".into(),
                    category: "Settings".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 0.96,
                    blur_px: 10,
                },
                SurfaceConfig {
                    id: "tft_hub".into(),
                    name: "Teamfight Tactics Hub".into(),
                    description: "TFT battlepass tracks, arena tactician podium, and rank tiers".into(),
                    category: "Game Modes".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "clash_hub".into(),
                    name: "Clash Tournament Hub".into(),
                    description: "Bracket tree, trophy showcase, and team roster lineup".into(),
                    category: "Game Modes".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "custom_games".into(),
                    name: "Custom Game Lobby".into(),
                    description: "Tournament code generator, spectator slots, and password prompt".into(),
                    category: "Game Modes".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 1.0,
                    blur_px: 0,
                },
                SurfaceConfig {
                    id: "party_invite_modal".into(),
                    name: "Party Invite & Action Notifications".into(),
                    description: "Match ready popups, invite notifications, and modal prompts".into(),
                    category: "Social".into(),
                    enabled: true,
                    css_overrides: "".into(),
                    asset_url: None,
                    opacity: 0.95,
                    blur_px: 4,
                },
            ],
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("client_surfaces.json"))
}

pub fn load_config(app: &AppHandle) -> Result<ClientSurfacesConfig, String> {
    let p = config_path(app)?;
    if let Some(cfg) = storage::read::<ClientSurfacesConfig>(&p, 1024 * 1024)? {
        Ok(cfg)
    } else {
        let def = ClientSurfacesConfig::default();
        let _ = storage::write(&p, &def);
        Ok(def)
    }
}

pub fn save_config(app: &AppHandle, config: &ClientSurfacesConfig) -> Result<(), String> {
    let p = config_path(app)?;
    storage::write(&p, config)
}

#[tauri::command]
pub fn client_surfaces_get_config(app: AppHandle) -> Result<ClientSurfacesConfig, String> {
    load_config(&app)
}

#[tauri::command]
pub fn client_surfaces_save_config(
    app: AppHandle,
    config: ClientSurfacesConfig,
) -> Result<(), String> {
    save_config(&app, &config)
}

#[tauri::command]
pub fn client_surfaces_reset_defaults(app: AppHandle) -> Result<ClientSurfacesConfig, String> {
    let def = ClientSurfacesConfig::default();
    save_config(&app, &def)?;
    Ok(def)
}

#[tauri::command]
pub fn client_surfaces_export_snippet(app: AppHandle) -> Result<String, String> {
    let config = load_config(&app)?;
    if !config.global_enabled {
        return Ok("/* LAAP Client Surfaces: Disabled globally */".into());
    }

    let mut css = String::from("/* LAAP 16 Customizable League Client Surfaces CSS Snippet */\n");
    for s in &config.surfaces {
        if s.enabled {
            css.push_str(&format!("\n/* Surface: {} ({}) */\n", s.name, s.id));
            if !s.css_overrides.trim().is_empty() {
                css.push_str(&s.css_overrides);
                css.push('\n');
            }
            if let Some(ref asset) = s.asset_url {
                css.push_str(&format!(
                    "/* Asset background: url('{}') opacity({}) blur({}px) */\n",
                    asset, s.opacity, s.blur_px
                ));
            }
        }
    }
    Ok(css)
}

#[tauri::command]
pub fn client_surfaces_get_adapter_status(
    app: AppHandle,
) -> Result<ClientSurfaceAdapterStatus, String> {
    let config = load_config(&app)?;
    let active_count = config.surfaces.iter().filter(|s| s.enabled).count();
    Ok(ClientSurfaceAdapterStatus {
        is_available: true,
        adapter_type: "native_laap_and_lcu_overlay".into(),
        active_surfaces_count: active_count,
        message: format!(
            "Configured {active_count}/{} customizable surfaces. Applied in LAAP and exportable to client modding overlays.",
            config.surfaces.len()
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_16_surfaces() {
        let def = ClientSurfacesConfig::default();
        assert_eq!(def.surfaces.len(), DEFAULT_SURFACES_COUNT);
        assert_eq!(def.surfaces[0].id, "champ_select");
        assert_eq!(def.surfaces[15].id, "party_invite_modal");
    }
}
