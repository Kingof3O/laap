use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

pub const WAD_MAGIC: &[u8; 4] = b"RWAC";

// Standard xxHash64 constants
const PRIME64_1: u64 = 0x9E3779B185EBCA87;
const PRIME64_2: u64 = 0xC2B2AE3D27D4EB4F;
const PRIME64_3: u64 = 0x165667B19E3779F9;
const PRIME64_4: u64 = 0x85EBCA77C2B2AE63;
const PRIME64_5: u64 = 0x27D4EB2F165667C5;

/// Computes the standard xxHash64 checksum used by League of Legends for WAD path hashing.
pub fn xxhash64(input: &[u8], seed: u64) -> u64 {
    let mut h64: u64;
    let len = input.len();
    let mut cursor = 0;

    if len >= 32 {
        let mut v1 = seed.wrapping_add(PRIME64_1).wrapping_add(PRIME64_2);
        let mut v2 = seed.wrapping_add(PRIME64_2);
        let mut v3 = seed;
        let mut v4 = seed.wrapping_sub(PRIME64_1);

        while cursor + 32 <= len {
            let k1 = u64::from_le_bytes(input[cursor..cursor + 8].try_into().unwrap());
            v1 = v1
                .wrapping_add(k1.wrapping_mul(PRIME64_2))
                .rotate_left(31)
                .wrapping_mul(PRIME64_1);

            let k2 = u64::from_le_bytes(input[cursor + 8..cursor + 16].try_into().unwrap());
            v2 = v2
                .wrapping_add(k2.wrapping_mul(PRIME64_2))
                .rotate_left(31)
                .wrapping_mul(PRIME64_1);

            let k3 = u64::from_le_bytes(input[cursor + 16..cursor + 24].try_into().unwrap());
            v3 = v3
                .wrapping_add(k3.wrapping_mul(PRIME64_2))
                .rotate_left(31)
                .wrapping_mul(PRIME64_1);

            let k4 = u64::from_le_bytes(input[cursor + 24..cursor + 32].try_into().unwrap());
            v4 = v4
                .wrapping_add(k4.wrapping_mul(PRIME64_2))
                .rotate_left(31)
                .wrapping_mul(PRIME64_1);

            cursor += 32;
        }

        h64 = v1
            .rotate_left(1)
            .wrapping_add(v2.rotate_left(7))
            .wrapping_add(v3.rotate_left(12))
            .wrapping_add(v4.rotate_left(18));

        v1 = v1.wrapping_mul(PRIME64_2).rotate_left(31).wrapping_mul(PRIME64_1);
        h64 = (h64 ^ v1).wrapping_mul(PRIME64_1).wrapping_add(PRIME64_4);

        v2 = v2.wrapping_mul(PRIME64_2).rotate_left(31).wrapping_mul(PRIME64_1);
        h64 = (h64 ^ v2).wrapping_mul(PRIME64_1).wrapping_add(PRIME64_4);

        v3 = v3.wrapping_mul(PRIME64_2).rotate_left(31).wrapping_mul(PRIME64_1);
        h64 = (h64 ^ v3).wrapping_mul(PRIME64_1).wrapping_add(PRIME64_4);

        v4 = v4.wrapping_mul(PRIME64_2).rotate_left(31).wrapping_mul(PRIME64_1);
        h64 = (h64 ^ v4).wrapping_mul(PRIME64_1).wrapping_add(PRIME64_4);
    } else {
        h64 = seed.wrapping_add(PRIME64_5);
    }

    h64 = h64.wrapping_add(len as u64);

    while cursor + 8 <= len {
        let k1 = u64::from_le_bytes(input[cursor..cursor + 8].try_into().unwrap());
        let k1_round = k1.wrapping_mul(PRIME64_2).rotate_left(31).wrapping_mul(PRIME64_1);
        h64 = (h64 ^ k1_round)
            .rotate_left(27)
            .wrapping_mul(PRIME64_1)
            .wrapping_add(PRIME64_4);
        cursor += 8;
    }

    if cursor + 4 <= len {
        let k1 = u32::from_le_bytes(input[cursor..cursor + 4].try_into().unwrap()) as u64;
        h64 = (h64 ^ k1.wrapping_mul(PRIME64_1))
            .rotate_left(23)
            .wrapping_mul(PRIME64_2)
            .wrapping_add(PRIME64_3);
        cursor += 4;
    }

    while cursor < len {
        let k1 = input[cursor] as u64;
        h64 = (h64 ^ k1.wrapping_mul(PRIME64_5))
            .rotate_left(11)
            .wrapping_mul(PRIME64_1);
        cursor += 1;
    }

    h64 ^= h64 >> 33;
    h64 = h64.wrapping_mul(PRIME64_2);
    h64 ^= h64 >> 29;
    h64 = h64.wrapping_mul(PRIME64_3);
    h64 ^= h64 >> 32;

    h64
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WadEntry {
    pub path_hash: u64,
    pub path_hash_hex: String,
    pub offset: u32,
    pub compressed_size: u32,
    pub uncompressed_size: u32,
    pub compression_type: u8,
    pub compression_name: String,
    pub is_duplicate: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadInspectionReport {
    pub is_valid: bool,
    pub major: u8,
    pub minor: u8,
    pub entry_count: usize,
    pub entries: Vec<WadEntry>,
    pub total_uncompressed_size: u64,
    pub total_compressed_size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadExtractReport {
    pub success: bool,
    pub extracted_count: usize,
    pub output_dir: String,
    pub extracted_files: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadPackReport {
    pub success: bool,
    pub packed_count: usize,
    pub archive_base64: String,
    pub archive_size: usize,
}

pub fn compression_name(c_type: u8) -> &'static str {
    match c_type {
        0 => "Uncompressed",
        1 => "GZip",
        2 => "ChunkedZstd",
        3 => "Zstd",
        _ => "Unknown",
    }
}

pub fn parse_wad(bytes: &[u8]) -> Result<(u8, u8, Vec<WadEntry>), String> {
    if bytes.len() < 8 {
        return Err("WAD archive is too small to contain a header.".into());
    }
    if &bytes[0..4] != WAD_MAGIC {
        return Err(format!(
            "Invalid WAD magic: expected 'RWAC', found {:?}",
            &bytes[0..4]
        ));
    }

    let major = bytes[4];
    let minor = bytes[5];

    if major != 3 {
        return Err(format!(
            "Unsupported WAD major version {major}. Supported is WAD v3."
        ));
    }

    let mut cursor = Cursor::new(bytes);

    let (entry_count, entry_header_offset) = if minor == 0 {
        cursor.set_position(6);
        let mut count_buf = [0u8; 4];
        cursor
            .read_exact(&mut count_buf)
            .map_err(|e| format!("Failed to read entry count: {e}"))?;
        let count = u32::from_le_bytes(count_buf) as usize;
        (count, 10u64)
    } else {
        // v3.1+: 256 bytes signature + 8 bytes checksum + 4 bytes entry count
        if bytes.len() < 274 {
            return Err("WAD v3.1+ archive is truncated before entry count.".into());
        }
        cursor.set_position(270);
        let mut count_buf = [0u8; 4];
        cursor
            .read_exact(&mut count_buf)
            .map_err(|e| format!("Failed to read entry count: {e}"))?;
        let count = u32::from_le_bytes(count_buf) as usize;
        (count, 274u64)
    };

    if entry_count > 50000 {
        return Err(format!(
            "Excessive WAD entry count ({entry_count}) exceeds safety limit."
        ));
    }

    cursor.set_position(entry_header_offset);
    let mut entries = Vec::with_capacity(entry_count);

    for i in 0..entry_count {
        let mut hash_buf = [0u8; 8];
        cursor
            .read_exact(&mut hash_buf)
            .map_err(|e| format!("Truncated entry {i} path hash: {e}"))?;
        let path_hash = u64::from_le_bytes(hash_buf);

        let mut offset_buf = [0u8; 4];
        cursor
            .read_exact(&mut offset_buf)
            .map_err(|e| format!("Truncated entry {i} offset: {e}"))?;
        let offset = u32::from_le_bytes(offset_buf);

        let mut comp_sz_buf = [0u8; 4];
        cursor
            .read_exact(&mut comp_sz_buf)
            .map_err(|e| format!("Truncated entry {i} compressed size: {e}"))?;
        let compressed_size = u32::from_le_bytes(comp_sz_buf);

        let mut uncomp_sz_buf = [0u8; 4];
        cursor
            .read_exact(&mut uncomp_sz_buf)
            .map_err(|e| format!("Truncated entry {i} uncompressed size: {e}"))?;
        let uncompressed_size = u32::from_le_bytes(uncomp_sz_buf);

        let mut type_buf = [0u8; 1];
        cursor
            .read_exact(&mut type_buf)
            .map_err(|e| format!("Truncated entry {i} type: {e}"))?;
        let compression_type = type_buf[0];

        let mut is_duplicate = false;
        if minor >= 1 {
            let mut dup_buf = [0u8; 1];
            cursor
                .read_exact(&mut dup_buf)
                .map_err(|e| format!("Truncated entry {i} duplicate flag: {e}"))?;
            is_duplicate = dup_buf[0] != 0;

            let mut chunk_buf = [0u8; 2];
            cursor
                .read_exact(&mut chunk_buf)
                .map_err(|e| format!("Truncated entry {i} chunk index: {e}"))?;

            if minor >= 3 {
                let mut sha_buf = [0u8; 8];
                cursor
                    .read_exact(&mut sha_buf)
                    .map_err(|e| format!("Truncated entry {i} SHA: {e}"))?;
            }
        }

        entries.push(WadEntry {
            path_hash,
            path_hash_hex: format!("0x{:016x}", path_hash),
            offset,
            compressed_size,
            uncompressed_size,
            compression_type,
            compression_name: compression_name(compression_type).to_string(),
            is_duplicate,
        });
    }

    Ok((major, minor, entries))
}

pub fn create_wad_v3(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut entries = Vec::new();
    let mut payload_data = Vec::new();

    // Standard header for v3.0:
    // Magic: RWAC (4 bytes)
    // Major: 3 (1 byte)
    // Minor: 0 (1 byte)
    // Entry count: u32 (4 bytes)
    // Entry table: 21 bytes per entry (8 hash + 4 offset + 4 comp_sz + 4 uncomp_sz + 1 type)
    let header_size = 10usize;
    let entry_size = 21usize;
    let total_header_size = header_size + (files.len() * entry_size);

    let mut current_offset = total_header_size as u32;

    for (rel_path, data) in files {
        let normalized = rel_path.replace('\\', "/").to_ascii_lowercase();
        let path_hash = xxhash64(normalized.as_bytes(), 0);
        let uncompressed_size = data.len() as u32;
        let compressed_size = uncompressed_size;
        let offset = current_offset;

        entries.push(WadEntry {
            path_hash,
            path_hash_hex: format!("0x{:016x}", path_hash),
            offset,
            compressed_size,
            uncompressed_size,
            compression_type: 0, // Uncompressed raw payload
            compression_name: "Uncompressed".to_string(),
            is_duplicate: false,
        });

        payload_data.extend_from_slice(data);
        current_offset += uncompressed_size;
    }

    let mut out = Vec::with_capacity(total_header_size + payload_data.len());
    out.extend_from_slice(WAD_MAGIC);
    out.push(3); // major
    out.push(0); // minor
    out.extend_from_slice(&(files.len() as u32).to_le_bytes());

    for entry in entries {
        out.extend_from_slice(&entry.path_hash.to_le_bytes());
        out.extend_from_slice(&entry.offset.to_le_bytes());
        out.extend_from_slice(&entry.compressed_size.to_le_bytes());
        out.extend_from_slice(&entry.uncompressed_size.to_le_bytes());
        out.push(entry.compression_type);
    }

    out.extend_from_slice(&payload_data);
    Ok(out)
}

#[tauri::command]
pub fn wad_inspect(archive_base64: String) -> Result<WadInspectionReport, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(&archive_base64)
        .map_err(|e| format!("Invalid base64 payload: {e}"))?;

    let (major, minor, entries) = parse_wad(&bytes)?;
    let mut total_uncompressed = 0u64;
    let mut total_compressed = 0u64;

    for entry in &entries {
        total_uncompressed += entry.uncompressed_size as u64;
        total_compressed += entry.compressed_size as u64;
    }

    Ok(WadInspectionReport {
        is_valid: true,
        major,
        minor,
        entry_count: entries.len(),
        entries,
        total_uncompressed_size: total_uncompressed,
        total_compressed_size: total_compressed,
    })
}

#[tauri::command]
pub fn wad_extract_files(
    archive_base64: String,
    target_dir: String,
) -> Result<WadExtractReport, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(&archive_base64)
        .map_err(|e| format!("Invalid base64 payload: {e}"))?;

    let (_, _, entries) = parse_wad(&bytes)?;
    let target_path = PathBuf::from(&target_dir);

    if !target_path.exists() {
        fs::create_dir_all(&target_path)
            .map_err(|e| format!("Failed to create target directory: {e}"))?;
    }

    let canonical_target = target_path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve target path: {e}"))?;

    let mut extracted_files = Vec::new();

    for entry in entries {
        let start = entry.offset as usize;
        let end = start + entry.compressed_size as usize;
        if end > bytes.len() {
            return Err(format!(
                "Entry {} bounds exceed archive size (offset {}, size {}, total {})",
                entry.path_hash_hex, entry.offset, entry.compressed_size, bytes.len()
            ));
        }

        let slice = &bytes[start..end];
        let file_name = format!("{}.bin", entry.path_hash_hex);
        let out_file_path = canonical_target.join(&file_name);

        // Security check: ensure path stays within canonical_target
        if !out_file_path.starts_with(&canonical_target) {
            return Err("Path traversal attempt detected in WAD extraction.".into());
        }

        fs::write(&out_file_path, slice)
            .map_err(|e| format!("Failed to write file {}: {e}", file_name))?;

        extracted_files.push(file_name);
    }

    Ok(WadExtractReport {
        success: true,
        extracted_count: extracted_files.len(),
        output_dir: canonical_target.to_string_lossy().to_string(),
        extracted_files,
    })
}

#[tauri::command]
pub fn wad_pack_files(source_dir: String) -> Result<WadPackReport, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let source_path = PathBuf::from(&source_dir);
    if !source_path.exists() || !source_path.is_dir() {
        return Err("Source directory does not exist or is not a directory.".into());
    }

    let mut files = Vec::new();
    collect_files_recursive(&source_path, &source_path, &mut files)?;

    if files.is_empty() {
        return Err("Source directory contains no files to pack.".into());
    }

    let archive_bytes = create_wad_v3(&files)?;
    let archive_size = archive_bytes.len();
    let archive_base64 = STANDARD.encode(archive_bytes);

    Ok(WadPackReport {
        success: true,
        packed_count: files.len(),
        archive_base64,
        archive_size,
    })
}

fn collect_files_recursive(
    base: &Path,
    current: &Path,
    out: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| format!("Failed to read directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_files_recursive(base, &path, out)?;
        } else if path.is_file() {
            let rel_path = path
                .strip_prefix(base)
                .map_err(|e| format!("Failed to strip prefix: {e}"))?
                .to_string_lossy()
                .to_string();
            let content =
                fs::read(&path).map_err(|e| format!("Failed to read file {rel_path}: {e}"))?;
            out.push((rel_path, content));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xxhash64_basic() {
        let h1 = xxhash64(b"assets/characters/ahri/skins/skin00/ahri.skn", 0);
        let h2 = xxhash64(b"assets/characters/ahri/skins/skin00/ahri.skn", 0);
        assert_eq!(h1, h2);
        assert_ne!(h1, 0);

        let h_upper = xxhash64(b"ASSETS/CHARACTERS/AHRI/SKINS/SKIN00/AHRI.SKN", 0);
        assert_ne!(h1, h_upper); // case sensitivity of raw hash
    }

    #[test]
    fn test_wad_round_trip() {
        let files = vec![
            (
                "data/characters/ahri.bin".to_string(),
                b"PROP\x02\0\0\0\0\0\0\0".to_vec(),
            ),
            (
                "assets/characters/ahri/model.skn".to_string(),
                vec![0x12, 0x34, 0x56, 0x78],
            ),
        ];

        let archive = create_wad_v3(&files).expect("failed to create WAD archive");
        assert_eq!(&archive[0..4], b"RWAC");
        assert_eq!(archive[4], 3); // major
        assert_eq!(archive[5], 0); // minor

        let (major, minor, entries) = parse_wad(&archive).expect("failed to parse created WAD");
        assert_eq!(major, 3);
        assert_eq!(minor, 0);
        assert_eq!(entries.len(), 2);

        let hash_ahri = xxhash64(b"data/characters/ahri.bin", 0);
        let entry0 = &entries[0];
        assert_eq!(entry0.path_hash, hash_ahri);
        assert_eq!(entry0.uncompressed_size, 12);
        assert_eq!(entry0.compressed_size, 12);
        assert_eq!(entry0.compression_type, 0);

        let hash_model = xxhash64(b"assets/characters/ahri/model.skn", 0);
        let entry1 = &entries[1];
        assert_eq!(entry1.path_hash, hash_model);
        assert_eq!(entry1.uncompressed_size, 4);

        // Test inspection
        use base64::{engine::general_purpose::STANDARD, Engine};
        let b64 = STANDARD.encode(&archive);
        let inspection = wad_inspect(b64).expect("wad_inspect should succeed");
        assert!(inspection.is_valid);
        assert_eq!(inspection.entry_count, 2);
        assert_eq!(inspection.total_uncompressed_size, 16);
    }
}
