use super::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

#[allow(dead_code)]
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

fn validate_config(config: &ClientSurfacesConfig) -> Result<(), String> {
    let defaults = ClientSurfacesConfig::default();
    if config.version != 1 || config.surfaces.len() != DEFAULT_SURFACES_COUNT || config.adapter_name.len() > 100 {
        return Err("Unsupported client-surface configuration version or size".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for surface in &config.surfaces {
        if !defaults.surfaces.iter().any(|s| s.id == surface.id) || !seen.insert(&surface.id)
            || surface.name.contains("*/") || surface.name.chars().any(char::is_control) || surface.name.len() > 120 || surface.description.len() > 1000 || surface.category.len() > 80
            || !surface.opacity.is_finite() || !(0.0..=1.0).contains(&surface.opacity) || surface.blur_px > 40
            || surface.css_overrides.len() > 16384 {
            return Err(format!("Invalid surface definition: {}", surface.id));
        }
        let css = surface.css_overrides.to_ascii_lowercase();
        if ["@import", "url(", "expression(", "javascript:", "</", "\\"].iter().any(|v| css.contains(v)) {
            return Err(format!("Surface {}: external resources and executable CSS are not allowed; use the asset reference field", surface.id));
        }
        if let Some(asset) = &surface.asset_url {
            let url = reqwest::Url::parse(asset).map_err(|_| "Invalid asset URL")?;
            if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
                || asset.len() > 2048 || asset.chars().any(|c| c.is_control() || "'\"()<>*".contains(c)) {
                return Err("Asset references must be bounded HTTPS URLs without credentials or CSS delimiters".into());
            }
        }
    }
    Ok(())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("client_surfaces.json"))
}

pub fn load_config(app: &AppHandle) -> Result<ClientSurfacesConfig, String> {
    load_config_at(&storage::root(app)?)
}

pub(super) fn load_config_at(root: &std::path::Path) -> Result<ClientSurfacesConfig, String> {
    let p = root.join("client_surfaces.json");
    if let Some(cfg) = storage::read::<ClientSurfacesConfig>(&p, 1024 * 1024)? {
        validate_config(&cfg)?;
        Ok(cfg)
    } else {
        let def = ClientSurfacesConfig::default();
        storage::write(&p, &def)?;
        Ok(def)
    }
}

pub fn save_config(app: &AppHandle, config: &ClientSurfacesConfig) -> Result<(), String> {
    validate_config(config)?;
    let p = config_path(app)?;
    storage::write(&p, config)?;
    super::client_bridge::notify_state_changed();
    Ok(())
}

#[tauri::command]
pub fn client_surfaces_validate_config(config: ClientSurfacesConfig) -> Result<(), String> {
    validate_config(&config)
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

pub(super) fn render_surfaces_css(config: &ClientSurfacesConfig) -> String {
    if !config.global_enabled {
        return "/* LAAP Client Surfaces: Disabled globally */".into();
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
    css
}

#[tauri::command]
pub fn client_surfaces_export_snippet(app: AppHandle) -> Result<String, String> {
    let config = load_config(&app)?;
    Ok(render_surfaces_css(&config))
}

#[tauri::command]
pub fn client_surfaces_get_adapter_status(
    app: AppHandle,
) -> Result<ClientSurfaceAdapterStatus, String> {
    let config = load_config(&app)?;
    let active_count = config.surfaces.iter().filter(|s| s.enabled).count();
    let bridge = super::client_bridge::bridge_status_summary(&storage::root(&app)?);
    let (is_available, adapter_type, message) = if bridge.running && bridge.active_clients > 0 {
        (
            true,
            "loopback_websocket_pengu_companion".to_string(),
            format!(
                "LAAP Companion Bridge active on 127.0.0.1:{} ({} connected client(s)); syncing {active_count}/{} surfaces cleanly over authenticated loopback WebSocket.",
                bridge.port,
                bridge.active_clients,
                config.surfaces.len()
            ),
        )
    } else if bridge.running && bridge.plugin_installed {
        (
            true,
            "loopback_websocket_pengu_companion".to_string(),
            format!(
                "LAAP Companion Bridge running on 127.0.0.1:{} and Pengu companion plugin installed ({}). Waiting for League Client CEF connection to sync {active_count}/{} surfaces.",
                bridge.port,
                bridge.plugin_dir.unwrap_or_else(|| "laap-companion".into()),
                config.surfaces.len()
            ),
        )
    } else if bridge.running {
        (
            false,
            "loopback_bridge_awaiting_companion".to_string(),
            format!(
                "Loopback WebSocket bridge listening on 127.0.0.1:{}, but the companion Pengu plugin is not installed or verified yet ({active_count}/{} surfaces configured).",
                bridge.port,
                config.surfaces.len()
            ),
        )
    } else if bridge.plugin_installed {
        (
            false,
            "companion_plugin_bridge_stopped".to_string(),
            format!(
                "LAAP Companion Plugin installed at {}, but the loopback bridge is currently stopped ({active_count}/{} surfaces configured).",
                bridge.plugin_dir.unwrap_or_else(|| "laap-companion".into()),
                config.surfaces.len()
            ),
        )
    } else {
        (
            false,
            "configuration_and_snippet_exporter".to_string(),
            format!(
                "16 customizable League client surfaces configured in LAAP ({active_count}/{} active). Enable the In-Client Companion Bridge & install the decoupled Pengu plugin below to sync live into League Client CEF.",
                config.surfaces.len()
            ),
        )
    };
    Ok(ClientSurfaceAdapterStatus {
        is_available,
        adapter_type,
        active_surfaces_count: active_count,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_validation_rejects_invalid_bounds_ids_and_external_css() {
        let mut cfg = ClientSurfacesConfig::default();
        assert!(validate_config(&cfg).is_ok());
        cfg.surfaces[0].opacity = f32::NAN;
        assert!(validate_config(&cfg).is_err());
        cfg.surfaces[0].opacity = 1.0;
        cfg.surfaces[0].css_overrides = "@import 'https://invalid.test/x'".into();
        assert!(validate_config(&cfg).is_err());
        cfg.surfaces[0].css_overrides.clear();
        cfg.surfaces[0].id = "unknown".into();
        assert!(validate_config(&cfg).is_err());
    }

    #[test]
    fn test_default_16_surfaces() {
        let def = ClientSurfacesConfig::default();
        assert_eq!(def.surfaces.len(), DEFAULT_SURFACES_COUNT);
        assert_eq!(def.surfaces[0].id, "champ_select");
        assert_eq!(def.surfaces[15].id, "party_invite_modal");
    }
}
