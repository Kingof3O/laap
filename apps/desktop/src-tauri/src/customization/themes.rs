use super::storage;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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

fn validate(theme: &ThemePreview) -> Result<(), String> {
    fn color(value: &str) -> bool {
        value.len() == 7
            && value.starts_with('#')
            && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    }
    if theme.schema_version != 1
        || theme.name.trim().is_empty()
        || theme.name.chars().count() > 100
        || theme.name.chars().any(char::is_control)
        || [&theme.canvas, &theme.panel, &theme.accent]
            .iter()
            .any(|value| !color(value))
    {
        return Err("Theme requires a name and three six-digit hex colors.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn theme_preview_load(app: AppHandle) -> Result<Option<ThemePreview>, String> {
    let theme = storage::read(&storage::root(&app)?.join("theme-preview.json"), 4096)?;
    if let Some(theme) = &theme {
        validate(theme)?;
    }
    Ok(theme)
}

#[tauri::command]
pub fn theme_preview_save(app: AppHandle, theme: ThemePreview) -> Result<(), String> {
    validate(&theme)?;
    storage::write(&storage::root(&app)?.join("theme-preview.json"), &theme)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn theme_previews_reject_css_payloads() {
        let mut theme = ThemePreview {
            schema_version: 1,
            name: "Test".into(),
            canvas: "#171320".into(),
            panel: "#211730".into(),
            accent: "#D6C6FF".into(),
            font: Font::Manrope,
        };
        assert!(validate(&theme).is_ok());
        theme.accent = "url(https://example.test)".into();
        assert!(validate(&theme).is_err());
    }
}
