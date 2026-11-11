use super::storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read, Write},
    path::Path,
    sync::Mutex,
};
use tauri::AppHandle;
use zip::ZipArchive;

const MAX_ARCHIVE: usize = 32 * 1024 * 1024;
const MAX_ENTRY: u64 = 64 * 1024 * 1024;
const MAX_EXPANDED: u64 = 128 * 1024 * 1024;
const MAX_INDEX: u64 = 12 * 1024 * 1024;
const MAX_FILES: usize = 512;
const MAX_LIBRARY: u64 = 512 * 1024 * 1024;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u8,
    pub mod_id: String,
    pub version: String,
    pub display_name: String,
    pub author: String,
    pub license: String,
    pub right_to_distribute: bool,
    pub contains_paid_riot_content: bool,
    pub sha256: String,
    pub supported_game_builds: Vec<String>,
    #[serde(default)]
    pub champion_ids: Vec<u32>,
    pub files: Vec<Entry>,
    pub attribution_url: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub manifest: Manifest,
    pub archive_bytes: u64,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub priority: u32,
    #[serde(default)]
    pub format: String,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModConflict {
    pub relative_path: String,
    pub conflicting_mods: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StagingReport {
    pub staged_mods_count: usize,
    pub staged_files_count: usize,
    pub staging_directory: String,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub(super) fn safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 240
        && name.split('/').all(|part| {
            let stem = part
                .split('.')
                .next()
                .unwrap_or_default()
                .to_ascii_uppercase();
            !part.is_empty()
                && part.len() <= 90
                && !part.starts_with('.')
                && !part.ends_with('.')
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                && !["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
                && !(stem.len() == 4
                    && (stem.starts_with("COM") || stem.starts_with("LPT"))
                    && stem.as_bytes()[3].is_ascii_digit())
        })
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    fn text(value: &str, max: usize) -> bool {
        !value.trim().is_empty()
            && value.chars().count() <= max
            && !value.chars().any(char::is_control)
    }
    if manifest.schema_version != 1
        || manifest.contains_paid_riot_content
        || !is_hash(&manifest.sha256)
        || !text(&manifest.display_name, 160)
        || !text(&manifest.author, 120)
        || !text(&manifest.license, 80)
        || !text(&manifest.mod_id, 100)
        || !manifest
            .mod_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        || !text(&manifest.version, 40)
        || manifest.files.is_empty()
        || manifest.files.len() > MAX_FILES
        || manifest.supported_game_builds.len() > 120
        || manifest.supported_game_builds.iter().any(|v| !text(v, 50))
        || manifest.champion_ids.len() > 500
        || manifest.champion_ids.contains(&0)
        || manifest.notes.as_ref().is_some_and(|v| v.len() > 2000)
        || manifest
            .attribution_url
            .as_ref()
            .is_some_and(|v| v.len() > 2048 || !v.starts_with("https://"))
    {
        return Err("Invalid manifest or unsupported rights declaration.".into());
    }
    Ok(())
}

pub(super) fn validate_archive(bytes: &[u8], manifest: &Manifest) -> Result<(), String> {
    validate_manifest(manifest)?;
    if bytes.len() > MAX_ARCHIVE
        || !bytes.starts_with(b"PK\x03\x04")
        || digest(bytes) != manifest.sha256
    {
        return Err("Archive size, ZIP signature, or SHA-256 does not match the manifest.".into());
    }
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    if zip.len() != manifest.files.len() {
        return Err("Archive entries must exactly match the manifest.".into());
    }
    let mut seen = BTreeSet::new();
    let mut expanded = 0u64;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = std::str::from_utf8(file.name_raw()).map_err(|_| "Invalid archive path.")?;
        if !safe_name(name)
            || !seen.insert(name.to_ascii_lowercase())
            || file.enclosed_name().is_none()
            || !file.is_file()
            || file.is_symlink()
            || file.encrypted()
            || file
                .unix_mode()
                .is_some_and(|mode| !matches!(mode & 0o170000, 0 | 0o100000))
            || file.size() > MAX_ENTRY
            || file.size() > file.compressed_size().saturating_mul(100)
        {
            return Err(format!("Unsafe ZIP entry at index {i}."));
        }
        let entry = manifest
            .files
            .iter()
            .find(|entry| entry.relative_path == name)
            .ok_or("ZIP entry missing from manifest.")?;
        if !is_hash(&entry.sha256) || file.size() != entry.size_bytes {
            return Err("Entry size or digest declaration is invalid.".into());
        }
        expanded = expanded
            .checked_add(file.size())
            .ok_or("ZIP expansion overflow.")?;
        if expanded > MAX_EXPANDED {
            return Err("ZIP expands beyond the library limit.".into());
        }

        let ext = name
            .rsplit_once('.')
            .map(|(_, ext)| ext.to_ascii_lowercase())
            .unwrap_or_default();

        if super::fantome::is_executable_extension(&ext) {
            return Err("Only PNG, JPEG, and WebP assets are accepted by this library, and executables are forbidden.".into());
        }

        let is_image = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp");
        let is_game_asset = matches!(
            ext.as_str(),
            "dds" | "skn" | "skl" | "sco" | "scb" | "anm" | "mapgeo" | "bin" | "wad" | "client" | "json" | "txt" | "ogg" | "wav" | "bnk" | "wpk"
        );

        if !is_image && !is_game_asset {
            return Err("Only PNG, JPEG, and WebP image formats or validated game asset files are accepted by this library.".into());
        }

        let mut data = Vec::new();
        (&mut file)
            .take(entry.size_bytes + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() as u64 != entry.size_bytes || digest(&data) != entry.sha256 {
            return Err("An entry did not match its declared digest or size.".into());
        }

        if is_image {
            let format = match ext.as_str() {
                "png" => image::ImageFormat::Png,
                "jpg" | "jpeg" => image::ImageFormat::Jpeg,
                "webp" => image::ImageFormat::WebP,
                _ => unreachable!(),
            };
            if image::guess_format(&data).ok() != Some(format) {
                return Err("Image header does not match expected format.".into());
            }
            let reader = image::ImageReader::with_format(Cursor::new(data), format);
            let (width, height) = reader
                .into_dimensions()
                .map_err(|_| "Invalid image header.")?;
            if width == 0
                || height == 0
                || width > 8192
                || height > 8192
                || u64::from(width) * u64::from(height) > 32_000_000
            {
                return Err("Image dimensions exceed the library limit.".into());
            }
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatorRequest {
    mod_id: String,
    version: String,
    display_name: String,
    author: String,
    license: String,
    right_to_distribute: bool,
    rights_confirmed: bool,
    files: Vec<CreatorAsset>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreatorAsset {
    name: String,
    data: String,
}

#[derive(Serialize)]
pub struct CreatorExport {
    archive: String,
    manifest: Manifest,
}

fn build_package(request: CreatorRequest) -> Result<(Vec<u8>, Manifest), String> {
    if !request.rights_confirmed || request.files.is_empty() || request.files.len() > 24 {
        return Err("Confirm the rights for between 1 and 24 original images.".into());
    }
    let total: usize = request.files.iter().map(|file| file.data.len()).sum();
    if total > MAX_ARCHIVE.div_ceil(3) * 4 {
        return Err("Creator images exceed the package limit.".into());
    }
    let mut files = request.files;
    files.sort_by(|a, b| a.name.cmp(&b.name));
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut entries = Vec::with_capacity(files.len());
    let mut seen = BTreeSet::new();
    for file in files {
        if !safe_name(&file.name)
            || file.name.contains('/')
            || !seen.insert(file.name.to_ascii_lowercase())
        {
            return Err("Use unique file names containing only letters, numbers, dots, dashes, or underscores.".into());
        }
        let relative_path = format!("images/{}", file.name);
        let data = STANDARD
            .decode(file.data)
            .map_err(|_| "Invalid image data.")?;
        archive
            .start_file(
                &relative_path,
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .map_err(|e| e.to_string())?;
        archive.write_all(&data).map_err(|e| e.to_string())?;
        entries.push(Entry {
            relative_path,
            sha256: digest(&data),
            size_bytes: data.len() as u64,
        });
    }
    let bytes = archive.finish().map_err(|e| e.to_string())?.into_inner();
    let manifest = Manifest {
        schema_version: 1,
        mod_id: request.mod_id,
        version: request.version,
        display_name: request.display_name,
        author: request.author,
        license: request.license,
        right_to_distribute: request.right_to_distribute,
        contains_paid_riot_content: false,
        sha256: digest(&bytes),
        supported_game_builds: vec![],
        champion_ids: vec![],
        files: entries,
        attribution_url: None,
        notes: None,
    };
    validate_archive(&bytes, &manifest)?;
    Ok((bytes, manifest))
}

#[tauri::command]
pub async fn creator_build_package(request: CreatorRequest) -> Result<CreatorExport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "Another library operation is in progress.")?;
        let (bytes, manifest) = build_package(request)?;
        Ok(CreatorExport {
            archive: STANDARD.encode(bytes),
            manifest,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn index(dir: &Path) -> Result<Vec<InstalledMod>, String> {
    let rows =
        storage::read::<Vec<InstalledMod>>(&dir.join("index.json"), MAX_INDEX)?.unwrap_or_default();
    if rows.len() > 200
        || rows
            .iter()
            .any(|row| !is_hash(&row.manifest.sha256) || row.archive_bytes > MAX_ARCHIVE as u64)
    {
        return Err("Invalid library index.".into());
    }
    Ok(rows)
}

#[tauri::command]
pub async fn mod_import(
    app: AppHandle,
    archive: String,
    manifest: Manifest,
    rights_confirmed: bool,
) -> Result<(), String> {
    if !rights_confirmed {
        return Err("Confirm that you may use this content before importing.".into());
    }
    if archive.len() > MAX_ARCHIVE.div_ceil(3) * 4 {
        return Err("Archive exceeds maximum allowed package size.".into());
    }
    let dir = storage::root(&app)?.join("library");
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "Another library operation is in progress.")?;
        let bytes = STANDARD
            .decode(archive)
            .map_err(|_| "Invalid archive data.")?;
        validate_archive(&bytes, &manifest)?;
        let mut rows = index(&dir)?;
        if rows
            .iter()
            .any(|row| row.manifest.sha256 == manifest.sha256)
        {
            return Ok(());
        }
        if rows.len() >= 200
            || rows.iter().map(|row| row.archive_bytes).sum::<u64>() + bytes.len() as u64
                > MAX_LIBRARY
        {
            return Err("The local library is full.".into());
        }
        let blob = dir.join("content").join(&manifest.sha256);
        let format = format!("{:?}", super::fantome::detect_package_format(&bytes));
        rows.push(InstalledMod {
            manifest,
            archive_bytes: bytes.len() as u64,
            enabled: true,
            priority: rows.len() as u32,
            format,
        });
        let index = serde_json::to_vec(&rows).map_err(|e| e.to_string())?;
        if index.len() as u64 > MAX_INDEX {
            return Err("The local library metadata quota is full.".into());
        }
        storage::write_bytes(&blob, &bytes)?;
        if let Err(error) = storage::write_bytes(&dir.join("index.json"), &index) {
            let _ = fs::remove_file(blob);
            return Err(error);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn mod_list(app: AppHandle) -> Result<Vec<InstalledMod>, String> {
    index(&storage::root(&app)?.join("library"))
}

#[tauri::command]
pub fn mod_remove(app: AppHandle, hash: String) -> Result<(), String> {
    if !is_hash(&hash) {
        return Err("Invalid package identifier.".into());
    }
    let dir = storage::root(&app)?.join("library");
    let _guard = LOCK
        .try_lock()
        .map_err(|_| "Another library operation is in progress.")?;
    let mut rows = index(&dir)?;
    if !rows.iter().any(|row| row.manifest.sha256 == hash) {
        return Err("Package is not in the local library.".into());
    }
    rows.retain(|row| row.manifest.sha256 != hash);
    storage::write(&dir.join("index.json"), &rows)?;
    match fs::remove_file(dir.join("content").join(hash)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!(
            "Package was unlisted, but its cached copy could not be removed: {e}"
        )),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn mod_set_enabled(app: AppHandle, hash: String, enabled: bool) -> Result<(), String> {
    if !is_hash(&hash) {
        return Err("Invalid package hash.".into());
    }
    let dir = storage::root(&app)?.join("library");
    let _guard = LOCK
        .try_lock()
        .map_err(|_| "Another library operation is in progress.")?;
    let mut rows = index(&dir)?;
    let row = rows
        .iter_mut()
        .find(|r| r.manifest.sha256 == hash)
        .ok_or("Mod not found in library.")?;
    row.enabled = enabled;
    storage::write(&dir.join("index.json"), &rows)?;
    Ok(())
}

#[tauri::command]
pub fn mod_set_priority(app: AppHandle, hash: String, priority: u32) -> Result<(), String> {
    if !is_hash(&hash) {
        return Err("Invalid package hash.".into());
    }
    let dir = storage::root(&app)?.join("library");
    let _guard = LOCK
        .try_lock()
        .map_err(|_| "Another library operation is in progress.")?;
    let mut rows = index(&dir)?;
    let row = rows
        .iter_mut()
        .find(|r| r.manifest.sha256 == hash)
        .ok_or("Mod not found in library.")?;
    row.priority = priority;
    storage::write(&dir.join("index.json"), &rows)?;
    Ok(())
}

#[tauri::command]
pub fn mod_detect_conflicts(app: AppHandle) -> Result<Vec<ModConflict>, String> {
    let dir = storage::root(&app)?.join("library");
    let rows = index(&dir)?;
    let mut path_to_mods: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for m in rows.iter().filter(|r| r.enabled) {
        for file in &m.manifest.files {
            path_to_mods
                .entry(file.relative_path.to_ascii_lowercase())
                .or_default()
                .push(m.manifest.display_name.clone());
        }
    }

    let mut conflicts = Vec::new();
    for (rel_path, mods) in path_to_mods {
        if mods.len() > 1 {
            conflicts.push(ModConflict {
                relative_path: rel_path,
                conflicting_mods: mods,
            });
        }
    }
    Ok(conflicts)
}

#[tauri::command]
pub fn mod_stage_overlay(app: AppHandle) -> Result<StagingReport, String> {
    let dir = storage::root(&app)?.join("library");
    let rows = index(&dir)?;
    let mut enabled_mods: Vec<&InstalledMod> = rows.iter().filter(|r| r.enabled).collect();
    enabled_mods.sort_by_key(|r| r.priority);

    let staging_dir = dir.join("staging").join("active_overlay");
    if staging_dir.exists() {
        let _ = fs::remove_dir_all(&staging_dir);
    }
    fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    let mut staged_files_count = 0;
    for m in &enabled_mods {
        let blob_path = dir.join("content").join(&m.manifest.sha256);
        if let Ok(data) = fs::read(&blob_path) {
            if let Ok(summary) = super::fantome::extract_fantome(&data, &staging_dir) {
                staged_files_count += summary.file_count;
            }
        }
    }

    Ok(StagingReport {
        staged_mods_count: enabled_mods.len(),
        staged_files_count,
        staging_directory: staging_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn mod_rollback(app: AppHandle) -> Result<bool, String> {
    let dir = storage::root(&app)?.join("library").join("staging");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn delete_cache_file(app: AppHandle, cache_type: String, file_id: String) -> Result<bool, String> {
    if !safe_name(&file_id) {
        return Err("Invalid cache file name.".into());
    }
    let root = storage::root(&app)?;
    let target_dir = match cache_type.as_str() {
        "media" | "thumbnails" => root.join("media"),
        "catalog" => root.join("catalog"),
        "staging" => root.join("library").join("staging"),
        _ => return Err("Unsupported cache type.".into()),
    };

    let target_file = target_dir.join(&file_id);
    if target_file.exists() && target_file.is_file() {
        fs::remove_file(target_file).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn delete_custom_mod_cache(app: AppHandle) -> Result<u64, String> {
    let staging = storage::root(&app)?.join("library").join("staging");
    let mut reclaimed = 0u64;
    if staging.exists() {
        if let Ok(entries) = fs::read_dir(&staging) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    reclaimed += meta.len();
                }
            }
        }
        let _ = fs::remove_dir_all(&staging);
        let _ = fs::create_dir_all(&staging);
    }
    Ok(reclaimed)
}

#[tauri::command]
pub fn delete_marketplace_mod_cache(app: AppHandle) -> Result<u64, String> {
    let mp_dir = storage::root(&app)?.join("marketplace_cache");
    let mut reclaimed = 0u64;
    if mp_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mp_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    reclaimed += meta.len();
                }
            }
        }
        let _ = fs::remove_dir_all(&mp_dir);
        let _ = fs::create_dir_all(&mp_dir);
    }
    Ok(reclaimed)
}

#[tauri::command]
pub fn delete_custom_mod_storage(app: AppHandle, hash: String) -> Result<bool, String> {
    mod_remove(app, hash).map(|_| true)
}

#[tauri::command]
pub fn invalidate_fixed_mod_cache(app: AppHandle) -> Result<bool, String> {
    let staging = storage::root(&app)?.join("library").join("staging");
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
        let _ = fs::create_dir_all(&staging);
    }
    Ok(true)
}

#[tauri::command]
pub fn fantome_read_meta(zip_base64: String) -> Result<super::fantome::FantomeMeta, String> {
    let bytes = STANDARD
        .decode(zip_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    super::fantome::read_fantome_meta(&bytes)
}

#[tauri::command]
pub fn fantome_write_meta(
    zip_base64: String,
    meta: super::fantome::FantomeMeta,
) -> Result<String, String> {
    let bytes = STANDARD
        .decode(zip_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    let updated = super::fantome::write_fantome_meta(&bytes, &meta)?;
    Ok(STANDARD.encode(updated))
}

#[tauri::command]
pub fn fantome_list_contents(
    zip_base64: String,
) -> Result<Vec<super::fantome::FantomeEntry>, String> {
    let bytes = STANDARD
        .decode(zip_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    super::fantome::list_fantome_contents(&bytes)
}

#[tauri::command]
pub fn fantome_extract(
    app: AppHandle,
    zip_base64: String,
    folder_name: String,
) -> Result<super::fantome::ExtractionSummary, String> {
    if !safe_name(&folder_name) {
        return Err("Invalid destination folder name.".into());
    }
    let bytes = STANDARD
        .decode(zip_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    let target = storage::root(&app)?
        .join("extracted_mods")
        .join(folder_name);
    super::fantome::extract_fantome(&bytes, &target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_image_package_round_trips_and_rejects_changed_payload() {
        use image::{DynamicImage, ImageFormat};
        let mut image = Cursor::new(Vec::new());
        DynamicImage::new_rgba8(8, 8)
            .write_to(&mut image, ImageFormat::Png)
            .unwrap();
        let request = CreatorRequest {
            mod_id: "test.original".into(),
            version: "1.0.0".into(),
            display_name: "Original art".into(),
            author: "Test author".into(),
            license: "CC0-1.0".into(),
            right_to_distribute: true,
            rights_confirmed: true,
            files: vec![CreatorAsset {
                name: "panel.png".into(),
                data: STANDARD.encode(image.into_inner()),
            }],
        };
        let (mut bytes, manifest) = build_package(request).unwrap();
        assert!(validate_archive(&bytes, &manifest).is_ok());
        bytes[10] ^= 0xff;
        assert!(validate_archive(&bytes, &manifest).is_err());
    }

    #[test]
    fn archive_names_exclude_platform_escape_and_ambiguity() {
        assert!(safe_name("textures/portrait.webp"));
        for path in [
            "../one.png",
            "/one.png",
            "C:one.png",
            "a\\b.png",
            "a//b.png",
            "NUL.png",
            "a/COM1.png",
            "a./b.png",
        ] {
            assert!(!safe_name(path), "{path}");
        }
    }

    #[test]
    fn rejects_unsupported_extensions_and_executables() {
        let manifest = Manifest {
            schema_version: 1,
            mod_id: "test.exec".into(),
            version: "1.0.0".into(),
            display_name: "Executable mod".into(),
            author: "Tester".into(),
            license: "MIT".into(),
            right_to_distribute: true,
            contains_paid_riot_content: false,
            sha256: "0".repeat(64),
            supported_game_builds: vec![],
            champion_ids: vec![],
            files: vec![Entry {
                relative_path: "payload.exe".into(),
                sha256: "0".repeat(64),
                size_bytes: 4,
            }],
            attribution_url: None,
            notes: None,
        };
        let mut zip_buf = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut zip_buf);
            writer
                .start_file(
                    "payload.exe",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            writer.write_all(b"MZ\x90\x00").unwrap();
            writer.finish().unwrap();
        }
        let bytes = zip_buf.into_inner();
        let mut manifest_with_hash = manifest;
        manifest_with_hash.sha256 = digest(&bytes);
        manifest_with_hash.files[0].sha256 = digest(b"MZ\x90\x00");
        let result = validate_archive(&bytes, &manifest_with_hash);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Only PNG, JPEG, and WebP"));
    }

    #[test]
    fn rejects_corrupted_image_data() {
        let dummy_corrupted_bytes = b"not_a_valid_png_file";
        let manifest = Manifest {
            schema_version: 1,
            mod_id: "test.corrupt".into(),
            version: "1.0.0".into(),
            display_name: "Corrupt mod".into(),
            author: "Tester".into(),
            license: "MIT".into(),
            right_to_distribute: true,
            contains_paid_riot_content: false,
            sha256: "0".repeat(64),
            supported_game_builds: vec![],
            champion_ids: vec![],
            files: vec![Entry {
                relative_path: "corrupt.png".into(),
                sha256: digest(dummy_corrupted_bytes),
                size_bytes: dummy_corrupted_bytes.len() as u64,
            }],
            attribution_url: None,
            notes: None,
        };
        let mut zip_buf = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut zip_buf);
            writer
                .start_file(
                    "corrupt.png",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            writer.write_all(dummy_corrupted_bytes).unwrap();
            writer.finish().unwrap();
        }
        let bytes = zip_buf.into_inner();
        let mut manifest_with_hash = manifest;
        manifest_with_hash.sha256 = digest(&bytes);
        let result = validate_archive(&bytes, &manifest_with_hash);
        assert!(result.is_err());
    }

    #[test]
    fn test_conflict_detection_identifies_overlapping_paths() {
        let m1 = InstalledMod {
            manifest: Manifest {
                schema_version: 1,
                mod_id: "mod.a".into(),
                version: "1.0".into(),
                display_name: "Mod A".into(),
                author: "Dev".into(),
                license: "MIT".into(),
                right_to_distribute: true,
                contains_paid_riot_content: false,
                sha256: "1".repeat(64),
                supported_game_builds: vec![],
                champion_ids: vec![],
                files: vec![Entry {
                    relative_path: "assets/characters/ahri/ahri.skn".into(),
                    sha256: "a".repeat(64),
                    size_bytes: 100,
                }],
                attribution_url: None,
                notes: None,
            },
            archive_bytes: 500,
            enabled: true,
            priority: 0,
            format: "Fantome".into(),
        };

        let m2 = InstalledMod {
            manifest: Manifest {
                schema_version: 1,
                mod_id: "mod.b".into(),
                version: "1.0".into(),
                display_name: "Mod B".into(),
                author: "Dev".into(),
                license: "MIT".into(),
                right_to_distribute: true,
                contains_paid_riot_content: false,
                sha256: "2".repeat(64),
                supported_game_builds: vec![],
                champion_ids: vec![],
                files: vec![Entry {
                    relative_path: "assets/characters/ahri/ahri.skn".into(),
                    sha256: "b".repeat(64),
                    size_bytes: 120,
                }],
                attribution_url: None,
                notes: None,
            },
            archive_bytes: 600,
            enabled: true,
            priority: 1,
            format: "Fantome".into(),
        };

        let mut path_to_mods: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for m in [&m1, &m2].iter().filter(|r| r.enabled) {
            for file in &m.manifest.files {
                path_to_mods
                    .entry(file.relative_path.to_ascii_lowercase())
                    .or_default()
                    .push(m.manifest.display_name.clone());
            }
        }

        let mut conflicts = Vec::new();
        for (rel_path, mods) in path_to_mods {
            if mods.len() > 1 {
                conflicts.push(ModConflict {
                    relative_path: rel_path,
                    conflicting_mods: mods,
                });
            }
        }

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].relative_path, "assets/characters/ahri/ahri.skn");
        assert_eq!(conflicts[0].conflicting_mods.len(), 2);
    }
}
