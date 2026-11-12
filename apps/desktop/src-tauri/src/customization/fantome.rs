use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const MAX_ARCHIVE: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FantomeMeta {
    #[serde(alias = "License", default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(alias = "Name")]
    pub name: String,
    #[serde(alias = "Author", default)]
    pub author: String,
    #[serde(alias = "Version", default)]
    pub version: String,
    #[serde(alias = "Description", default)]
    pub description: String,
    #[serde(alias = "Type", default = "default_type")]
    pub mod_type: String,
    #[serde(alias = "TargetChampion", default)]
    pub target_champion: Option<String>,
    #[serde(alias = "TargetSkin", default)]
    pub target_skin: Option<u32>,
}

fn default_type() -> String {
    "Skin".into()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FantomeEntry {
    pub relative_path: String,
    pub size_bytes: u64,
    pub compressed_size: u64,
    pub format_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PackageFormat {
    Fantome,
    Modpkg,
    ImagePack,
    GenericZip,
    Unsupported,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionSummary {
    pub file_count: usize,
    pub total_bytes: u64,
    pub extracted_files: Vec<String>,
}

pub fn is_executable_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "js" | "mjs"
            | "cjs"
            | "html"
            | "htm"
            | "svg"
            | "py"
            | "pyc"
            | "jar"
            | "lnk"
            | "url"
            | "exe"
            | "dll"
            | "bat"
            | "cmd"
            | "ps1"
            | "vbs"
            | "sh"
            | "com"
            | "scr"
            | "msi"
            | "sys"
            | "drv"
    )
}

pub fn classify_format(path: &str) -> String {
    let ext = path
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "json" | "txt" => "Metadata".into(),
        "dds" | "png" | "jpg" | "jpeg" | "webp" => "Texture / Image".into(),
        "skn" | "skl" | "sco" | "scb" | "anm" | "mapgeo" => "3D Model / Animation".into(),
        "bin" => "Property Binary".into(),
        "wad" | "client" => "WAD Container".into(),
        "ogg" | "wav" | "bnk" | "wpk" => "Audio".into(),
        _ => "Other Asset".into(),
    }
}

pub fn detect_package_format(bytes: &[u8]) -> PackageFormat {
    if !bytes.starts_with(b"PK\x03\x04") || bytes.len() > MAX_ARCHIVE {
        return PackageFormat::Unsupported;
    }
    let Ok(mut zip) = ZipArchive::new(Cursor::new(bytes)) else {
        return PackageFormat::Unsupported;
    };

    let mut has_fantome_meta = false;
    let mut has_modpkg_manifest = false;
    let mut only_images = true;

    for i in 0..zip.len() {
        let Ok(file) = zip.by_index(i) else { continue };
        let name = file.name().unwrap_or_default().to_ascii_lowercase();
        if name == "meta/info.json" || name == "info.json" {
            has_fantome_meta = true;
        }
        if name == "modpkg.json" || name == "manifest.json" {
            has_modpkg_manifest = true;
        }
        let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
        if !matches!(ext, "png" | "jpg" | "jpeg" | "webp") {
            only_images = false;
        }
    }

    if has_fantome_meta {
        PackageFormat::Fantome
    } else if has_modpkg_manifest {
        PackageFormat::Modpkg
    } else if only_images && zip.len() > 0 {
        PackageFormat::ImagePack
    } else {
        PackageFormat::GenericZip
    }
}

pub fn read_fantome_meta(zip_bytes: &[u8]) -> Result<FantomeMeta, String> {
    if !zip_bytes.starts_with(b"PK\x03\x04") {
        return Err("Not a valid ZIP archive.".into());
    }
    let mut zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    for name in &["META/info.json", "info.json", "meta/info.json"] {
        if let Ok(file) = zip.by_name(name) {
            let mut data = Vec::new();
            file.take(512 * 1024)
                .read_to_end(&mut data)
                .map_err(|e| e.to_string())?;
            return serde_json::from_slice(&data)
                .map_err(|e| format!("Invalid Fantome metadata format: {e}"));
        }
    }
    Err("Package does not contain META/info.json metadata.".into())
}

pub fn write_fantome_meta(zip_bytes: &[u8], meta: &FantomeMeta) -> Result<Vec<u8>, String> {
    if !zip_bytes.starts_with(b"PK\x03\x04") {
        return Err("Not a valid ZIP archive.".into());
    }
    validated_archive(zip_bytes)?;
    let mut old_zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    let mut out_buffer = Cursor::new(Vec::with_capacity(zip_bytes.len() + 1024));
    let mut new_zip = ZipWriter::new(&mut out_buffer);

    let meta_json = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Write updated META/info.json
    new_zip
        .start_file("META/info.json", options)
        .map_err(|e| e.to_string())?;
    new_zip.write_all(&meta_json).map_err(|e| e.to_string())?;

    // Copy all other files except old meta files
    for i in 0..old_zip.len() {
        let mut file = old_zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().unwrap_or_default().to_string();
        if name == "META/info.json" || name == "info.json" || name == "meta/info.json" {
            continue;
        }
        new_zip
            .start_file(&name, options)
            .map_err(|e| e.to_string())?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).map_err(|e| e.to_string())?;
        new_zip.write_all(&content).map_err(|e| e.to_string())?;
    }

    new_zip.finish().map_err(|e| e.to_string())?;
    Ok(out_buffer.into_inner())
}

pub fn list_fantome_contents(zip_bytes: &[u8]) -> Result<Vec<FantomeEntry>, String> {
    validated_archive(zip_bytes)?;
    if !zip_bytes.starts_with(b"PK\x03\x04") {
        return Err("Not a valid ZIP archive.".into());
    }
    let mut zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    let mut entries = Vec::with_capacity(zip.len());

    for i in 0..zip.len() {
        let file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().unwrap_or_default().to_string();
        let format_type = classify_format(&name);
        entries.push(FantomeEntry {
            relative_path: name,
            size_bytes: file.size(),
            compressed_size: file.compressed_size(),
            format_type,
        });
    }

    Ok(entries)
}

pub fn is_windows_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name);
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

pub fn validate_zip_entry_path(raw_name: &str) -> Result<std::path::PathBuf, String> {
    if raw_name.is_empty() || raw_name.len() > 1024 {
        return Err("Path length must be between 1 and 1024 characters.".into());
    }
    if raw_name.contains('\0') {
        return Err("Path cannot contain null bytes.".into());
    }
    if raw_name.contains(':') {
        return Err("Path cannot contain drive colon prefixes.".into());
    }
    if raw_name.starts_with(r"\\") || raw_name.starts_with("//") {
        return Err("UNC network paths are forbidden.".into());
    }
    if raw_name.starts_with('/') || raw_name.starts_with('\\') {
        return Err("Absolute path prefixes are forbidden.".into());
    }

    let p = Path::new(raw_name);
    if p.is_absolute() || p.has_root() {
        return Err("Only relative paths within the archive are permitted.".into());
    }

    let mut safe_path = std::path::PathBuf::new();
    for component in p.components() {
        match component {
            std::path::Component::Normal(comp) => {
                let s = comp.to_string_lossy();
                if is_windows_device_name(&s) {
                    return Err(format!("Windows reserved device name forbidden: {s}"));
                }
                safe_path.push(comp);
            }
            _ => {
                return Err(format!("Unsafe path component detected: {raw_name}"));
            }
        }
    }

    if safe_path.as_os_str().is_empty() {
        return Err("Empty relative path component.".into());
    }

    Ok(safe_path)
}

fn validated_archive(bytes: &[u8]) -> Result<super::library::Manifest, String> {
    super::library::inspect_archive(
        bytes,
        super::library::ImportDeclaration {
            display_name: "Local archive inspection".into(),
            author: "Not declared".into(),
            version: "1".into(),
            license: "Not declared".into(),
            right_to_distribute: false,
            contains_paid_riot_content: false,
        },
    )
}
pub fn extract_fantome(zip_bytes: &[u8], target_dir: &Path) -> Result<ExtractionSummary, String> {
    let manifest = validated_archive(zip_bytes)?;
    if target_dir.exists() {
        return Err(
            "Choose a new extraction directory; existing content is never overwritten.".into(),
        );
    }
    let parent = target_dir.parent().ok_or("Missing extraction parent")?;
    super::sandbox::check_chain(parent, true)?;
    fs::create_dir(target_dir).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
        for entry in &manifest.files {
            let path = target_dir.join(&entry.relative_path);
            super::sandbox::check_chain(path.parent().unwrap(), true)?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .map_err(|e| e.to_string())?;
            let mut input = zip
                .by_name(&entry.relative_path)
                .map_err(|e| e.to_string())?;
            std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
            output.sync_all().map_err(|e| e.to_string())?;
        }
        Ok(ExtractionSummary {
            file_count: manifest.files.len(),
            total_bytes: manifest.files.iter().map(|e| e.size_bytes).sum(),
            extracted_files: manifest
                .files
                .iter()
                .map(|e| e.relative_path.clone())
                .collect(),
        })
    })();
    // Only newly created, checked descendants can be removed on failed extraction.
    if result.is_err() {
        for entry in &manifest.files {
            let path = target_dir.join(&entry.relative_path);
            if path.exists() && super::sandbox::check_chain(&path, false).is_ok() {
                let _ = fs::remove_file(path);
            }
        }
    }
    result
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FantomeInspectionReport {
    pub is_valid: bool,
    pub detected_format: String,
    pub meta_found: bool,
    pub meta: Option<FantomeMeta>,
    pub issues_found: Vec<String>,
    pub warnings: Vec<String>,
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub has_skeleton: bool,
    pub has_mesh: bool,
    pub has_animations: bool,
    pub has_textures: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FantomeRepairResult {
    pub repaired: bool,
    pub actions_taken: Vec<String>,
    pub repaired_archive_base64: Option<String>,
}

pub fn inspect_fantome(zip_bytes: &[u8]) -> Result<FantomeInspectionReport, String> {
    if !zip_bytes.starts_with(b"PK\x03\x04") {
        return Err("Not a valid ZIP archive.".into());
    }
    let format = detect_package_format(zip_bytes);
    let mut zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;

    let meta = read_fantome_meta(zip_bytes).ok();
    let meta_found = meta.is_some();

    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    let mut total_size = 0u64;
    let mut file_count = 0usize;
    let mut has_skeleton = false;
    let mut has_mesh = false;
    let mut has_animations = false;
    let mut has_textures = false;

    if !meta_found {
        issues.push("Missing required META/info.json package metadata.".into());
    }

    for i in 0..zip.len() {
        let Ok(file) = zip.by_index(i) else {
            issues.push(format!("Corrupt archive entry index #{i}."));
            continue;
        };
        if file.is_dir() {
            continue;
        }
        file_count += 1;
        total_size += file.size();

        let name = file.name().unwrap_or_default();
        if file.size() == 0 {
            warnings.push(format!("Zero-byte empty asset detected: {name}"));
        }

        let lower = name.to_ascii_lowercase();
        if lower.ends_with(".skl") {
            has_skeleton = true;
        } else if lower.ends_with(".skn") || lower.ends_with(".sco") || lower.ends_with(".scb") {
            has_mesh = true;
        } else if lower.ends_with(".anm") {
            has_animations = true;
        } else if lower.ends_with(".dds") || lower.ends_with(".png") || lower.ends_with(".jpg") {
            has_textures = true;
        }

        if (name.starts_with("assets/") || name.starts_with("Assets/")) && name != lower {
            issues.push(format!("Inconsistent path casing: {name} (League requires canonical lowercase paths)."));
        }
    }

    if has_animations && !has_skeleton {
        warnings.push("Package contains animation files (.anm) without an associated skeleton (.skl).".into());
    }
    if has_mesh && !has_skeleton && has_animations {
        warnings.push("Mesh and animations present but skeleton missing. Character rigging may fail in-game.".into());
    }

    let is_valid = issues.is_empty();

    Ok(FantomeInspectionReport {
        is_valid,
        detected_format: format!("{format:?}"),
        meta_found,
        meta,
        issues_found: issues,
        warnings,
        file_count,
        total_size_bytes: total_size,
        has_skeleton,
        has_mesh,
        has_animations,
        has_textures,
    })
}

pub fn repair_fantome(zip_bytes: &[u8]) -> Result<FantomeRepairResult, String> {
    if !zip_bytes.starts_with(b"PK\x03\x04") {
        return Err("Not a valid ZIP archive.".into());
    }
    if zip_bytes.len() > MAX_ARCHIVE { return Err("Archive exceeds 32 MiB repair limit".into()); }
    let mut old_zip = ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    if old_zip.len() > 512 { return Err("Repair archive has too many entries".into()); }
    let mut expanded = 0u64;
    for i in 0..old_zip.len() {
        let entry = old_zip.by_index(i).map_err(|e| e.to_string())?;
        expanded = expanded.checked_add(entry.size()).ok_or("Repair expansion overflow")?;
        if entry.size() > 64 * 1024 * 1024 || expanded > 128 * 1024 * 1024
            || entry.size() > entry.compressed_size().saturating_mul(100) {
            return Err("Repair archive exceeds expansion limits".into());
        }
    }
    let mut actions = Vec::new();

    // Keep original authorship, licensing and extension fields verbatim. Repair is
    // never authorization to relicense or claim another creator's content.
    let mut metadata = None;
    for i in 0..old_zip.len() {
        let mut entry = old_zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().unwrap_or_default().to_ascii_lowercase();
        if name == "meta/info.json" || name == "info.json" {
            if metadata.is_some() { return Err("Conflicting metadata entries; resolve them before repair.".into()); }
            if entry.size() > 512 * 1024 { return Err("Metadata exceeds 512 KiB".into()); }
            let mut bytes = Vec::new();
            (&mut entry).take(512 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let value: serde_json::Value = serde_json::from_slice(&bytes)
                .map_err(|e| format!("Invalid metadata must be repaired explicitly: {e}"))?;
            if !value.is_object() { return Err("Metadata must be an object".into()); }
            metadata = Some(bytes);
        }
    }
    let meta_bytes = metadata.unwrap_or_else(|| {
        actions.push("Created missing metadata without claiming authorship or redistribution rights.".into());
        br#"{"name":"Repaired Mod Package","author":"","version":"1.0.0"}"#.to_vec()
    });

    let mut out_buffer = Cursor::new(Vec::with_capacity(zip_bytes.len() + 1024));
    let mut new_zip = ZipWriter::new(&mut out_buffer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 1. Write clean canonical META/info.json
    new_zip.start_file("META/info.json", options).map_err(|e| e.to_string())?;
    new_zip.write_all(&meta_bytes).map_err(|e| e.to_string())?;

    // 2. Normalize and copy all asset entries
    let mut written_paths = std::collections::BTreeSet::new();
    written_paths.insert("meta/info.json".to_string());

    for i in 0..old_zip.len() {
        let mut file = old_zip.by_index(i).map_err(|e| e.to_string())?;
        let raw_name = file.name().unwrap_or_default().to_string();
        if raw_name.is_empty() || file.is_dir() {
            continue;
        }

        let lower = raw_name.to_ascii_lowercase();
        if lower == "meta/info.json" || lower == "info.json" {
            continue; // Already normalized and written
        }

        let safe_rel = match validate_zip_entry_path(&raw_name) {
            Ok(p) => p,
            Err(e) => {
                actions.push(format!("Skipped unsafe entry {raw_name}: {e}"));
                continue;
            }
        };

        let target_path = if safe_rel.to_string_lossy().starts_with("assets") || safe_rel.to_string_lossy().starts_with("Assets") {
            let canon = safe_rel.to_string_lossy().to_ascii_lowercase();
            if canon != raw_name {
                actions.push(format!("Normalized path casing: {raw_name} -> {canon}"));
            }
            canon
        } else {
            safe_rel.to_string_lossy().to_string()
        };

        if !written_paths.insert(target_path.clone()) {
            actions.push(format!("Deduplicated colliding archive entry: {target_path}"));
            continue;
        }

        new_zip.start_file(&target_path, options).map_err(|e| e.to_string())?;
        let mut content = Vec::new();
        let size = file.size();
        (&mut file).take(size + 1).read_to_end(&mut content).map_err(|e| e.to_string())?;
        if content.len() as u64 != size { return Err("Repair entry length mismatch".into()); }
        new_zip.write_all(&content).map_err(|e| e.to_string())?;
    }

    new_zip.finish().map_err(|e| e.to_string())?;
    let repaired_bytes = out_buffer.into_inner();

    Ok(FantomeRepairResult {
        repaired: true,
        actions_taken: actions,
        repaired_archive_base64: Some(STANDARD.encode(repaired_bytes)),
    })
}

#[tauri::command]
pub fn fantome_inspect_package(archive_base64: String) -> Result<FantomeInspectionReport, String> {
    let bytes = STANDARD.decode(&archive_base64).map_err(|e| format!("Base64 decoding failed: {e}"))?;
    inspect_fantome(&bytes)
}

#[tauri::command]
pub fn fantome_repair_package(archive_base64: String) -> Result<FantomeRepairResult, String> {
    let bytes = STANDARD.decode(&archive_base64).map_err(|e| format!("Base64 decoding failed: {e}"))?;
    repair_fantome(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_fantome_zip() -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut buf);
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("META/info.json", opts).unwrap();
        let meta = FantomeMeta {
            license: None,
            name: "Spirit Blossom Ahri Mod".into(),
            author: "CreatorX".into(),
            version: "1.2.0".into(),
            description: "Custom visual enhancements".into(),
            mod_type: "Skin".into(),
            target_champion: Some("Ahri".into()),
            target_skin: Some(1),
        };
        zip.write_all(&serde_json::to_vec(&meta).unwrap()).unwrap();

        zip.start_file("assets/characters/ahri/skins/skin01/ahri.skn", opts)
            .unwrap();
        zip.write_all(b"SKN_MODEL_DATA_FIXTURE").unwrap();

        zip.start_file("assets/characters/ahri/skins/skin01/ahri_tx_cm.dds", opts)
            .unwrap();
        zip.write_all(b"DDS_TEXTURE_DATA_FIXTURE").unwrap();

        zip.finish().unwrap();
        buf.into_inner()
    }

    #[test]
    fn repair_preserves_original_metadata_bytes_without_relicensing() {
        let original = br#"{"Name":"Original","Author":"Original artist","Version":"1.2","License":"All rights reserved","rightToDistribute":false,"extension":{"attribution":"Keep me"}}"#;
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("META/info.json", SimpleFileOptions::default()).unwrap();
        zip.write_all(original).unwrap();
        zip.start_file("assets/original.txt", SimpleFileOptions::default()).unwrap();
        zip.write_all(b"original").unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        let repaired = repair_fantome(&bytes).unwrap();
        let bytes = STANDARD.decode(repaired.repaired_archive_base64.unwrap()).unwrap();
        let mut zip = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut actual = Vec::new();
        zip.by_name("META/info.json").unwrap().read_to_end(&mut actual).unwrap();
        assert_eq!(actual, original);
    }

    #[test]
    fn test_detect_package_format() {
        let zip = create_test_fantome_zip();
        assert_eq!(detect_package_format(&zip), PackageFormat::Fantome);

        let non_zip = b"NOT_A_ZIP_HEADER";
        assert_eq!(detect_package_format(non_zip), PackageFormat::Unsupported);
    }

    #[test]
    fn test_read_and_write_fantome_meta() {
        let zip = create_test_fantome_zip();
        let meta = read_fantome_meta(&zip).unwrap();
        assert_eq!(meta.name, "Spirit Blossom Ahri Mod");
        assert_eq!(meta.author, "CreatorX");
        assert_eq!(meta.version, "1.2.0");

        let mut updated = meta.clone();
        updated.version = "1.3.0".into();
        updated.description = "Updated description".into();

        let new_zip = write_fantome_meta(&zip, &updated).unwrap();
        let read_back = read_fantome_meta(&new_zip).unwrap();
        assert_eq!(read_back.version, "1.3.0");
        assert_eq!(read_back.description, "Updated description");
    }

    #[test]
    fn test_list_fantome_contents() {
        let zip = create_test_fantome_zip();
        let contents = list_fantome_contents(&zip).unwrap();
        assert_eq!(contents.len(), 3);
        let paths: Vec<String> = contents.into_iter().map(|e| e.relative_path).collect();
        assert!(paths.contains(&"META/info.json".to_string()));
        assert!(paths.contains(&"assets/characters/ahri/skins/skin01/ahri.skn".to_string()));
        assert!(paths.contains(&"assets/characters/ahri/skins/skin01/ahri_tx_cm.dds".to_string()));
    }

    #[test]
    fn test_extract_fantome_prevents_executables_and_traversal() {
        #[cfg(unix)]
        let base = std::env::temp_dir()
            .canonicalize()
            .unwrap_or_else(|_| std::env::temp_dir());
        #[cfg(not(unix))]
        let base = std::env::temp_dir();
        let temp = base.join(format!("laap_fantome_test_{}", std::process::id()));
        let zip = create_test_fantome_zip();
        let summary = extract_fantome(&zip, &temp).unwrap();
        assert_eq!(summary.file_count, 3);
        assert!(temp.join("META/info.json").exists());
        let _ = fs::remove_dir_all(&temp);

        // Test executable rejection
        let mut mal_buf = Cursor::new(Vec::new());
        let mut mal_zip = ZipWriter::new(&mut mal_buf);
        let opts = SimpleFileOptions::default();
        mal_zip.start_file("malicious.exe", opts).unwrap();
        mal_zip.write_all(b"MZ...").unwrap();
        mal_zip.finish().unwrap();

        assert!(extract_fantome(&mal_buf.into_inner(), &temp).is_err());

        // Negative test: path traversal with ..
        assert!(validate_zip_entry_path("../outside.dds").is_err());
        assert!(validate_zip_entry_path("foo/../../outside.dds").is_err());

        // Negative test: Windows reserved device names
        assert!(validate_zip_entry_path("con.dds").is_err());
        assert!(validate_zip_entry_path("NUL").is_err());
        assert!(validate_zip_entry_path("assets/AUX/texture.dds").is_err());
        assert!(validate_zip_entry_path("com1.json").is_err());

        // Negative test: Drive letter and UNC path
        assert!(validate_zip_entry_path("C:test.dds").is_err());
        assert!(validate_zip_entry_path(r"\\server\share\test.dds").is_err());
        assert!(validate_zip_entry_path("/absolute/path.dds").is_err());
        assert!(validate_zip_entry_path("test\0bad.dds").is_err());

        // Valid relative paths
        assert!(validate_zip_entry_path("assets/characters/ahri/texture.dds").is_ok());
        assert!(validate_zip_entry_path("META/info.json").is_ok());
    }

    #[test]
    fn test_fantome_inspection_and_repair() {
        let zip = create_test_fantome_zip();
        let report = inspect_fantome(&zip).unwrap();
        assert!(report.is_valid);
        assert!(report.meta_found);
        assert_eq!(report.file_count, 3);
        assert!(report.has_mesh);
        assert!(report.has_textures);

        // Create an imperfect archive: info.json in root (not META/) and uppercase path
        let mut mal_buf = Cursor::new(Vec::new());
        let mut mal_zip = ZipWriter::new(&mut mal_buf);
        let opts = SimpleFileOptions::default();
        mal_zip.start_file("info.json", opts).unwrap();
        mal_zip.write_all(b"{\"Name\":\"Broken Mod\",\"Version\":\"1.0\"}").unwrap();
        mal_zip.start_file("Assets/Characters/Ahri/Texture.dds", opts).unwrap();
        mal_zip.write_all(b"RAW_TEXTURE_BYTES").unwrap();
        mal_zip.finish().unwrap();
        let unnormalized = mal_buf.into_inner();

        let initial_inspect = inspect_fantome(&unnormalized).unwrap();
        assert!(!initial_inspect.is_valid);
        assert!(initial_inspect.issues_found.iter().any(|i| i.contains("Inconsistent path casing")));

        // Now repair it
        let repair_res = repair_fantome(&unnormalized).unwrap();
        assert!(repair_res.repaired);
        assert!(!repair_res.actions_taken.is_empty());

        let repaired_bytes = STANDARD.decode(repair_res.repaired_archive_base64.unwrap()).unwrap();
        let after_inspect = inspect_fantome(&repaired_bytes).unwrap();
        assert!(after_inspect.is_valid);
        assert!(after_inspect.meta_found);
    }
}
