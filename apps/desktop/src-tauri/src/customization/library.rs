use super::storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::{Cursor, Read, Write},
    path::Path,
    sync::Mutex,
};
use tauri::AppHandle;
use zip::ZipArchive;

const MAX_ARCHIVE: usize = 12 * 1024 * 1024;
const MAX_ENTRY: u64 = 16 * 1024 * 1024;
const MAX_EXPANDED: u64 = 48 * 1024 * 1024;
const MAX_INDEX: u64 = 12 * 1024 * 1024;
const MAX_FILES: usize = 256;
const MAX_LIBRARY: u64 = 256 * 1024 * 1024;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    schema_version: u8,
    mod_id: String,
    version: String,
    display_name: String,
    author: String,
    license: String,
    right_to_distribute: bool,
    contains_paid_riot_content: bool,
    sha256: String,
    supported_game_builds: Vec<String>,
    #[serde(default)]
    champion_ids: Vec<u32>,
    files: Vec<Entry>,
    attribution_url: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    relative_path: String,
    sha256: String,
    size_bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    manifest: Manifest,
    archive_bytes: u64,
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

fn safe_name(name: &str) -> bool {
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
        let format = match name
            .rsplit_once('.')
            .map(|(_, ext)| ext.to_ascii_lowercase())
            .as_deref()
        {
            Some("png") => image::ImageFormat::Png,
            Some("jpg" | "jpeg") => image::ImageFormat::Jpeg,
            Some("webp") => image::ImageFormat::WebP,
            _ => {
                return Err("Only PNG, JPEG, and WebP assets are accepted by this library.".into())
            }
        };
        let mut data = Vec::new();
        (&mut file)
            .take(entry.size_bytes + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() as u64 != entry.size_bytes
            || digest(&data) != entry.sha256
            || image::guess_format(&data).ok() != Some(format)
        {
            return Err("An entry did not match its declared digest, size, or type.".into());
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
        return Err("Archive exceeds 12 MiB.".into());
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
        rows.push(InstalledMod {
            manifest,
            archive_bytes: bytes.len() as u64,
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
}
