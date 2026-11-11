use super::storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientThemeConfig {
    pub custom_asset_path: Option<String>,
    pub font_path: Option<String>,
    pub font_preset: Option<String>,
    pub transition_style: Option<String>,
    pub music_options: Option<MusicOptions>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MusicOptions {
    pub enabled: bool,
    pub volume: f32,
    pub custom_track_path: Option<String>,
    pub loop_playback: bool,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("client_theme_config.json"))
}

const MAX_CLIENT_ASSET_BYTES: usize = 25 * 1024 * 1024; // 25 MiB

fn validate_asset_type(asset_type: &str) -> Result<&'static str, String> {
    match asset_type.trim().to_ascii_lowercase().as_str() {
        "wallpaper" => Ok("wallpaper"),
        "video" => Ok("video"),
        "gif" => Ok("gif"),
        "music" | "audio" => Ok("music"),
        "font" => Ok("font"),
        "overlay" => Ok("overlay"),
        _ => Err("Invalid asset type. Permitted types: wallpaper, video, gif, music, font, overlay.".into()),
    }
}

#[tauri::command]
pub fn client_themes_save_asset(
    app: AppHandle,
    asset_type: String,
    data_base64: String,
) -> Result<String, String> {
    let safe_type = validate_asset_type(&asset_type)?;
    let bytes = STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;

    if bytes.len() > MAX_CLIENT_ASSET_BYTES {
        return Err("Asset file exceeds maximum 25 MiB size limit.".into());
    }

    let dir = storage::root(&app)?.join("client_theme_assets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{safe_type}_asset.dat");
    let file_path = dir.join(&filename);
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.custom_asset_path = Some(file_path.to_string_lossy().to_string());
    storage::write(&p, &cfg)?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn client_themes_save_asset_path(app: AppHandle, asset_path: String) -> Result<String, String> {
    let p_path = Path::new(&asset_path);
    if !p_path.exists() {
        return Err("Asset path does not exist on disk.".into());
    }

    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.custom_asset_path = Some(asset_path.clone());
    storage::write(&p, &cfg)?;
    Ok(asset_path)
}

#[tauri::command]
pub fn client_themes_pick_media(app: AppHandle) -> Result<String, String> {
    let p = config_path(&app)?;
    let cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.custom_asset_path
        .ok_or_else(|| "No client media asset selected.".into())
}

#[tauri::command]
pub fn client_themes_clear_asset(app: AppHandle) -> Result<bool, String> {
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.custom_asset_path = None;
    storage::write(&p, &cfg)?;
    Ok(true)
}

#[tauri::command]
pub fn client_themes_set_music_options(
    app: AppHandle,
    options: MusicOptions,
) -> Result<bool, String> {
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.music_options = Some(options);
    storage::write(&p, &cfg)?;
    Ok(true)
}

#[tauri::command]
pub fn client_themes_pick_font(app: AppHandle, font_path: String) -> Result<String, String> {
    let p_font = Path::new(&font_path);
    if !p_font.exists() {
        return Err("Font file does not exist.".into());
    }
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.font_path = Some(font_path.clone());
    storage::write(&p, &cfg)?;
    Ok(font_path)
}

#[tauri::command]
pub fn client_themes_set_font_preset(app: AppHandle, preset: String) -> Result<bool, String> {
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.font_preset = Some(preset);
    storage::write(&p, &cfg)?;
    Ok(true)
}

#[tauri::command]
pub fn client_themes_clear_font(app: AppHandle) -> Result<bool, String> {
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.font_path = None;
    cfg.font_preset = None;
    storage::write(&p, &cfg)?;
    Ok(true)
}

#[tauri::command]
pub fn client_themes_set_transition(app: AppHandle, transition: String) -> Result<bool, String> {
    let p = config_path(&app)?;
    let mut cfg = storage::read::<ClientThemeConfig>(&p, 64 * 1024)?.unwrap_or_default();
    cfg.transition_style = Some(transition);
    storage::write(&p, &cfg)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_theme_config_serialization() {
        let cfg = ClientThemeConfig {
            custom_asset_path: Some("/path/to/asset.png".into()),
            font_path: Some("/fonts/custom.woff2".into()),
            font_preset: Some("modern".into()),
            transition_style: Some("fade".into()),
            music_options: Some(MusicOptions {
                enabled: true,
                volume: 0.8,
                custom_track_path: Some("/music/track.ogg".into()),
                loop_playback: true,
            }),
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("customTrackPath"));
    }
}
