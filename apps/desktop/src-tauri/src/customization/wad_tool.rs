use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_path: Option<String>,
    #[serde(default, skip)]
    pub(crate) frame_count: u8,
    #[serde(default, skip)]
    pub(crate) start_frame: u32,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picked_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archive_size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_count: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadExtractReport {
    pub success: bool,
    pub extracted_count: usize,
    pub output_dir: String,
    pub extracted_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GameWadArchiveSummary {
    pub relative_path: String,
    pub file_name: String,
    pub category: String,
    pub champion_hint: Option<String>,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WadHashDictionaryStatus {
    pub installed: bool,
    pub entry_count: usize,
    pub path: Option<String>,
    pub file_size_bytes: u64,
    pub detail: String,
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

/// Decompresses a single chunk of WAD archive data safely.
/// Handles uncompressed (0), GZip (1), and Zstd (3) compression formats.
/// Applies strict size bounds to prevent decompression bombs and verifies checksums.
pub fn decompress_wad_chunk(
    raw_slice: &[u8],
    compression_type: u8,
    uncompressed_size: usize,
    expected_checksum: u64,
) -> Result<Vec<u8>, String> {
    const MAX_SINGLE_CHUNK_UNCOMPRESSED: usize = 128 * 1024 * 1024; // 128 MiB safety bound
    if uncompressed_size > MAX_SINGLE_CHUNK_UNCOMPRESSED {
        return Err(format!(
            "Uncompressed chunk size ({uncompressed_size} bytes) exceeds safety quota of {MAX_SINGLE_CHUNK_UNCOMPRESSED} bytes."
        ));
    }

    let decompressed = match compression_type {
        0 => raw_slice.to_vec(),
        1 => {
            // GZip compression
            use flate2::read::GzDecoder;
            let mut decoder = GzDecoder::new(raw_slice);
            let mut out = Vec::with_capacity(uncompressed_size);
            decoder
                .by_ref()
                .take((uncompressed_size as u64) + 1)
                .read_to_end(&mut out)
                .map_err(|e| format!("GZip chunk decompression failed: {e}"))?;
            out
        }
        3 => {
            // Zstd compression
            let mut out = Vec::with_capacity(uncompressed_size);
            let mut decoder = zstd::Decoder::new(raw_slice)
                .map_err(|e| format!("Failed to initialize Zstd decoder: {e}"))?;
            decoder
                .by_ref()
                .take((uncompressed_size as u64) + 1)
                .read_to_end(&mut out)
                .map_err(|e| format!("Zstd chunk decompression failed: {e}"))?;
            out
        }
        other => {
            return Err(format!(
                "Unsupported WAD chunk compression type {other} ({})",
                compression_name(other)
            ));
        }
    };

    if decompressed.len() != uncompressed_size {
        return Err(format!(
            "Decompressed size mismatch: expected {} bytes, got {} bytes.",
            uncompressed_size,
            decompressed.len()
        ));
    }

    if expected_checksum != 0 {
        let decomp_csum = xxhash64(&decompressed, 0);
        if decomp_csum != expected_checksum {
            let raw_csum = xxhash64(raw_slice, 0);
            let xxh3_csum = xxhash_rust::xxh3::xxh3_64(raw_slice);
            if raw_csum != expected_checksum && xxh3_csum != expected_checksum {
                return Err(format!(
                    "Chunk checksum mismatch: expected 0x{:016x}, got 0x{:016x}",
                    expected_checksum, decomp_csum
                ));
            }
        }
    }

    Ok(decompressed)
}

/// Parses a League of Legends WAD archive from any seekable reader without buffering the archive body.
/// Supports WAD v3 (272-byte header, 32-byte and 33-byte entries), WAD v2, and WAD v1.
pub fn parse_wad_reader<R: Read + Seek>(
    reader: &mut R,
    total_len: u64,
) -> Result<(u8, u8, Vec<WadEntry>), String> {
    if total_len < 4 {
        return Err("WAD archive is too small to contain a header.".into());
    }

    reader
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek WAD header: {e}"))?;
    let mut head4 = [0u8; 4];
    reader
        .read_exact(&mut head4)
        .map_err(|e| format!("Failed to read WAD header: {e}"))?;

    let is_standard_rw = &head4[0..2] == WAD_MAGIC;
    let is_legacy_rwac = &head4[0..4] == WAD_MAGIC_LEGACY;

    if !is_standard_rw && !is_legacy_rwac {
        return Err(format!(
            "Invalid WAD magic: expected 'RW' (0x5257), found 0x{:02x}{:02x}",
            head4[0], head4[1]
        ));
    }

    let (major, minor, entry_count, entry_offset, entry_size) = if is_standard_rw {
        let major = head4[2];
        let minor = head4[3];

        match major {
            3 => {
                // League WAD v3: 272-byte header (0x110) with entry count at offset 268..272.
                if total_len < 272 {
                    return Err("WAD v3 archive is truncated before entry count.".into());
                }
                reader
                    .seek(SeekFrom::Start(268))
                    .map_err(|e| format!("Failed to seek WAD v3 entry count: {e}"))?;
                let mut count_buf = [0u8; 4];
                reader
                    .read_exact(&mut count_buf)
                    .map_err(|e| format!("Failed to read WAD v3 entry count: {e}"))?;
                let count = u32::from_le_bytes(count_buf) as usize;

                // Support both standard 32-byte entries and legacy 33-byte entries for v3.0..=v3.3
                let legacy_table_end = 272u64.saturating_add((count as u64).saturating_mul(33));
                let entry_size = if minor < 4 && count > 0 && total_len >= legacy_table_end {
                    reader
                        .seek(SeekFrom::Start(280))
                        .map_err(|e| format!("Failed to inspect WAD v3 entry offset: {e}"))?;
                    let mut off_buf = [0u8; 4];
                    reader
                        .read_exact(&mut off_buf)
                        .map_err(|e| format!("Failed to read WAD v3 first entry offset: {e}"))?;
                    let off = u32::from_le_bytes(off_buf) as usize;
                    if off >= 272 + count * 33 && (off == 272 + count * 33 || off % 4 == 0) {
                        33usize
                    } else {
                        32usize
                    }
                } else {
                    32usize
                };

                (major, minor, count, 272usize, entry_size)
            }
            2 => {
                if total_len < 5 {
                    return Err("WAD v2 archive truncated at ECDSA length.".into());
                }
                let mut ecdsa_buf = [0u8; 1];
                reader
                    .read_exact(&mut ecdsa_buf)
                    .map_err(|e| format!("Failed to read WAD v2 ECDSA length: {e}"))?;
                let ecdsa_len = ecdsa_buf[0] as usize;
                let header_sz = 5 + ecdsa_len + 8 + 4;
                if total_len < header_sz as u64 {
                    return Err("WAD v2 archive truncated before entry count.".into());
                }
                let count_offset = 5 + ecdsa_len + 8;
                reader
                    .seek(SeekFrom::Start(count_offset as u64))
                    .map_err(|e| format!("Failed to seek WAD v2 entry count: {e}"))?;
                let mut count_buf = [0u8; 4];
                reader
                    .read_exact(&mut count_buf)
                    .map_err(|e| format!("Failed to read WAD v2 entry count: {e}"))?;
                let count = u32::from_le_bytes(count_buf) as usize;
                (major, minor, count, header_sz, 32usize)
            }
            1 => {
                if total_len < 6 {
                    return Err("WAD v1 archive truncated before entry count.".into());
                }
                let mut count_buf = [0u8; 2];
                reader
                    .read_exact(&mut count_buf)
                    .map_err(|e| format!("Failed to read WAD v1 entry count: {e}"))?;
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
        if total_len < 10 {
            return Err("Legacy WAD archive is truncated.".into());
        }
        let mut legacy_hdr = [0u8; 6];
        reader
            .read_exact(&mut legacy_hdr)
            .map_err(|e| format!("Failed to read legacy WAD header: {e}"))?;
        let major = legacy_hdr[0];
        let minor = legacy_hdr[1];
        let count = u32::from_le_bytes([legacy_hdr[2], legacy_hdr[3], legacy_hdr[4], legacy_hdr[5]]) as usize;
        (major, minor, count, 10usize, 21usize)
    };

    if entry_count > 100_000 {
        return Err(format!(
            "Excessive WAD entry count ({entry_count}) exceeds safety limit."
        ));
    }

    let table_bytes = (entry_count as u64)
        .checked_mul(entry_size as u64)
        .ok_or_else(|| "WAD entry table size overflow.".to_string())?;
    let table_end = (entry_offset as u64)
        .checked_add(table_bytes)
        .ok_or_else(|| "WAD entry table offset overflow.".to_string())?;
    if total_len < table_end {
        return Err("WAD archive truncated before entry table finishes.".into());
    }

    reader
        .seek(SeekFrom::Start(entry_offset as u64))
        .map_err(|e| format!("Failed to seek WAD entry table: {e}"))?;
    let mut table_buf = vec![0u8; table_bytes as usize];
    reader
        .read_exact(&mut table_buf)
        .map_err(|e| format!("Failed to read WAD entry table: {e}"))?;

    let mut cursor = Cursor::new(&table_buf);
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
        let mut frame_count = 0u8;
        let mut start_frame = 0u32;

        if entry_size == 33 {
            let mut dup_buf = [0u8; 1];
            cursor
                .read_exact(&mut dup_buf)
                .map_err(|e| format!("Truncated entry {i} duplicate flag: {e}"))?;
            is_duplicate = dup_buf[0] != 0;

            let mut subchunk_buf = [0u8; 2];
            cursor
                .read_exact(&mut subchunk_buf)
                .map_err(|e| format!("Truncated entry {i} subchunk index: {e}"))?;

            let mut subchunk_count_buf = [0u8; 1];
            cursor
                .read_exact(&mut subchunk_count_buf)
                .map_err(|e| format!("Truncated entry {i} subchunk count: {e}"))?;

            let mut csum_buf = [0u8; 8];
            cursor
                .read_exact(&mut csum_buf)
                .map_err(|e| format!("Truncated entry {i} checksum: {e}"))?;
            checksum = u64::from_le_bytes(csum_buf);
        } else if entry_size >= 32 {
            if major == 3 && minor >= 4 {
                frame_count = type_and_subchunks >> 4;
                let mut frame_buf = [0u8; 3];
                cursor
                    .read_exact(&mut frame_buf)
                    .map_err(|e| format!("Truncated entry {i} start frame: {e}"))?;
                start_frame = ((frame_buf[0] as u32) << 16)
                    | (frame_buf[1] as u32)
                    | ((frame_buf[2] as u32) << 8);
            } else {
                let mut dup_buf = [0u8; 1];
                cursor
                    .read_exact(&mut dup_buf)
                    .map_err(|e| format!("Truncated entry {i} duplicate flag: {e}"))?;
                is_duplicate = dup_buf[0] != 0;

                let mut subchunk_buf = [0u8; 2];
                cursor
                    .read_exact(&mut subchunk_buf)
                    .map_err(|e| format!("Truncated entry {i} subchunk index: {e}"))?;
            }

            let mut csum_buf = [0u8; 8];
            cursor
                .read_exact(&mut csum_buf)
                .map_err(|e| format!("Truncated entry {i} checksum: {e}"))?;
            checksum = u64::from_le_bytes(csum_buf);
        } else if entry_size == 24 {
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
            resolved_path: None,
            frame_count,
            start_frame,
        });
    }

    Ok((major, minor, entries))
}

/// Parses a League of Legends WAD archive according to CommunityDragon & League Toolkit specifications.
/// Supports WAD v3 (272-byte header, 32-byte and 33-byte entries), WAD v2, and WAD v1.
pub fn parse_wad(bytes: &[u8]) -> Result<(u8, u8, Vec<WadEntry>), String> {
    let mut cursor = Cursor::new(bytes);
    parse_wad_reader(&mut cursor, bytes.len() as u64)
}

/// Creates a genuine League of Legends WAD v3 archive.
/// Follows the standard CommunityDragon / League Toolkit specification:
/// - 2-byte magic: b"RW"
/// - major: 3, minor: 4 (modern League standard)
/// - 256 bytes signature block (zeros)
/// - 8 bytes archive checksum (xxHash64)
/// - 4 bytes entry count (u32 le)
/// - Entries sorted strictly by path_hash in ascending order
/// - 32-byte entries with xxHash64 path hash and uncompressed data checksum
pub fn create_wad_v3(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut sorted_files: Vec<(String, u64, &[u8])> = files
        .iter()
        .map(|(path, data)| {
            let normalized = path.replace('\\', "/").to_ascii_lowercase();
            let path_hash = xxhash64(normalized.as_bytes(), 0);
            (normalized, path_hash, data.as_slice())
        })
        .collect();
    // Sort strictly by path hash ascending - League Toolkit and League require ascending path_hash order!
    sorted_files.sort_by_key(|item| item.1);

    let header_size = 272usize;
    let entry_size = 32usize;
    let total_header_size = header_size + (sorted_files.len() * entry_size);

    let mut current_offset = total_header_size as u32;
    let mut entries = Vec::with_capacity(sorted_files.len());
    let mut payload_data = Vec::new();

    for (_, path_hash, data) in &sorted_files {
        let uncompressed_size = data.len() as u32;
        let compressed_size = uncompressed_size;
        let offset = current_offset;
        let checksum = xxhash64(data, 0);

        entries.push(WadEntry {
            path_hash: *path_hash,
            path_hash_hex: format!("0x{:016x}", path_hash),
            offset,
            compressed_size,
            uncompressed_size,
            compression_type: 0, // Uncompressed
            compression_name: "Uncompressed".to_string(),
            is_duplicate: false,
            checksum,
            resolved_path: None,
            frame_count: 0,
            start_frame: 0,
        });

        payload_data.extend_from_slice(data);
        current_offset += uncompressed_size;
    }

    let mut out = Vec::with_capacity(total_header_size + payload_data.len());
    // 0..2: Magic "RW"
    out.extend_from_slice(WAD_MAGIC);
    // 2: Major version 3
    out.push(3);
    // 3: Minor version 4 (modern League standard)
    out.push(4);
    // 4..260: 256-byte signature block
    out.extend_from_slice(&[0u8; 256]);
    // 260..268: 8-byte checksum (xxHash64 of payload or 0)
    let payload_csum = xxhash64(&payload_data, 0);
    out.extend_from_slice(&payload_csum.to_le_bytes());
    // 268..272: 4-byte entry count
    out.extend_from_slice(&(sorted_files.len() as u32).to_le_bytes());

    // 272+: 32-byte entries (v3.4 layout)
    for entry in &entries {
        out.extend_from_slice(&entry.path_hash.to_le_bytes()); // 8 bytes
        out.extend_from_slice(&entry.offset.to_le_bytes()); // 4 bytes
        out.extend_from_slice(&entry.compressed_size.to_le_bytes()); // 4 bytes
        out.extend_from_slice(&entry.uncompressed_size.to_le_bytes()); // 4 bytes
        out.push(entry.compression_type & 0x0F); // 1 byte type
        out.extend_from_slice(&[0u8; 3]); // 3 bytes start_frame (v3.4 24-bit start frame)
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

    let bytes_len = bytes.len() as u64;
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
        source_label: None,
        picked_token: None,
        archive_size_bytes: Some(bytes_len),
        resolved_count: None,
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

    let total: u64 = entries.iter().map(|e| u64::from(e.uncompressed_size)).sum();
    if total > 512 * 1024 * 1024 { return Err("Extraction exceeds the 512 MiB output quota".into()); }
    let target_path = PathBuf::from(&target_dir);
    super::sandbox::check_chain(&target_path, true)?;
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
        let decompressed = decompress_wad_chunk(
            slice,
            entry.compression_type,
            entry.uncompressed_size as usize,
            entry.checksum,
        )?;

        let file_name = format!("{}.bin", entry.path_hash_hex);
        let out_file_path = canonical_target.join(&file_name);

        // Security check: ensure path stays within canonical_target
        if !out_file_path.starts_with(&canonical_target) {
            return Err("Path traversal attempt detected in WAD extraction.".into());
        }

        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&out_file_path)
            .map_err(|e| format!("Will not overwrite extraction entry {file_name}: {e}"))?;
        output.write_all(&decompressed).map_err(|e| format!("Failed to write {file_name}: {e}"))?;

        extracted_files.push(file_name);
    }

    Ok(WadExtractReport {
        success: true,
        extracted_count: extracted_files.len(),
        output_dir: canonical_target.to_string_lossy().to_string(),
        extracted_files,
        project_id: None,
        project_name: None,
    })
}

#[tauri::command]
pub async fn wad_extract_local(app: tauri::AppHandle, archive_base64: String) -> Result<WadExtractReport, String> {
    if archive_base64.len() > (32usize * 1024 * 1024).div_ceil(3) * 4 {
        return Err("WAD extraction input exceeds 32 MiB".into());
    }
    let root = super::storage::root(&app)?.join("wad_exports");
    super::sandbox::check_chain(&root, true)?;
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let destination = root.join(format!("{:032x}", u128::from_be_bytes(random)));
    tauri::async_runtime::spawn_blocking(move || wad_extract_files(archive_base64, destination.to_string_lossy().into_owned()))
        .await.map_err(|e| e.to_string())?
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

const MAX_HASH_DICT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_HASH_DICT_LINES: usize = 3_000_000;
const MAX_GAME_SCAN_DEPTH: usize = 4;
const MAX_PICKED_ARCHIVE_CACHE: usize = 8;
const MAX_CREATOR_IMPORT_BYTES: u64 = 5 * 1024 * 1024;
const MAX_CREATOR_IMPORT_FILES: usize = 200;
const MAX_EXPORT_EXTRACT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES: usize = 5_000;

static PICKED_ARCHIVES: OnceLock<Mutex<Vec<(String, PathBuf)>>> = OnceLock::new();

fn picked_archives_store() -> &'static Mutex<Vec<(String, PathBuf)>> {
    PICKED_ARCHIVES.get_or_init(|| Mutex::new(Vec::new()))
}

fn register_picked_archive(path: PathBuf) -> Result<String, String> {
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let token = format!("picked-{:032x}", u128::from_be_bytes(random));
    let mut guard = picked_archives_store()
        .lock()
        .map_err(|_| "Picked archive registry lock failed.".to_string())?;
    if guard.len() >= MAX_PICKED_ARCHIVE_CACHE {
        guard.remove(0);
    }
    guard.push((token.clone(), path));
    Ok(token)
}

fn resolve_picked_archive(token: &str) -> Result<PathBuf, String> {
    let path = {
        let guard = picked_archives_store()
            .lock()
            .map_err(|_| "Picked archive registry lock failed.".to_string())?;
        guard
            .iter()
            .rev()
            .find(|(t, _)| t == token)
            .map(|(_, p)| p.clone())
            .ok_or_else(|| "Picked WAD archive reference expired or was not found; pick the file again.".to_string())?
    };
    super::game_path::ensure_safe_existing_entry(&path, false)?;
    Ok(path)
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct WadSubchunkRecord {
    compressed_size: u32,
    uncompressed_size: u32,
    #[allow(dead_code)]
    checksum: u64,
}

pub(crate) fn detect_subchunk_toc<R: Read + Seek>(
    reader: &mut R,
    total_len: u64,
    entries: &[WadEntry],
) -> Option<Vec<WadSubchunkRecord>> {
    const RECORD_SIZE: usize = 16;
    let max_frames = entries
        .iter()
        .filter(|e| e.compression_type == 4)
        .map(|e| (e.start_frame as usize).saturating_add(e.frame_count as usize))
        .max()?;
    if max_frames == 0 {
        return None;
    }
    let expected_toc_bytes = max_frames.checked_mul(RECORD_SIZE)?;

    for candidate in entries
        .iter()
        .filter(|e| e.uncompressed_size as usize == expected_toc_bytes && e.compression_type != 2)
    {
        let start = candidate.offset as u64;
        let end = start.checked_add(candidate.compressed_size as u64)?;
        if end > total_len || candidate.compressed_size > 32 * 1024 * 1024 {
            continue;
        }
        if reader.seek(SeekFrom::Start(start)).is_err() {
            continue;
        }
        let mut raw = vec![0u8; candidate.compressed_size as usize];
        if reader.read_exact(&mut raw).is_err() {
            continue;
        }
        let Ok(decompressed) = decompress_wad_chunk(
            &raw,
            candidate.compression_type,
            candidate.uncompressed_size as usize,
            candidate.checksum,
        ) else {
            continue;
        };
        if decompressed.len() != expected_toc_bytes {
            continue;
        }
        let records: Vec<WadSubchunkRecord> = decompressed
            .chunks_exact(RECORD_SIZE)
            .map(|rec| WadSubchunkRecord {
                compressed_size: u32::from_le_bytes([rec[0], rec[1], rec[2], rec[3]]),
                uncompressed_size: u32::from_le_bytes([rec[4], rec[5], rec[6], rec[7]]),
                checksum: u64::from_le_bytes([
                    rec[8], rec[9], rec[10], rec[11], rec[12], rec[13], rec[14], rec[15],
                ]),
            })
            .collect();

        let valid = entries
            .iter()
            .filter(|e| e.compression_type == 4)
            .all(|e| {
                let s = e.start_frame as usize;
                let end_idx = s.saturating_add(e.frame_count as usize);
                records.get(s..end_idx).is_some_and(|slice| {
                    let comp_sum: u64 = slice.iter().map(|r| r.compressed_size as u64).sum();
                    let uncomp_sum: u64 = slice.iter().map(|r| r.uncompressed_size as u64).sum();
                    comp_sum == e.compressed_size as u64 && uncomp_sum == e.uncompressed_size as u64
                })
            });
        if valid {
            return Some(records);
        }
    }
    None
}

pub(crate) fn decompress_entry_from_reader<R: Read + Seek>(
    reader: &mut R,
    total_len: u64,
    entry: &WadEntry,
    toc: Option<&[WadSubchunkRecord]>,
) -> Result<Vec<u8>, String> {
    if entry.compression_type == 2 {
        return Err(format!(
            "Entry {} is a FileRedirection pointer rather than extractable asset bytes.",
            entry.path_hash_hex
        ));
    }
    let start = entry.offset as u64;
    let end = start
        .checked_add(entry.compressed_size as u64)
        .ok_or_else(|| format!("Entry {} offset overflow.", entry.path_hash_hex))?;
    if end > total_len {
        return Err(format!(
            "Corrupted WAD entry {}: offset {} + size {} exceeds archive size {}.",
            entry.path_hash_hex, entry.offset, entry.compressed_size, total_len
        ));
    }
    if (entry.compressed_size as u64) > MAX_EXPORT_EXTRACT_BYTES {
        return Err(format!(
            "Entry {} compressed size exceeds safety limit.",
            entry.path_hash_hex
        ));
    }
    reader
        .seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek entry {}: {e}", entry.path_hash_hex))?;
    let mut raw = vec![0u8; entry.compressed_size as usize];
    reader
        .read_exact(&mut raw)
        .map_err(|e| format!("Failed to read entry {}: {e}", entry.path_hash_hex))?;

    if entry.compression_type != 4 {
        return decompress_wad_chunk(
            &raw,
            entry.compression_type,
            entry.uncompressed_size as usize,
            entry.checksum,
        );
    }

    let records = toc.ok_or_else(|| {
        format!(
            "Entry {} uses ZstdMulti (type 4) but no valid SubChunkTOC was found in archive.",
            entry.path_hash_hex
        )
    })?;
    let s = entry.start_frame as usize;
    let e_idx = s.saturating_add(entry.frame_count as usize);
    let subchunks = records.get(s..e_idx).ok_or_else(|| {
        format!(
            "Entry {} references missing SubChunkTOC frames {}..{}.",
            entry.path_hash_hex, s, e_idx
        )
    })?;

    let mut out = Vec::with_capacity(entry.uncompressed_size as usize);
    let mut cursor = 0usize;
    for (idx, sub) in subchunks.iter().enumerate() {
        let next = cursor
            .checked_add(sub.compressed_size as usize)
            .ok_or_else(|| "Subchunk offset overflow.".to_string())?;
        let slice = raw.get(cursor..next).ok_or_else(|| {
            format!(
                "Truncated ZstdMulti subchunk {idx} in entry {}.",
                entry.path_hash_hex
            )
        })?;
        cursor = next;
        if sub.compressed_size == sub.uncompressed_size {
            out.extend_from_slice(slice);
        } else {
            let mut dec = zstd::Decoder::new(slice)
                .map_err(|e| format!("Failed to initialize ZstdMulti subchunk {idx} decoder: {e}"))?;
            let mut part = Vec::with_capacity(sub.uncompressed_size as usize);
            dec.by_ref()
                .take((sub.uncompressed_size as u64) + 1)
                .read_to_end(&mut part)
                .map_err(|e| format!("ZstdMulti subchunk {idx} decompression failed: {e}"))?;
            if part.len() != sub.uncompressed_size as usize {
                return Err(format!(
                    "ZstdMulti subchunk {idx} size mismatch: expected {} got {}.",
                    sub.uncompressed_size,
                    part.len()
                ));
            }
            out.extend_from_slice(&part);
        }
    }

    if out.len() != entry.uncompressed_size as usize {
        return Err(format!(
            "ZstdMulti total decompressed size mismatch for {}: expected {}, got {}.",
            entry.path_hash_hex,
            entry.uncompressed_size,
            out.len()
        ));
    }
    Ok(out)
}

fn hash_dictionary_path(customization_root: &Path) -> PathBuf {
    customization_root.join("wad_hashes").join("hashes.game.txt")
}

fn parse_hash_key(raw: &str) -> Result<u64, String> {
    let trimmed = raw
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    if trimmed.is_empty() || trimmed.len() > 16 || !trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid WAD path hash '{raw}'."));
    }
    u64::from_str_radix(trimmed, 16).map_err(|e| format!("Invalid WAD path hash '{raw}': {e}"))
}

fn parse_hash_dictionary_reader<R: Read>(reader: R) -> Result<HashMap<u64, String>, String> {
    let buf = BufReader::new(reader.take(MAX_HASH_DICT_BYTES + 1));
    let mut map = HashMap::new();
    for (idx, line_res) in buf.lines().enumerate() {
        if idx >= MAX_HASH_DICT_LINES {
            break;
        }
        let line = line_res.map_err(|e| format!("Failed reading hash dictionary line {idx}: {e}"))?;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }
        let Some((hash_part, path_part)) = trimmed.split_once(|c: char| c.is_ascii_whitespace()) else {
            continue;
        };
        let Ok(hash) = parse_hash_key(hash_part) else {
            continue;
        };
        let normalized_path = path_part.trim().replace('\\', "/");
        if normalized_path.is_empty() {
            continue;
        }
        map.insert(hash, normalized_path);
    }
    Ok(map)
}

pub(crate) fn get_hash_dictionary_status_at(
    customization_root: &Path,
) -> Result<WadHashDictionaryStatus, String> {
    let dict_path = hash_dictionary_path(customization_root);
    if !dict_path.exists() {
        return Ok(WadHashDictionaryStatus {
            installed: false,
            entry_count: 0,
            path: None,
            file_size_bytes: 0,
            detail: "No optional CDTB hash dictionary imported. Entries display xxHash64 hex IDs cleanly.".into(),
        });
    }
    super::game_path::ensure_safe_existing_entry(&dict_path, false)?;
    let meta = fs::symlink_metadata(&dict_path)
        .map_err(|e| format!("Failed reading hash dictionary metadata: {e}"))?;
    if meta.len() > MAX_HASH_DICT_BYTES {
        return Err("Stored hash dictionary exceeds 128 MiB safety limit.".into());
    }
    let file = File::open(&dict_path).map_err(|e| format!("Failed opening hash dictionary: {e}"))?;
    let map = parse_hash_dictionary_reader(file)?;
    Ok(WadHashDictionaryStatus {
        installed: true,
        entry_count: map.len(),
        path: Some(dict_path.to_string_lossy().into_owned()),
        file_size_bytes: meta.len(),
        detail: format!("Loaded {} path hashes from local dictionary.", map.len()),
    })
}

pub(crate) fn import_hash_dictionary_at(
    customization_root: &Path,
    source_path: &Path,
) -> Result<WadHashDictionaryStatus, String> {
    super::game_path::ensure_safe_existing_entry(source_path, false)?;
    let meta = fs::symlink_metadata(source_path)
        .map_err(|e| format!("Failed inspecting selected hash file: {e}"))?;
    if meta.len() > MAX_HASH_DICT_BYTES {
        return Err("Selected hash dictionary exceeds 128 MiB safety limit.".into());
    }
    let file = File::open(source_path).map_err(|e| format!("Failed opening hash file: {e}"))?;
    let parsed = parse_hash_dictionary_reader(file)?;
    if parsed.is_empty() {
        return Err("Selected file contains no valid '<hexhash> <path>' mappings.".into());
    }

    let dest = hash_dictionary_path(customization_root);
    if let Some(parent) = dest.parent() {
        super::sandbox::check_chain(parent, true)?;
        fs::create_dir_all(parent).map_err(|e| format!("Failed creating hash folder: {e}"))?;
    }
    fs::copy(source_path, &dest).map_err(|e| format!("Failed saving hash dictionary: {e}"))?;
    get_hash_dictionary_status_at(customization_root)
}

fn load_hash_dictionary_at(customization_root: &Path) -> HashMap<u64, String> {
    let dict_path = hash_dictionary_path(customization_root);
    if super::game_path::ensure_safe_existing_entry(&dict_path, false).is_err() {
        return HashMap::new();
    }
    let Ok(meta) = fs::symlink_metadata(&dict_path) else {
        return HashMap::new();
    };
    if meta.len() > MAX_HASH_DICT_BYTES {
        return HashMap::new();
    }
    let Ok(file) = File::open(&dict_path) else {
        return HashMap::new();
    };
    parse_hash_dictionary_reader(file).unwrap_or_default()
}

fn is_wad_archive_file_name(name_lower: &str) -> bool {
    name_lower.ends_with(".wad.client") || name_lower.ends_with(".wad")
}

fn resolve_game_final_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let validated = super::game_path::resolve_validated_game_install(app)?;
    find_game_final_dir(&validated.install_dir, validated.game_dir.as_deref())
        .ok_or_else(|| "Could not find League 'Game/DATA/FINAL' archive directory under the configured League path.".into())
}

pub(crate) fn find_game_final_dir(install_dir: &Path, game_dir: Option<&Path>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(gd) = game_dir {
        candidates.push(gd.join("DATA").join("FINAL"));
    }
    candidates.push(install_dir.join("Game").join("DATA").join("FINAL"));
    candidates.push(
        install_dir
            .join("Contents")
            .join("LoL")
            .join("Game")
            .join("DATA")
            .join("FINAL"),
    );
    candidates
        .into_iter()
        .find(|p| super::game_path::ensure_safe_existing_entry(p, true).is_ok())
}

fn classify_archive_summary(rel_path: &str, size_bytes: u64) -> GameWadArchiveSummary {
    let normalized = rel_path.replace('\\', "/");
    let file_name = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_string();
    let first_seg = normalized.split('/').next().unwrap_or("");
    let category = match first_seg {
        s if s.eq_ignore_ascii_case("Champions") => "Champions",
        s if s.eq_ignore_ascii_case("Maps") => "Map",
        s if s.eq_ignore_ascii_case("Localized") => "Localized",
        s if s.eq_ignore_ascii_case("Global") || s.eq_ignore_ascii_case("Shared") => "Shared",
        _ => "Other",
    }
    .to_string();

    let champion_hint = if category == "Champions" {
        let lower = file_name.to_ascii_lowercase();
        let trimmed_len = if lower.ends_with(".wad.client") {
            file_name.len() - ".wad.client".len()
        } else if lower.ends_with(".wad") {
            file_name.len() - ".wad".len()
        } else {
            file_name.len()
        };
        let stem = &file_name[..trimmed_len];
        let champ = stem.split('.').next().unwrap_or(stem).trim();
        if champ.is_empty() {
            None
        } else {
            Some(champ.to_string())
        }
    } else {
        None
    };

    GameWadArchiveSummary {
        relative_path: normalized,
        file_name,
        category,
        champion_hint,
        size_bytes,
    }
}

pub(crate) fn list_game_archives_at(final_dir: &Path) -> Result<Vec<GameWadArchiveSummary>, String> {
    super::game_path::ensure_safe_existing_entry(final_dir, true)?;
    let canon_base = final_dir
        .canonicalize()
        .map_err(|e| format!("Failed canonicalizing DATA/FINAL directory: {e}"))?;
    let mut out = Vec::new();
    scan_wad_archives_recursive(&canon_base, &canon_base, 0, &mut out)?;
    out.sort_by(|a, b| {
        let a_champ = a.category == "Champions";
        let b_champ = b.category == "Champions";
        b_champ
            .cmp(&a_champ)
            .then_with(|| a.relative_path.to_ascii_lowercase().cmp(&b.relative_path.to_ascii_lowercase()))
    });
    Ok(out)
}

fn scan_wad_archives_recursive(
    base: &Path,
    current: &Path,
    depth: usize,
    out: &mut Vec<GameWadArchiveSummary>,
) -> Result<(), String> {
    if depth > MAX_GAME_SCAN_DEPTH {
        return Ok(());
    }
    let rd = fs::read_dir(current).map_err(|e| format!("Failed scanning WAD folder: {e}"))?;
    for entry in rd {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
                continue;
            }
        }
        if meta.is_dir() {
            scan_wad_archives_recursive(base, &path, depth + 1, out)?;
        } else if meta.is_file() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_wad_archive_file_name(&name.to_ascii_lowercase()) {
                continue;
            }
            if let Ok(rel) = path.strip_prefix(base) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                out.push(classify_archive_summary(&rel_str, meta.len()));
            }
        }
    }
    Ok(())
}

pub(crate) fn resolve_safe_game_archive(
    final_dir: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let safe_rel = super::fantome::validate_zip_entry_path(relative_path)?;
    let lower = safe_rel.to_string_lossy().to_ascii_lowercase();
    if !is_wad_archive_file_name(&lower) {
        return Err("Archive selection must target a .wad or .wad.client file.".into());
    }
    let joined = final_dir.join(&safe_rel);
    super::game_path::ensure_safe_existing_entry(&joined, false)?;
    let canon_base = final_dir
        .canonicalize()
        .map_err(|e| format!("Failed canonicalizing DATA/FINAL directory: {e}"))?;
    let canon_file = joined
        .canonicalize()
        .map_err(|e| format!("Failed canonicalizing WAD archive path: {e}"))?;
    if !canon_file.starts_with(&canon_base) {
        return Err("Archive path escapes configured League DATA/FINAL directory.".into());
    }
    Ok(canon_file)
}

pub(crate) fn inspect_wad_file_at(
    customization_root: &Path,
    archive_path: &Path,
    source_label: Option<String>,
    picked_token: Option<String>,
) -> Result<WadInspectionReport, String> {
    super::game_path::ensure_safe_existing_entry(archive_path, false)?;
    let meta = fs::symlink_metadata(archive_path)
        .map_err(|e| format!("Failed inspecting WAD archive metadata: {e}"))?;
    let file = File::open(archive_path).map_err(|e| format!("Failed opening WAD archive: {e}"))?;
    let mut reader = BufReader::new(file);
    let (major, minor, mut entries) = parse_wad_reader(&mut reader, meta.len())?;

    let dict = load_hash_dictionary_at(customization_root);
    let mut resolved = 0usize;
    if !dict.is_empty() {
        for entry in &mut entries {
            if let Some(name) = dict.get(&entry.path_hash) {
                entry.resolved_path = Some(name.clone());
                resolved += 1;
            }
        }
    }

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
        source_label,
        picked_token,
        archive_size_bytes: Some(meta.len()),
        resolved_count: Some(resolved),
    })
}

fn derive_extract_rel_path(entry: &WadEntry) -> Result<String, String> {
    if let Some(resolved) = &entry.resolved_path {
        if let Ok(safe_rel) = super::fantome::validate_zip_entry_path(resolved) {
            let clean = safe_rel.to_string_lossy().replace('\\', "/");
            let ext = clean
                .rsplit_once('.')
                .map(|(_, e)| e.to_ascii_lowercase())
                .unwrap_or_default();
            if super::fantome::is_executable_extension(&ext) {
                return Err(format!(
                    "Resolved WAD entry '{clean}' has a disallowed executable extension."
                ));
            }
            if !clean.is_empty() {
                return Ok(clean);
            }
        }
    }
    Ok(format!("unknown/{}.bin", entry.path_hash_hex))
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn extract_wad_entries_at(
    customization_root: &Path,
    archive_path: &Path,
    selected_hashes: &[String],
    destination_mode: &str,
    project_name: Option<&str>,
    champion: Option<&str>,
    author: Option<&str>,
) -> Result<WadExtractReport, String> {
    super::game_path::ensure_safe_existing_entry(archive_path, false)?;
    let meta = fs::symlink_metadata(archive_path)
        .map_err(|e| format!("Failed inspecting WAD archive metadata: {e}"))?;
    let total_len = meta.len();
    let file = File::open(archive_path).map_err(|e| format!("Failed opening WAD archive: {e}"))?;
    let mut reader = BufReader::new(file);
    let (_, _, all_entries) = parse_wad_reader(&mut reader, total_len)?;

    let selected: Vec<WadEntry> = if selected_hashes.is_empty() {
        if all_entries.len() > MAX_EXTRACT_ENTRIES {
            return Err(format!(
                "Archive has {} entries; select specific entries (max {MAX_EXTRACT_ENTRIES} per batch).",
                all_entries.len()
            ));
        }
        all_entries.clone()
    } else {
        if selected_hashes.len() > MAX_EXTRACT_ENTRIES {
            return Err(format!(
                "Too many selected entries ({}); max {MAX_EXTRACT_ENTRIES} per batch.",
                selected_hashes.len()
            ));
        }
        let mut wanted = HashSet::with_capacity(selected_hashes.len());
        for raw in selected_hashes {
            wanted.insert(parse_hash_key(raw)?);
        }
        let mut seen = HashSet::new();
        all_entries
            .iter()
            .filter(|e| wanted.contains(&e.path_hash) && seen.insert(e.path_hash))
            .cloned()
            .collect()
    };

    if selected.is_empty() {
        return Err("No matching WAD entries were selected for extraction.".into());
    }

    let is_creator_mode = match destination_mode {
        "exportFolder" => false,
        "creatorProject" => true,
        _ => {
            return Err(
                "Unsupported destination mode (expected 'exportFolder' or 'creatorProject').".into(),
            )
        }
    };

    if is_creator_mode && selected.len() > MAX_CREATOR_IMPORT_FILES {
        return Err(format!(
            "Creator Workshop projects support at most {MAX_CREATOR_IMPORT_FILES} asset files ({} selected).",
            selected.len()
        ));
    }

    let total_uncompressed: u64 = selected
        .iter()
        .map(|e| u64::from(e.uncompressed_size))
        .sum();
    let max_bytes = if is_creator_mode {
        MAX_CREATOR_IMPORT_BYTES
    } else {
        MAX_EXPORT_EXTRACT_BYTES
    };
    if total_uncompressed > max_bytes {
        return Err(format!(
            "Selected uncompressed size ({:.2} MiB) exceeds the {} MiB safety limit for this destination.",
            total_uncompressed as f64 / (1024.0 * 1024.0),
            max_bytes / (1024 * 1024)
        ));
    }

    let dict = load_hash_dictionary_at(customization_root);
    let toc = if selected.iter().any(|e| e.compression_type == 4) {
        detect_subchunk_toc(&mut reader, total_len, &all_entries)
    } else {
        None
    };

    let mut prepared: Vec<(String, Vec<u8>)> = Vec::with_capacity(selected.len());
    let mut used_paths = HashSet::with_capacity(selected.len());
    for mut entry in selected {
        if let Some(name) = dict.get(&entry.path_hash) {
            entry.resolved_path = Some(name.clone());
        }
        let rel_path = derive_extract_rel_path(&entry)?;
        if !used_paths.insert(rel_path.clone()) {
            return Err(format!(
                "Duplicate extracted destination path '{rel_path}'."
            ));
        }
        let bytes = decompress_entry_from_reader(&mut reader, total_len, &entry, toc.as_deref())?;
        prepared.push((rel_path, bytes));
    }

    if is_creator_mode {
        let proj_name = project_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Extracted WAD Project");
        let champ = champion
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Generic");
        let auth = author
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("LAAP Local Extractor");
        let extracted_files: Vec<String> = prepared.iter().map(|(p, _)| p.clone()).collect();
        let proj = super::creator::create_project_with_assets_at(
            customization_root,
            proj_name,
            champ,
            auth,
            prepared,
        )?;
        return Ok(WadExtractReport {
            success: true,
            extracted_count: extracted_files.len(),
            output_dir: String::new(),
            extracted_files,
            project_id: Some(proj.id),
            project_name: Some(proj.name),
        });
    }

    let exports_root = customization_root.join("wad_exports");
    super::sandbox::check_chain(&exports_root, true)?;
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let target_dir = exports_root.join(format!("{:032x}", u128::from_be_bytes(random)));
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed creating export directory: {e}"))?;
    let canon_target = target_dir
        .canonicalize()
        .map_err(|e| format!("Failed canonicalizing export directory: {e}"))?;

    let mut extracted_files = Vec::with_capacity(prepared.len());
    for (rel_path, bytes) in prepared {
        let safe_rel = super::fantome::validate_zip_entry_path(&rel_path)?;
        let out_file = canon_target.join(&safe_rel);
        if let Some(parent) = out_file.parent() {
            super::sandbox::check_chain(parent, true)?;
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed creating subfolder for {rel_path}: {e}"))?;
        }
        let canon_parent = out_file
            .parent()
            .ok_or_else(|| "Missing output parent folder.".to_string())?
            .canonicalize()
            .map_err(|e| format!("Failed canonicalizing output parent: {e}"))?;
        if !canon_parent.starts_with(&canon_target) {
            return Err("Path traversal attempt detected during local WAD extraction.".into());
        }
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&out_file)
            .map_err(|e| format!("Will not overwrite extracted file {rel_path}: {e}"))?;
        out.write_all(&bytes)
            .map_err(|e| format!("Failed writing extracted file {rel_path}: {e}"))?;
        extracted_files.push(rel_path);
    }

    Ok(WadExtractReport {
        success: true,
        extracted_count: extracted_files.len(),
        output_dir: canon_target.to_string_lossy().into_owned(),
        extracted_files,
        project_id: None,
        project_name: None,
    })
}

#[tauri::command]
pub async fn wad_get_hash_dictionary_status(
    app: AppHandle,
) -> Result<WadHashDictionaryStatus, String> {
    let root = super::storage::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || get_hash_dictionary_status_at(&root))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wad_pick_hash_dictionary(app: AppHandle) -> Result<WadHashDictionaryStatus, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = super::storage::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Select CommunityDragon / Obsidian hashes.game.txt")
            .add_filter("Hash Dictionary", &["txt"])
            .blocking_pick_file()
        else {
            return get_hash_dictionary_status_at(&root);
        };
        let path = picked
            .into_path()
            .map_err(|_| "Selected hash file is not a local filesystem path.".to_string())?;
        import_hash_dictionary_at(&root, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wad_list_game_archives(app: AppHandle) -> Result<Vec<GameWadArchiveSummary>, String> {
    let final_dir = resolve_game_final_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || list_game_archives_at(&final_dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wad_inspect_game_archive(
    app: AppHandle,
    relative_path: String,
) -> Result<WadInspectionReport, String> {
    let root = super::storage::root(&app)?;
    let final_dir = resolve_game_final_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let archive_path = resolve_safe_game_archive(&final_dir, &relative_path)?;
        inspect_wad_file_at(&root, &archive_path, Some(relative_path), None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wad_pick_and_inspect(app: AppHandle) -> Result<Option<WadInspectionReport>, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = super::storage::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Select League .wad or .wad.client archive")
            .add_filter("WAD Archives", &["wad", "client"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|_| "Selected file is not a local filesystem path.".to_string())?;
        let lower = path.to_string_lossy().to_ascii_lowercase();
        if !is_wad_archive_file_name(&lower) {
            return Err("Selected file must have a .wad or .wad.client extension.".into());
        }
        super::game_path::ensure_safe_existing_entry(&path, false)?;
        let label = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Selected Archive".into());
        let token = register_picked_archive(path.clone())?;
        let report = inspect_wad_file_at(&root, &path, Some(label), Some(token))?;
        Ok(Some(report))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn wad_extract_entries(
    app: AppHandle,
    source_kind: String,
    source_ref: String,
    selected_hashes: Vec<String>,
    destination_mode: String,
    project_name: Option<String>,
    champion: Option<String>,
    author: Option<String>,
) -> Result<WadExtractReport, String> {
    let root = super::storage::root(&app)?;
    let final_dir = if source_kind == "game" {
        Some(resolve_game_final_dir(&app)?)
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        let archive_path = match source_kind.as_str() {
            "game" => resolve_safe_game_archive(
                final_dir
                    .as_deref()
                    .ok_or_else(|| "League DATA/FINAL directory unavailable.".to_string())?,
                &source_ref,
            )?,
            "picked" => resolve_picked_archive(&source_ref)?,
            _ => return Err("Unsupported WAD source kind (expected 'game' or 'picked').".into()),
        };
        extract_wad_entries_at(
            &root,
            &archive_path,
            &selected_hashes,
            &destination_mode,
            project_name.as_deref(),
            champion.as_deref(),
            author.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extraction_refuses_to_overwrite_existing_destination_entries() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let root = std::env::temp_dir().join(format!("laap-wad-destination-{}", rand::random::<u64>()));
        fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let archive = create_wad_v3(&[("assets/original.txt".into(), b"original".to_vec())]).unwrap();
        let (_, _, entries) = parse_wad(&archive).unwrap();
        let existing = root.join(format!("{}.bin", entries[0].path_hash_hex));
        fs::write(&existing, b"Retain existing user file").unwrap();
        assert!(wad_extract_files(STANDARD.encode(archive), root.to_string_lossy().into_owned()).is_err());
        assert_eq!(fs::read(existing).unwrap(), b"Retain existing user file");
        fs::remove_dir_all(root).unwrap();
    }

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
        assert_eq!(archive[3], 4); // minor = 4

        // 256 bytes signature block (starts at 4, ends at 260)
        assert_eq!(&archive[4..260], &[0u8; 256]);

        // 4 bytes entry count at offset 268 (0x10C)
        let count = u32::from_le_bytes(archive[268..272].try_into().unwrap());
        assert_eq!(count, 2);

        // Header offset before entries is exactly 272 (0x110)
        let entry_table_start = 272usize;
        let entry0_bytes = &archive[entry_table_start..entry_table_start + 32];
        let hash_ahri = xxhash64(b"data/characters/ahri.bin", 0);
        let hash_model = xxhash64(b"assets/characters/ahri/model.skn", 0);

        let (first_hash, second_hash) = if hash_ahri < hash_model {
            (hash_ahri, hash_model)
        } else {
            (hash_model, hash_ahri)
        };

        let entry0_hash = u64::from_le_bytes(entry0_bytes[0..8].try_into().unwrap());
        assert_eq!(entry0_hash, first_hash);

        // Offset check: entry 0 data starts right after entry table
        let expected_data_offset = (272 + 2 * 32) as u32;
        let entry0_offset = u32::from_le_bytes(entry0_bytes[8..12].try_into().unwrap());
        assert_eq!(entry0_offset, expected_data_offset);

        // Full round-trip parsing test
        let (major, minor, entries) = parse_wad(&archive).expect("failed to parse standard WAD");
        assert_eq!(major, 3);
        assert_eq!(minor, 4);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path_hash, first_hash);
        assert_eq!(entries[1].path_hash, second_hash);

        // Inspection report test
        use base64::{engine::general_purpose::STANDARD, Engine};
        let b64 = STANDARD.encode(&archive);
        let inspection = wad_inspect(b64).expect("wad_inspect should succeed");
        assert!(inspection.is_valid);
        assert_eq!(inspection.major, 3);
        assert_eq!(inspection.minor, 4);
        assert_eq!(inspection.entry_count, 2);
        assert_eq!(inspection.total_uncompressed_size, 16);
    }

    #[test]
    fn test_ltk_wad_interoperability_mount() {
        use ltk_hash::Hash as _;
        let files = vec![
            (
                "data/characters/ahri.bin".to_string(),
                b"PROP\x03\0\0\0\0\0\0\0\0\0\0\0".to_vec(),
            ),
            (
                "assets/characters/ahri/model.skn".to_string(),
                vec![0xAA, 0xBB, 0xCC, 0xDD],
            ),
        ];

        let archive = create_wad_v3(&files).expect("create_wad_v3 failed");
        let cursor = Cursor::new(archive);
        let mut wad = ltk_wad::Wad::mount(cursor).expect("ltk_wad::Wad::mount failed to mount LAAP archive");
        assert_eq!(wad.chunks().len(), 2);

        let ahri_hash = ltk_wad::WadHash::hash_str("data/characters/ahri.bin");
        let chunk = *wad.chunks().get(ahri_hash).expect("chunk not found in ltk_wad");
        let loaded = wad.load_chunk_decompressed(&chunk).expect("failed to load decompressed chunk");
        assert_eq!(&*loaded, b"PROP\x03\0\0\0\0\0\0\0\0\0\0\0");
    }

    #[test]
    fn test_ltk_wad_interoperability_builder_and_extract() {
        use std::io::Write;
        let mut builder = ltk_wad::WadBuilder::default();
        builder = builder.with_chunk(ltk_wad::WadChunkBuilder::default().with_path("assets/test_file.txt"));
        let mut buf = Cursor::new(Vec::new());
        builder.build_to_writer(&mut buf, |_hash, cur| {
            cur.write_all(b"Hello from League Toolkit!")?;
            Ok(())
        }).expect("WadBuilder build failed");

        let archive = buf.into_inner();
        let (major, minor, entries) = parse_wad(&archive).expect("parse_wad failed on ltk archive");
        assert_eq!(major, 3);
        assert_eq!(minor, 4);
        assert_eq!(entries.len(), 1);

        // Test extraction & decompression
        let temp_dir = std::env::temp_dir().join(format!("laap_wad_extract_test_{}", rand::random::<u64>()));
        use base64::{engine::general_purpose::STANDARD, Engine};
        let b64 = STANDARD.encode(&archive);
        let report = wad_extract_files(b64, temp_dir.to_string_lossy().to_string()).expect("wad_extract_files failed");
        assert_eq!(report.extracted_count, 1);
        let extracted_file = temp_dir.join(&report.extracted_files[0]);
        assert!(extracted_file.exists());
        let content = fs::read(&extracted_file).expect("failed to read extracted file");
        assert_eq!(content, b"Hello from League Toolkit!");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn streaming_disk_parser_and_hash_dictionary_resolve_paths() {
        let root = std::env::temp_dir().join(format!("laap_wad_stream_test_{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();

        let archive = create_wad_v3(&[
            ("data/characters/ahri.bin".to_string(), b"PROP\x02\0".to_vec()),
            ("assets/characters/ahri/skins/base/ahri.skn".to_string(), vec![1, 2, 3, 4]),
        ])
        .unwrap();
        let wad_path = root.join("Ahri.wad.client");
        fs::write(&wad_path, &archive).unwrap();

        let h1 = xxhash64(b"data/characters/ahri.bin", 0);
        let h2 = xxhash64(b"assets/characters/ahri/skins/base/ahri.skn", 0);
        let dict_src = root.join("hashes.txt");
        fs::write(
            &dict_src,
            format!("0x{h1:016x} data/characters/ahri.bin\n{h2:016x} assets/characters/ahri/skins/base/ahri.skn\n"),
        )
        .unwrap();

        let status = import_hash_dictionary_at(&root, &dict_src).unwrap();
        assert!(status.installed);
        assert_eq!(status.entry_count, 2);

        let report = inspect_wad_file_at(&root, &wad_path, Some("Champions/Ahri.wad.client".into()), None).unwrap();
        assert_eq!(report.entry_count, 2);
        assert_eq!(report.resolved_count, Some(2));
        assert!(report
            .entries
            .iter()
            .any(|e| e.resolved_path.as_deref() == Some("data/characters/ahri.bin")));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn list_and_resolve_game_archives_rejects_traversal_and_non_wad() {
        let root = std::env::temp_dir().join(format!("laap_wad_scan_test_{}", rand::random::<u64>()));
        let final_dir = root.join("Game").join("DATA").join("FINAL");
        let champs_dir = final_dir.join("Champions");
        fs::create_dir_all(&champs_dir).unwrap();
        fs::write(champs_dir.join("Ahri.wad.client"), b"RW\x03\x04").unwrap();
        fs::write(champs_dir.join("notes.txt"), b"ignore me").unwrap();
        fs::write(root.join("outside.wad"), b"RW\x03\x04").unwrap();

        let listed = list_game_archives_at(&final_dir).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].relative_path, "Champions/Ahri.wad.client");
        assert_eq!(listed[0].category, "Champions");
        assert_eq!(listed[0].champion_hint.as_deref(), Some("Ahri"));

        assert!(resolve_safe_game_archive(&final_dir, "Champions/Ahri.wad.client").is_ok());
        assert!(resolve_safe_game_archive(&final_dir, "../../../outside.wad").is_err());
        assert!(resolve_safe_game_archive(&final_dir, "Champions/notes.txt").is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn extract_entries_exports_folder_and_creates_creator_project() {
        let root = std::env::temp_dir().join(format!("laap_wad_export_proj_{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();

        let files = vec![
            ("data/characters/ahri.bin".to_string(), b"PROP_BYTES".to_vec()),
            ("assets/characters/ahri/ahri_base.dds".to_string(), b"DDS_DATA".to_vec()),
        ];
        let archive = create_wad_v3(&files).unwrap();
        let wad_path = root.join("Ahri.wad.client");
        fs::write(&wad_path, &archive).unwrap();

        let h1 = xxhash64(b"data/characters/ahri.bin", 0);
        let h2 = xxhash64(b"assets/characters/ahri/ahri_base.dds", 0);
        let dict_src = root.join("hashes.game.txt");
        fs::write(
            &dict_src,
            format!("{h1:016x} data/characters/ahri.bin\n{h2:016x} assets/characters/ahri/ahri_base.dds\n"),
        )
        .unwrap();
        import_hash_dictionary_at(&root, &dict_src).unwrap();

        let selected = vec![format!("0x{h1:016x}")];
        let folder_rep = extract_wad_entries_at(
            &root,
            &wad_path,
            &selected,
            "exportFolder",
            None,
            None,
            None,
        )
        .unwrap();
        assert!(folder_rep.success);
        assert_eq!(folder_rep.extracted_count, 1);
        assert_eq!(folder_rep.extracted_files, vec!["data/characters/ahri.bin"]);
        assert_eq!(
            fs::read(Path::new(&folder_rep.output_dir).join("data/characters/ahri.bin")).unwrap(),
            b"PROP_BYTES"
        );

        let proj_rep = extract_wad_entries_at(
            &root,
            &wad_path,
            &[format!("0x{h1:016x}"), format!("0x{h2:016x}")],
            "creatorProject",
            Some("Ahri Offline Import"),
            Some("Ahri"),
            Some("Tester"),
        )
        .unwrap();
        assert!(proj_rep.success);
        assert_eq!(proj_rep.extracted_count, 2);
        let proj_id = proj_rep.project_id.expect("expected project id");
        let saved: super::super::creator::CreatorProject = serde_json::from_str(
            &fs::read_to_string(root.join("creator_projects").join(format!("{proj_id}.json"))).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.name, "Ahri Offline Import");
        assert_eq!(saved.champion, "Ahri");
        assert_eq!(saved.files.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn zstd_multi_subchunk_extraction_works() {
        let root = std::env::temp_dir().join(format!("laap_wad_zstdmulti_{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();

        let part1 = b"First Zstd subchunk bytes repeatedly repeated for compression!";
        let part2 = b"RAW2";
        let comp_part1 = zstd::bulk::compress(part1, 3).unwrap();

        let mut toc = Vec::new();
        toc.extend_from_slice(&(comp_part1.len() as u32).to_le_bytes());
        toc.extend_from_slice(&(part1.len() as u32).to_le_bytes());
        toc.extend_from_slice(&0u64.to_le_bytes());
        toc.extend_from_slice(&(part2.len() as u32).to_le_bytes());
        toc.extend_from_slice(&(part2.len() as u32).to_le_bytes());
        toc.extend_from_slice(&0u64.to_le_bytes());

        let mut combined_payload = comp_part1;
        combined_payload.extend_from_slice(part2);

        let mut expected = part1.to_vec();
        expected.extend_from_slice(part2);

        let target_path = "assets/characters/ahri/multi_chunk.skn";
        let target_hash = xxhash64(target_path.as_bytes(), 0);
        let toc_path = "subchunk.toc";
        let toc_hash = xxhash64(toc_path.as_bytes(), 0);

        let mut raw_entries = vec![
            (target_hash, combined_payload.clone(), expected.len() as u32, 0x24u8), // frame_count=2, type=4
            (toc_hash, toc.clone(), toc.len() as u32, 0u8),
        ];
        raw_entries.sort_by_key(|e| e.0);

        let header_len = 272usize + raw_entries.len() * 32usize;
        let mut out = Vec::new();
        out.extend_from_slice(WAD_MAGIC);
        out.push(3);
        out.push(4);
        out.extend_from_slice(&[0u8; 256]);
        out.extend_from_slice(&0u64.to_le_bytes());
        out.extend_from_slice(&(raw_entries.len() as u32).to_le_bytes());
        let mut payload = Vec::new();
        let mut off = header_len as u32;
        for (hash, data, uncomp_len, type_byte) in raw_entries {
            let csum = xxhash64(&data, 0);
            out.extend_from_slice(&hash.to_le_bytes());
            out.extend_from_slice(&off.to_le_bytes());
            out.extend_from_slice(&(data.len() as u32).to_le_bytes());
            out.extend_from_slice(&uncomp_len.to_le_bytes());
            out.push(type_byte);
            out.extend_from_slice(&[0u8; 3]); // start_frame = 0
            out.extend_from_slice(&csum.to_le_bytes());
            off += data.len() as u32;
            payload.extend_from_slice(&data);
        }
        out.extend_from_slice(&payload);

        let wad_path = root.join("Multi.wad.client");
        fs::write(&wad_path, &out).unwrap();

        let report = extract_wad_entries_at(
            &root,
            &wad_path,
            &[format!("0x{target_hash:016x}")],
            "exportFolder",
            None,
            None,
            None,
        )
        .unwrap();
        let extracted = fs::read(Path::new(&report.output_dir).join(&report.extracted_files[0])).unwrap();
        assert_eq!(extracted, expected);

        let _ = fs::remove_dir_all(&root);
    }
}
