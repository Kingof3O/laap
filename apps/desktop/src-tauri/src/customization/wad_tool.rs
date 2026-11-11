use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

/// Primary League of Legends WAD magic (2 bytes: 'R', 'W').
pub const WAD_MAGIC: &[u8; 2] = b"RW";
/// Legacy 4-byte signature for backward compatibility.
pub const WAD_MAGIC_LEGACY: &[u8; 4] = b"RWAC";

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
    pub checksum: u64,
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
        2 => "FileRedirection",
        3 => "Zstd",
        4 => "ChunkedZstd",
        _ => "Unknown",
    }
}

/// Parses a League of Legends WAD archive according to CommunityDragon & League Toolkit specifications.
/// Supports WAD v3 (272-byte header, 32-byte entries), WAD v2, and WAD v1.
pub fn parse_wad(bytes: &[u8]) -> Result<(u8, u8, Vec<WadEntry>), String> {
    if bytes.len() < 4 {
        return Err("WAD archive is too small to contain a header.".into());
    }

    let is_standard_rw = &bytes[0..2] == WAD_MAGIC;
    let is_legacy_rwac = bytes.len() >= 4 && &bytes[0..4] == WAD_MAGIC_LEGACY;

    if !is_standard_rw && !is_legacy_rwac {
        return Err(format!(
            "Invalid WAD magic: expected 'RW' (0x5257), found 0x{:02x}{:02x}",
            bytes[0], bytes[1]
        ));
    }

    let (major, minor, entry_count, entry_offset, entry_size) = if is_standard_rw {
        let major = bytes[2];
        let minor = bytes[3];

        match major {
            3 => {
                // League WAD v3:
                // 0..2: "RW"
                // 2: major (3)
                // 3: minor
                // 4..260: ECDSA signature block (256 bytes)
                // 260..268: Checksum (8 bytes, u64)
                // 268..272: Entry count (4 bytes, u32)
                // Total header: 272 bytes (0x110)
                if bytes.len() < 272 {
                    return Err("WAD v3 archive is truncated before entry count.".into());
                }
                let mut count_buf = [0u8; 4];
                count_buf.copy_from_slice(&bytes[268..272]);
                let count = u32::from_le_bytes(count_buf) as usize;
                (major, minor, count, 272usize, 32usize)
            }
            2 => {
                // League WAD v2:
                // 0..2: "RW"
                // 2: major (2)
                // 3: minor
                // 4: ECDSA length (u8)
                if bytes.len() < 5 {
                    return Err("WAD v2 archive truncated at ECDSA length.".into());
                }
                let ecdsa_len = bytes[4] as usize;
                let header_sz = 5 + ecdsa_len + 8 + 4; // 5 + ecdsa + checksum(8) + count(4)
                if bytes.len() < header_sz {
                    return Err("WAD v2 archive truncated before entry count.".into());
                }
                let count_offset = 5 + ecdsa_len + 8;
                let mut count_buf = [0u8; 4];
                count_buf.copy_from_slice(&bytes[count_offset..count_offset + 4]);
                let count = u32::from_le_bytes(count_buf) as usize;
                (major, minor, count, header_sz, 32usize)
            }
            1 => {
                // League WAD v1:
                // 0..2: "RW"
                // 2: major (1)
                // 3: minor
                // 4..6: entry count (u16)
                if bytes.len() < 6 {
                    return Err("WAD v1 archive truncated before entry count.".into());
                }
                let mut count_buf = [0u8; 2];
                count_buf.copy_from_slice(&bytes[4..6]);
                let count = u16::from_le_bytes(count_buf) as usize;
                (major, minor, count, 6usize, 24usize)
            }
            _ => {
                return Err(format!(
                    "Unsupported WAD major version {major}. Supported versions are v1, v2, v3."
                ));
            }
        }
    } else {
        // Legacy fallback header layout (RWAC + major + minor + count)
        let major = bytes[4];
        let minor = bytes[5];
        let mut count_buf = [0u8; 4];
        if bytes.len() < 10 {
            return Err("Legacy WAD archive is truncated.".into());
        }
        count_buf.copy_from_slice(&bytes[6..10]);
        let count = u32::from_le_bytes(count_buf) as usize;
        (major, minor, count, 10usize, 21usize)
    };

    if entry_count > 100_000 {
        return Err(format!(
            "Excessive WAD entry count ({entry_count}) exceeds safety limit."
        ));
    }

    if bytes.len() < entry_offset + (entry_count * entry_size) {
        return Err("WAD archive truncated before entry table finishes.".into());
    }

    let mut cursor = Cursor::new(&bytes[entry_offset..]);
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
        let type_and_subchunks = type_buf[0];
        let compression_type = type_and_subchunks & 0x0F;

        let mut is_duplicate = false;
        let mut checksum = 0u64;

        if entry_size >= 32 {
            // Standard WAD v2 / v3 32-byte entry structure
            let mut dup_buf = [0u8; 1];
            cursor
                .read_exact(&mut dup_buf)
                .map_err(|e| format!("Truncated entry {i} duplicate flag: {e}"))?;
            is_duplicate = dup_buf[0] != 0;

            let mut subchunk_buf = [0u8; 2];
            cursor
                .read_exact(&mut subchunk_buf)
                .map_err(|e| format!("Truncated entry {i} subchunk index: {e}"))?;

            let mut csum_buf = [0u8; 8];
            cursor
                .read_exact(&mut csum_buf)
                .map_err(|e| format!("Truncated entry {i} checksum: {e}"))?;
            checksum = u64::from_le_bytes(csum_buf);
        } else if entry_size == 24 {
            // WAD v1: 3 padding bytes
            let mut pad = [0u8; 3];
            cursor
                .read_exact(&mut pad)
                .map_err(|e| format!("Truncated entry {i} padding: {e}"))?;
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
            checksum,
        });
    }

    Ok((major, minor, entries))
}

/// Creates a genuine League of Legends WAD v3 archive.
/// Follows the standard CommunityDragon / League Toolkit specification:
/// - 2-byte magic: b"RW"
/// - major: 3, minor: 0
/// - 256 bytes signature block (zeros)
/// - 8 bytes archive checksum (xxHash64)
/// - 4 bytes entry count (u32 le)
/// - 32-byte entries with xxHash64 path hash and uncompressed data checksum
pub fn create_wad_v3(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut entries = Vec::new();
    let mut payload_data = Vec::new();

    // Standard WAD v3 header:
    // Magic: "RW" (2 bytes)
    // Major: 3 (1 byte)
    // Minor: 0 (1 byte)
    // Signature block: 256 bytes (0x04..0x104)
    // Archive checksum: 8 bytes (0x104..0x10C)
    // Entry count: 4 bytes (0x10C..0x110)
    // Total archive header before entries = 272 bytes (0x110)
    let header_size = 272usize;
    let entry_size = 32usize;
    let total_header_size = header_size + (files.len() * entry_size);

    let mut current_offset = total_header_size as u32;

    for (rel_path, data) in files {
        let normalized = rel_path.replace('\\', "/").to_ascii_lowercase();
        let path_hash = xxhash64(normalized.as_bytes(), 0);
        let uncompressed_size = data.len() as u32;
        let compressed_size = uncompressed_size;
        let offset = current_offset;
        let checksum = xxhash64(data, 0);

        entries.push(WadEntry {
            path_hash,
            path_hash_hex: format!("0x{:016x}", path_hash),
            offset,
            compressed_size,
            uncompressed_size,
            compression_type: 0, // Uncompressed
            compression_name: "Uncompressed".to_string(),
            is_duplicate: false,
            checksum,
        });

        payload_data.extend_from_slice(data);
        current_offset += uncompressed_size;
    }

    let mut out = Vec::with_capacity(total_header_size + payload_data.len());
    // 0..2: Magic "RW"
    out.extend_from_slice(WAD_MAGIC);
    // 2: Major version 3
    out.push(3);
    // 3: Minor version 0
    out.push(0);
    // 4..260: 256-byte signature block
    out.extend_from_slice(&[0u8; 256]);
    // 260..268: 8-byte checksum (xxHash64 of payload or 0)
    let payload_csum = xxhash64(&payload_data, 0);
    out.extend_from_slice(&payload_csum.to_le_bytes());
    // 268..272: 4-byte entry count
    out.extend_from_slice(&(files.len() as u32).to_le_bytes());

    // 272+: 32-byte entries
    for entry in &entries {
        out.extend_from_slice(&entry.path_hash.to_le_bytes()); // 8 bytes
        out.extend_from_slice(&entry.offset.to_le_bytes()); // 4 bytes
        out.extend_from_slice(&entry.compressed_size.to_le_bytes()); // 4 bytes
        out.extend_from_slice(&entry.uncompressed_size.to_le_bytes()); // 4 bytes
        out.push(entry.compression_type & 0x0F); // 1 byte type
        out.push(if entry.is_duplicate { 1 } else { 0 }); // 1 byte duplicate flag
        out.extend_from_slice(&0u16.to_le_bytes()); // 2 bytes subchunk index
        out.extend_from_slice(&entry.checksum.to_le_bytes()); // 8 bytes entry checksum
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
    let total_uncompressed_size = entries.iter().map(|e| e.uncompressed_size as u64).sum();
    let total_compressed_size = entries.iter().map(|e| e.compressed_size as u64).sum();

    Ok(WadInspectionReport {
        is_valid: true,
        major,
        minor,
        entry_count: entries.len(),
        entries,
        total_uncompressed_size,
        total_compressed_size,
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
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }
    let canonical_target = target_path
        .canonicalize()
        .map_err(|e| format!("Target path canonicalization failed: {e}"))?;

    let mut extracted_files = Vec::new();

    for entry in &entries {
        let start = entry.offset as usize;
        let end = start + (entry.compressed_size as usize);

        if end > bytes.len() {
            return Err(format!(
                "Corrupted WAD entry {}: offset {} + size {} exceeds total archive size {}.",
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
        test_wad_v3_standard_compliance();
    }

    #[test]
    fn test_wad_v3_standard_compliance() {
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

        let archive = create_wad_v3(&files).expect("failed to create standard WAD v3 archive");
        // Verify genuine League 2-byte magic 'RW'
        assert_eq!(&archive[0..2], b"RW");
        assert_eq!(archive[2], 3); // major = 3
        assert_eq!(archive[3], 0); // minor = 0

        // 256 bytes signature block (starts at 4, ends at 260)
        assert_eq!(&archive[4..260], &[0u8; 256]);

        // 4 bytes entry count at offset 268 (0x10C)
        let count = u32::from_le_bytes(archive[268..272].try_into().unwrap());
        assert_eq!(count, 2);

        // Header offset before entries is exactly 272 (0x110)
        let entry_table_start = 272usize;
        // Each entry is exactly 32 bytes (0x20)
        let entry0_bytes = &archive[entry_table_start..entry_table_start + 32];
        let hash_ahri = xxhash64(b"data/characters/ahri.bin", 0);
        let entry0_hash = u64::from_le_bytes(entry0_bytes[0..8].try_into().unwrap());
        assert_eq!(entry0_hash, hash_ahri);

        // Offset check: entry 0 data starts right after entry table
        let expected_data_offset = (272 + 2 * 32) as u32;
        let entry0_offset = u32::from_le_bytes(entry0_bytes[8..12].try_into().unwrap());
        assert_eq!(entry0_offset, expected_data_offset);

        // Checksum verification
        let entry0_csum = u64::from_le_bytes(entry0_bytes[24..32].try_into().unwrap());
        assert_eq!(entry0_csum, xxhash64(b"PROP\x02\0\0\0\0\0\0\0", 0));

        // Full round-trip parsing test
        let (major, minor, entries) = parse_wad(&archive).expect("failed to parse standard WAD");
        assert_eq!(major, 3);
        assert_eq!(minor, 0);
        assert_eq!(entries.len(), 2);

        let entry0 = &entries[0];
        assert_eq!(entry0.path_hash, hash_ahri);
        assert_eq!(entry0.uncompressed_size, 12);
        assert_eq!(entry0.compressed_size, 12);
        assert_eq!(entry0.compression_type, 0);
        assert_eq!(entry0.checksum, entry0_csum);

        let hash_model = xxhash64(b"assets/characters/ahri/model.skn", 0);
        let entry1 = &entries[1];
        assert_eq!(entry1.path_hash, hash_model);
        assert_eq!(entry1.uncompressed_size, 4);

        // Inspection report test
        use base64::{engine::general_purpose::STANDARD, Engine};
        let b64 = STANDARD.encode(&archive);
        let inspection = wad_inspect(b64).expect("wad_inspect should succeed");
        assert!(inspection.is_valid);
        assert_eq!(inspection.major, 3);
        assert_eq!(inspection.minor, 0);
        assert_eq!(inspection.entry_count, 2);
        assert_eq!(inspection.total_uncompressed_size, 16);
    }
}
