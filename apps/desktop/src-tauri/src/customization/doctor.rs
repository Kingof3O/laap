use super::{catalog_seed::Seed, library, presets, storage};
use serde::Serialize;
use std::{fs, path::Path};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    name: &'static str,
    healthy: bool,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    checks: Vec<Check>,
    media_bytes: u64,
    media_files: usize,
}

fn usage(path: &Path, depth: usize) -> Result<(u64, usize), String> {
    if !path.exists() {
        return Ok((0, 0));
    }
    if depth > 8 {
        return Err("Cache directory structure is invalid.".into());
    }
    let mut bytes = 0u64;
    let mut files = 0usize;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        let (size, count) = if kind.is_dir() {
            usage(&entry.path(), depth + 1)?
        } else {
            (entry.metadata().map_err(|e| e.to_string())?.len(), 1)
        };
        bytes = bytes.checked_add(size).ok_or("Cache size overflow.")?;
        files += count;
        if files > 50_000 {
            return Err("Cache contains too many files.".into());
        }
    }
    Ok((bytes, files))
}

#[tauri::command]
pub async fn doctor_collect(app: AppHandle) -> Result<Report, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut checks = Vec::new();
        match Seed::open(&app).and_then(|seed| seed.index()) {
            Ok(index) => checks.push(Check {
                name: "Included catalog",
                healthy: true,
                detail: format!("{} champions, patch {}", index.data.len(), index.version),
            }),
            Err(error) => checks.push(Check {
                name: "Included catalog",
                healthy: false,
                detail: error,
            }),
        }
        let library_app = app.clone();
        match library::mod_list(library_app) {
            Ok(rows) => checks.push(Check {
                name: "Package library",
                healthy: true,
                detail: format!("{} indexed packages", rows.len()),
            }),
            Err(error) => checks.push(Check {
                name: "Package library",
                healthy: false,
                detail: error,
            }),
        }
        let data = presets::customization_preset_export(app.clone());
        checks.push(Check {
            name: "Preset library",
            healthy: data.is_ok(),
            detail: data
                .map(|_| "Versioned preset data is readable.".into())
                .unwrap_or_else(|error| error),
        });
        let root = storage::root(&app)?;
        let (media_bytes, media_files) = usage(&root.join("catalog/media"), 0)?;
        let (healthy, detail) = super::game_adapter::doctor_check_summary(
            &root,
            &super::game_adapter::ProbeOptions::default(),
        );
        checks.push(Check {
            name: "Client integration",
            healthy,
            detail,
        });
        Ok(Report {
            checks,
            media_bytes,
            media_files,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn catalog_clear_media_cache(app: AppHandle) -> Result<(), String> {
    super::catalog_media::invalidate_pending_cache_writes();
    let path = storage::root(&app)?.join("catalog").join("media");
    tauri::async_runtime::spawn_blocking(move || match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}
