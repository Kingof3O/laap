use super::{library, presets, storage};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

pub(super) fn save_dialog(
    app: &AppHandle,
    bytes: &[u8],
    name: &str,
    extension: &str,
) -> Result<bool, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Export LAAP content")
        .set_file_name(name)
        .add_filter("LAAP export", &[extension])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(false);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    if !path
        .extension()
        .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case(extension))
    {
        return Err(format!("Choose a .{extension} filename."));
    }
    storage::write_bytes(&path, bytes)?;
    Ok(true)
}

#[tauri::command]
pub async fn customization_preset_export_file(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let json = presets::customization_preset_export(app.clone())?;
        save_dialog(&app, json.as_bytes(), "laap-presets.json", "json")
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageExportKind {
    Zip,
    Manifest,
}

#[tauri::command]
pub async fn creator_save_package(
    app: AppHandle,
    archive: String,
    manifest: library::Manifest,
    kind: PackageExportKind,
) -> Result<bool, String> {
    if archive.len() > 16 * 1024 * 1024 {
        return Err("Package exceeds its export size limit.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD
            .decode(archive)
            .map_err(|_| "Invalid export archive.")?;
        library::validate_archive(&bytes, &manifest)?;
        match kind {
            PackageExportKind::Zip => save_dialog(&app, &bytes, "laap-original-art.zip", "zip"),
            PackageExportKind::Manifest => save_dialog(
                &app,
                &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
                "laap-original-art.json",
                "json",
            ),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
