use super::storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::AppHandle;

static LOCK: Mutex<()> = Mutex::new(());
const MAX_MEDIA_BYTES: usize = 32 * 1024 * 1024; // 32MB for videos/gifs/wallpapers

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub canvas: String,
    pub panel: String,
    pub surface: String,
    pub accent: String,
    pub accent_hover: String,
    pub text_primary: String,
    pub text_secondary: String,
    pub border: String,
    pub font_family: String,
    pub opacity: f32,
    pub background_media_path: Option<String>,
    pub background_media_type: Option<String>, // "image", "video", "gif"
    pub animation_speed: String,               // "normal", "fast", "slow", "off"
    pub reduced_motion: bool,
    pub performance_mode: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeStore {
    active_theme_id: String,
    custom_themes: Vec<ThemeConfig>,
}

pub fn default_velvet_amethyst() -> ThemeConfig {
    ThemeConfig {
        id: "velvet-amethyst".into(),
        name: "Velvet Amethyst (Default)".into(),
        is_builtin: true,
        canvas: "#120d1a".into(),
        panel: "#1d142b".into(),
        surface: "#271b3a".into(),
        accent: "#b388ff".into(),
        accent_hover: "#c8a5ff".into(),
        text_primary: "#f3e8ff".into(),
        text_secondary: "#a78bfa".into(),
        border: "#3d2a58".into(),
        font_family: "Manrope".into(),
        opacity: 0.95,
        background_media_path: None,
        background_media_type: None,
        animation_speed: "normal".into(),
        reduced_motion: false,
        performance_mode: false,
    }
}

pub fn builtin_themes() -> Vec<ThemeConfig> {
    vec![
        default_velvet_amethyst(),
        ThemeConfig {
            id: "hextech-arcane".into(),
            name: "Hextech Arcane".into(),
            is_builtin: true,
            canvas: "#09141f".into(),
            panel: "#0e2233".into(),
            surface: "#143147".into(),
            accent: "#00f5d4".into(),
            accent_hover: "#33ffd9".into(),
            text_primary: "#e6f9ff".into(),
            text_secondary: "#5ce1e6".into(),
            border: "#1d4563".into(),
            font_family: "Sora".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "obsidian-void".into(),
            name: "Obsidian Void".into(),
            is_builtin: true,
            canvas: "#0b0914".into(),
            panel: "#141024".into(),
            surface: "#1d1833".into(),
            accent: "#d946ef".into(),
            accent_hover: "#e879f9".into(),
            text_primary: "#fae8ff".into(),
            text_secondary: "#c084fc".into(),
            border: "#2e2552".into(),
            font_family: "Manrope".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "rose-quartz".into(),
            name: "Rose Quartz".into(),
            is_builtin: true,
            canvas: "#1a0f16".into(),
            panel: "#2b1824".into(),
            surface: "#3a2031".into(),
            accent: "#fb7185".into(),
            accent_hover: "#fda4af".into(),
            text_primary: "#ffe4e6".into(),
            text_secondary: "#f43f5e".into(),
            border: "#542c46".into(),
            font_family: "Sora".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "arcade-neon".into(),
            name: "Arcade Neon".into(),
            is_builtin: true,
            canvas: "#0f0d1b".into(),
            panel: "#1b1730".into(),
            surface: "#2a244a".into(),
            accent: "#22c55e".into(),
            accent_hover: "#4ade80".into(),
            text_primary: "#f0fdf4".into(),
            text_secondary: "#86efac".into(),
            border: "#3b3366".into(),
            font_family: "Manrope".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "fast".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "bilgewater-gold".into(),
            name: "Bilgewater Gold".into(),
            is_builtin: true,
            canvas: "#17120a".into(),
            panel: "#271e11".into(),
            surface: "#392c19".into(),
            accent: "#f59e0b".into(),
            accent_hover: "#fbbf24".into(),
            text_primary: "#fef3c7".into(),
            text_secondary: "#d97706".into(),
            border: "#523f24".into(),
            font_family: "Manrope".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "star-guardian".into(),
            name: "Star Guardian".into(),
            is_builtin: true,
            canvas: "#180c1a".into(),
            panel: "#29152d".into(),
            surface: "#3a1e40".into(),
            accent: "#f43f5e".into(),
            accent_hover: "#fb7185".into(),
            text_primary: "#fff1f2".into(),
            text_secondary: "#fda4af".into(),
            border: "#562a5f".into(),
            font_family: "Sora".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        },
        ThemeConfig {
            id: "cyberpunk-crimson".into(),
            name: "PROJECT Crimson".into(),
            is_builtin: true,
            canvas: "#170b0e".into(),
            panel: "#281318".into(),
            surface: "#381a22".into(),
            accent: "#ef4444".into(),
            accent_hover: "#f87171".into(),
            text_primary: "#fef2f2".into(),
            text_secondary: "#dc2626".into(),
            border: "#542531".into(),
            font_family: "Sora".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "fast".into(),
            reduced_motion: false,
            performance_mode: false,
        },
    ]
}

fn validate_hex_color(val: &str) -> bool {
    (val.len() == 7 || val.len() == 9)
        && val.starts_with('#')
        && val.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

fn validate_theme(theme: &ThemeConfig) -> Result<(), String> {
    if theme.name.trim().is_empty() || theme.name.chars().count() > 80 {
        return Err("Theme name must be between 1 and 80 characters.".into());
    }
    for (label, col) in [
        ("canvas", &theme.canvas),
        ("panel", &theme.panel),
        ("surface", &theme.surface),
        ("accent", &theme.accent),
        ("accentHover", &theme.accent_hover),
        ("textPrimary", &theme.text_primary),
        ("textSecondary", &theme.text_secondary),
        ("border", &theme.border),
    ] {
        if !validate_hex_color(col) {
            return Err(format!("Invalid hex color format for {label}: {col}"));
        }
    }
    if !["Manrope", "Sora", "Segoe UI"].contains(&theme.font_family.as_str())
        || !["normal", "fast", "slow", "off"].contains(&theme.animation_speed.as_str())
        || theme.id.len() > 100
        || theme.name.chars().any(char::is_control)
        || theme
            .background_media_type
            .as_ref()
            .is_some_and(|v| !["image", "gif", "video"].contains(&v.as_str()))
    {
        return Err("Invalid theme font, motion, media type or identity.".into());
    }
    if !(0.1..=1.0).contains(&theme.opacity) {
        return Err("Opacity must be between 0.1 and 1.0.".into());
    }
    Ok(())
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("themes_store.json"))
}

fn read_store(app: &AppHandle) -> Result<ThemeStore, String> {
    let p = store_path(app)?;
    let store = storage::read::<ThemeStore>(&p, 256 * 1024)?.unwrap_or_else(|| ThemeStore {
        active_theme_id: "velvet-amethyst".into(),
        custom_themes: vec![],
    });
    if store.custom_themes.len() > 50 {
        return Err("Theme store exceeds quota".into());
    }
    for theme in &store.custom_themes {
        validate_theme(theme)?;
    }
    Ok(store)
}

fn write_store(app: &AppHandle, store: &ThemeStore) -> Result<(), String> {
    let p = store_path(app)?;
    storage::write(&p, store)
}

#[tauri::command]
pub fn theme_list(app: AppHandle) -> Result<Vec<ThemeConfig>, String> {
    let store = read_store(&app)?;
    let mut all = builtin_themes();
    all.extend(store.custom_themes);
    Ok(all)
}

#[tauri::command]
pub fn theme_get_active(app: AppHandle) -> Result<ThemeConfig, String> {
    let store = read_store(&app)?;
    let all = theme_list(app)?;
    all.into_iter()
        .find(|t| t.id == store.active_theme_id)
        .or_else(|| Some(default_velvet_amethyst()))
        .ok_or_else(|| "Failed to resolve active theme.".into())
}

#[tauri::command]
pub fn theme_set_active(app: AppHandle, id: String) -> Result<ThemeConfig, String> {
    let _guard = LOCK.lock().map_err(|_| "Theme lock unavailable.")?;
    let mut store = read_store(&app)?;
    let all = theme_list(app.clone())?;
    let found = all
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Theme '{id}' not found."))?;

    store.active_theme_id = id;
    write_store(&app, &store)?;
    Ok(found)
}

#[tauri::command]
pub fn theme_save_custom(app: AppHandle, mut theme: ThemeConfig) -> Result<ThemeConfig, String> {
    let _guard = LOCK.lock().map_err(|_| "Theme lock unavailable.")?;
    theme.is_builtin = false;
    validate_theme(&theme)?;

    if let Some(path) = &theme.background_media_path {
        validate_media_path(&app, path)?;
    }
    let mut store = read_store(&app)?;
    if theme.id.is_empty()
        || theme.id.starts_with("builtin-")
        || builtin_themes().iter().any(|t| t.id == theme.id)
    {
        let mut random = [0u8; 8];
        getrandom::fill(&mut random).map_err(|e| e.to_string())?;
        theme.id = format!("custom-{:016x}", u64::from_be_bytes(random));
    }

    if let Some(pos) = store.custom_themes.iter().position(|t| t.id == theme.id) {
        store.custom_themes[pos] = theme.clone();
    } else {
        if store.custom_themes.len() >= 50 {
            return Err("Maximum number of custom themes reached (50).".into());
        }
        store.custom_themes.push(theme.clone());
    }

    write_store(&app, &store)?;
    Ok(theme)
}

#[tauri::command]
pub fn theme_delete_custom(app: AppHandle, id: String) -> Result<bool, String> {
    let _guard = LOCK.lock().map_err(|_| "Theme lock unavailable.")?;
    let mut store = read_store(&app)?;
    let init_len = store.custom_themes.len();
    store.custom_themes.retain(|t| t.id != id);

    if store.custom_themes.len() < init_len {
        if store.active_theme_id == id {
            store.active_theme_id = "velvet-amethyst".into();
        }
        write_store(&app, &store)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn theme_reset_default(app: AppHandle) -> Result<ThemeConfig, String> {
    theme_set_active(app, "velvet-amethyst".into())
}

#[tauri::command]
pub fn theme_save_media(
    app: AppHandle,
    name: String,
    data_base64: String,
) -> Result<String, String> {
    let clean_name = name.trim().replace('\\', "/");
    let file_name = std::path::Path::new(&clean_name)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid media file name.".to_string())?;

    if file_name.is_empty()
        || file_name.contains("..")
        || file_name.contains('/')
        || file_name.contains('\\')
    {
        return Err("Media file name must not contain path traversal characters.".into());
    }

    let ext = file_name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();

    if !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "mp4" | "webm"
    ) {
        return Err(
            "Only image (PNG, JPG, WebP), GIF, and video (MP4, WebM) media are accepted.".into(),
        );
    }

    if data_base64.len() > MAX_MEDIA_BYTES.div_ceil(3) * 4 {
        return Err("Media exceeds limit".into());
    }
    let bytes = STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;

    if bytes.len() > MAX_MEDIA_BYTES {
        return Err("Media file exceeds 32 MiB size limit.".into());
    }

    validate_media(&bytes, &ext)?;
    use sha2::{Digest, Sha256};
    let media_dir = storage::root(&app)?.join("theme_media");
    super::sandbox::check_chain(&media_dir, true)?;
    let used = std::fs::read_dir(&media_dir)
        .map_err(|e| e.to_string())?
        .try_fold(0u64, |n, entry| {
            let entry = entry.map_err(|e| e.to_string())?;
            let m = std::fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            Ok::<u64, String>(n.saturating_add(m.len()))
        })?;
    if used + bytes.len() as u64 > 256 * 1024 * 1024 {
        return Err("Theme media quota exceeded.".into());
    }
    let file_path = media_dir.join(format!("{:x}.{ext}", Sha256::digest(&bytes)));
    storage::write_bytes(&file_path, &bytes)?;
    Ok(file_path.to_string_lossy().to_string())
}
fn validate_media(bytes: &[u8], ext: &str) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > MAX_MEDIA_BYTES {
        return Err("Invalid media size".into());
    }
    if matches!(ext, "png" | "jpg" | "jpeg" | "webp") {
        let format = image::guess_format(bytes).map_err(|_| "Invalid image signature")?;
        let expected = match ext {
            "png" => image::ImageFormat::Png,
            "jpg" | "jpeg" => image::ImageFormat::Jpeg,
            _ => image::ImageFormat::WebP,
        };
        if format != expected {
            return Err("Image format mismatch".into());
        }
        let (w, h) = image::ImageReader::with_format(std::io::Cursor::new(bytes), format)
            .into_dimensions()
            .map_err(|_| "Invalid image")?;
        if w == 0 || h == 0 || w > 8192 || h > 8192 || w as u64 * h as u64 > 32_000_000 {
            return Err("Image dimensions exceed limit".into());
        }
    } else if ext == "gif" {
        if bytes.len() < 14 || !(bytes.starts_with(b"GIF89a") || bytes.starts_with(b"GIF87a")) {
            return Err("Invalid GIF signature".into());
        }
        let w = u16::from_le_bytes([bytes[6], bytes[7]]) as u64;
        let h = u16::from_le_bytes([bytes[8], bytes[9]]) as u64;
        if w == 0 || h == 0 || w > 4096 || h > 4096 || w * h > 8_000_000 {
            return Err("GIF dimensions exceed limit".into());
        }
    } else if ext == "mp4" {
        if bytes.len() < 16 || &bytes[4..8] != b"ftyp" {
            return Err("Invalid MP4 container".into());
        }
    } else if ext == "webm" {
        if !bytes.starts_with(b"\x1a\x45\xdf\xa3") {
            return Err("Invalid WebM container".into());
        }
    } else {
        return Err("Unsupported media format".into());
    }
    Ok(())
}
fn validate_media_path(app: &AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    let root = storage::root(app)?.join("theme_media");
    let p = std::path::Path::new(path);
    super::sandbox::check_chain(p, false)?;
    if p.parent() != Some(root.as_path()) {
        return Err("Only LAAP-owned theme media may be read.".into());
    }
    Ok(p.into())
}
#[tauri::command]
pub fn theme_media_read(app: AppHandle, path: String) -> Result<String, String> {
    let p = validate_media_path(&app, &path)?;
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .ok_or("Missing media format")?;
    let bytes = super::sandbox::read_blob(&p, MAX_MEDIA_BYTES as u64)?;
    validate_media(&bytes, ext)?;
    let mime = match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => return Err("Unsupported media".into()),
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

// Backward-compatible wrappers for legacy theme_preview_load and theme_preview_save
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemePreview {
    schema_version: u32,
    name: String,
    canvas: String,
    panel: String,
    accent: String,
    font: Font,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Font {
    Manrope,
    Sora,
}

#[tauri::command]
pub fn theme_preview_load(app: AppHandle) -> Result<Option<ThemePreview>, String> {
    let active = theme_get_active(app)?;
    Ok(Some(ThemePreview {
        schema_version: 1,
        name: active.name,
        canvas: active.canvas,
        panel: active.panel,
        accent: active.accent,
        font: if active.font_family == "Sora" {
            Font::Sora
        } else {
            Font::Manrope
        },
    }))
}

#[tauri::command]
pub fn theme_preview_save(app: AppHandle, preview: ThemePreview) -> Result<(), String> {
    if !validate_hex_color(&preview.canvas)
        || !validate_hex_color(&preview.panel)
        || !validate_hex_color(&preview.accent)
    {
        return Err("Theme requires a name and three six-digit hex colors.".into());
    }
    let config = ThemeConfig {
        id: "preview-theme".into(),
        name: preview.name,
        is_builtin: false,
        canvas: preview.canvas.clone(),
        panel: preview.panel.clone(),
        surface: preview.panel,
        accent: preview.accent.clone(),
        accent_hover: preview.accent,
        text_primary: "#f3e8ff".into(),
        text_secondary: "#a78bfa".into(),
        border: "#3d2a58".into(),
        font_family: match preview.font {
            Font::Sora => "Sora".into(),
            Font::Manrope => "Manrope".into(),
        },
        opacity: 0.95,
        background_media_path: None,
        background_media_type: None,
        animation_speed: "normal".into(),
        reduced_motion: false,
        performance_mode: false,
    };
    theme_save_custom(app.clone(), config)?;
    theme_set_active(app, "preview-theme".into())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_previews_reject_css_payloads() {
        let mut theme = ThemeConfig {
            id: "test".into(),
            name: "Test Theme".into(),
            is_builtin: false,
            canvas: "#171320".into(),
            panel: "#211730".into(),
            surface: "#2c1e40".into(),
            accent: "#D6C6FF".into(),
            accent_hover: "#E0D5FF".into(),
            text_primary: "#FFFFFF".into(),
            text_secondary: "#CCCCCC".into(),
            border: "#333333".into(),
            font_family: "Manrope".into(),
            opacity: 0.95,
            background_media_path: None,
            background_media_type: None,
            animation_speed: "normal".into(),
            reduced_motion: false,
            performance_mode: false,
        };
        assert!(validate_theme(&theme).is_ok());
        theme.accent = "url(https://example.test)".into();
        assert!(validate_theme(&theme).is_err());
    }

    #[test]
    fn test_builtin_themes_count_and_default() {
        let list = builtin_themes();
        assert!(list.len() >= 8);
        assert_eq!(list[0].id, "velvet-amethyst");
    }
    #[test]
    fn media_rejects_disguised_payloads_and_fonts_are_allowlisted() {
        for ext in ["png", "jpg", "webp", "gif", "mp4", "webm"] {
            assert!(validate_media(b"MZnot-media", ext).is_err());
        }
        let mut t = default_velvet_amethyst();
        t.font_family = "url(https://untrusted.invalid/font)".into();
        assert!(validate_theme(&t).is_err());
        t = default_velvet_amethyst();
        t.animation_speed = "unbounded".into();
        assert!(validate_theme(&t).is_err());
    }
}
