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
        let temp = std::env::temp_dir().join(format!("laap_fantome_test_{}", std::process::id()));
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
}
