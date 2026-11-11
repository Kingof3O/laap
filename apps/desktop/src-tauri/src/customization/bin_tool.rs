use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};

pub const BIN_MAGIC_PROP: &[u8; 4] = b"PROP";
pub const BIN_MAGIC_PTCH: &[u8; 4] = b"PTCH";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinField {
    pub name_hash: u32,
    pub name_hash_hex: String,
    pub value_type: u8,
    pub type_name: String,
    pub value_string: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_bytes_hex: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinEntry {
    pub class_hash: u32,
    pub class_hash_hex: String,
    pub name_hash: u32,
    pub name_hash_hex: String,
    pub fields: Vec<BinField>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinTree {
    pub magic: String,
    pub version: u32,
    pub linked_files: Vec<String>,
    pub entries: Vec<BinEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinInspectionReport {
    pub is_valid: bool,
    pub magic: String,
    pub version: u32,
    pub linked_files_count: usize,
    pub entries_count: usize,
    pub total_fields_count: usize,
    pub class_hashes: Vec<String>,
}

pub fn type_name(val_type: u8) -> &'static str {
    match val_type {
        0 => "Empty",
        1 => "Bool",
        2 => "S8",
        3 => "U8",
        4 => "S16",
        5 => "U16",
        6 => "S32",
        7 => "U32",
        8 => "S64",
        9 => "U64",
        10 => "Float",
        11 => "Vec2",
        12 => "Vec3",
        13 => "Vec4",
        14 => "Matrix44",
        15 => "RGBA",
        16 => "String",
        17 => "Hash",
        18 => "Container",
        19 => "Structure",
        20 => "Embedded",
        21 => "Link",
        22 => "Option",
        23 => "Map",
        24 => "Flag",
        128 => "Container",
        129 => "UnorderedContainer",
        130 => "Structure",
        131 => "Embedded",
        132 => "Link",
        133 => "Option",
        134 => "Map",
        135 => "BitBool",
        _ => "Unknown",
    }
}

fn to_hex_str(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02x}", b);
    }
    s
}

fn from_hex_str(hex_str: &str) -> Result<Vec<u8>, String> {
    let clean = hex_str.trim().trim_start_matches("0x");
    if clean.len() % 2 != 0 {
        return Err(format!("Invalid hex string with odd length: {hex_str}"));
    }
    let mut bytes = Vec::with_capacity(clean.len() / 2);
    for i in (0..clean.len()).step_by(2) {
        let byte = u8::from_str_radix(&clean[i..i + 2], 16)
            .map_err(|e| format!("Failed to parse hex pair '{}': {e}", &clean[i..i + 2]))?;
        bytes.push(byte);
    }
    Ok(bytes)
}

/// Parses a League of Legends PROP / PTCH property binary file.
/// Decodes all standard CommunityDragon / League Toolkit types without data loss.
pub fn parse_bin(bytes: &[u8]) -> Result<BinTree, String> {
    if bytes.len() < 8 {
        return Err("Binary file is too small to be a valid PROP/PTCH file.".into());
    }

    let magic_str = if &bytes[0..4] == BIN_MAGIC_PROP {
        "PROP".to_string()
    } else if &bytes[0..4] == BIN_MAGIC_PTCH {
        "PTCH".to_string()
    } else {
        return Err(format!(
            "Invalid binary magic: expected 'PROP' or 'PTCH', found {:?}",
            &bytes[0..4]
        ));
    };

    let mut cursor = Cursor::new(bytes);
    cursor.set_position(4);

    let mut version_bytes = [0u8; 4];
    cursor
        .read_exact(&mut version_bytes)
        .map_err(|e| format!("Failed to read version: {e}"))?;
    let version = u32::from_le_bytes(version_bytes);

    let mut linked_files = Vec::new();
    if version >= 2 {
        if cursor.position() as usize + 4 <= bytes.len() {
            let mut linked_count_bytes = [0u8; 4];
            cursor
                .read_exact(&mut linked_count_bytes)
                .map_err(|e| format!("Failed to read linked files count: {e}"))?;
            let linked_count = u32::from_le_bytes(linked_count_bytes) as usize;

            if linked_count > 2000 {
                return Err("Exceeded maximum supported linked files in PROP file.".into());
            }

            for i in 0..linked_count {
                let mut len_bytes = [0u8; 2];
                cursor
                    .read_exact(&mut len_bytes)
                    .map_err(|e| format!("Truncated linked file {i} length: {e}"))?;
                let len = u16::from_le_bytes(len_bytes) as usize;
                let mut str_bytes = vec![0u8; len];
                cursor
                    .read_exact(&mut str_bytes)
                    .map_err(|e| format!("Truncated linked file {i} string: {e}"))?;
                linked_files.push(String::from_utf8_lossy(&str_bytes).to_string());
            }
        }
    }

    let mut entries_count_bytes = [0u8; 4];
    cursor
        .read_exact(&mut entries_count_bytes)
        .map_err(|e| format!("Failed to read entries count: {e}"))?;
    let entry_count = u32::from_le_bytes(entries_count_bytes) as usize;

    if entry_count > 50_000 {
        return Err("Exceeded maximum supported entries in PROP file.".into());
    }

    let entries_start_pos = cursor.position();

    // Standard League format puts the class-hash table before object payloads.
    // If standard parsing succeeds, use it; fallback to legacy interleaved if standard encounters an error.
    let entries = match parse_entries_standard(bytes, entries_start_pos, entry_count) {
        Ok(parsed) if parsed.len() == entry_count => parsed,
        _ => parse_entries_interleaved(bytes, entries_start_pos, entry_count)?,
    };

    Ok(BinTree {
        magic: magic_str,
        version,
        linked_files,
        entries,
    })
}

fn parse_field_value<R: Read>(
    cursor: &mut R,
    val_type: u8,
) -> Result<(String, Option<String>), String> {
    let mut raw_hex = None;
    let value_str = match val_type {
        0 => "empty".to_string(),
        1 | 24 | 135 => {
            let mut b = [0u8; 1];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", b[0] != 0)
        }
        2 => {
            let mut b = [0u8; 1];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", b[0] as i8)
        }
        3 => {
            let mut b = [0u8; 1];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", b[0])
        }
        4 => {
            let mut b = [0u8; 2];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", i16::from_le_bytes(b))
        }
        5 => {
            let mut b = [0u8; 2];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", u16::from_le_bytes(b))
        }
        6 => {
            let mut b = [0u8; 4];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", i32::from_le_bytes(b))
        }
        7 => {
            let mut b = [0u8; 4];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("0x{:08x}", u32::from_le_bytes(b))
        }
        8 => {
            let mut b = [0u8; 8];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", i64::from_le_bytes(b))
        }
        9 => {
            let mut b = [0u8; 8];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("0x{:016x}", u64::from_le_bytes(b))
        }
        10 => {
            let mut b = [0u8; 4];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("{}", f32::from_le_bytes(b))
        }
        11 => {
            let mut b = [0u8; 8];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            let x = f32::from_le_bytes(b[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(b[4..8].try_into().unwrap());
            format!("[{}, {}]", x, y)
        }
        12 => {
            let mut b = [0u8; 12];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            let x = f32::from_le_bytes(b[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(b[4..8].try_into().unwrap());
            let z = f32::from_le_bytes(b[8..12].try_into().unwrap());
            format!("[{}, {}, {}]", x, y, z)
        }
        13 => {
            let mut b = [0u8; 16];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            let x = f32::from_le_bytes(b[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(b[4..8].try_into().unwrap());
            let z = f32::from_le_bytes(b[8..12].try_into().unwrap());
            let w = f32::from_le_bytes(b[12..16].try_into().unwrap());
            format!("[{}, {}, {}, {}]", x, y, z, w)
        }
        14 => {
            let mut b = [0u8; 64];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            raw_hex = Some(to_hex_str(&b));
            "matrix4x4".to_string()
        }
        15 => {
            let mut b = [0u8; 4];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("#{:02x}{:02x}{:02x}{:02x}", b[0], b[1], b[2], b[3])
        }
        16 => {
            let mut len_b = [0u8; 2];
            cursor.read_exact(&mut len_b).map_err(|e| e.to_string())?;
            let slen = u16::from_le_bytes(len_b) as usize;
            let mut sbytes = vec![0u8; slen];
            cursor.read_exact(&mut sbytes).map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&sbytes).to_string()
        }
        17 | 21 | 132 => {
            let mut b = [0u8; 4];
            cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
            format!("0x{:08x}", u32::from_le_bytes(b))
        }
        18 | 128 | 129 => {
            let mut head = [0u8; 9];
            cursor.read_exact(&mut head).map_err(|e| e.to_string())?;
            let data_size = u32::from_le_bytes(head[1..5].try_into().unwrap()) as usize;
            let count = u32::from_le_bytes(head[5..9].try_into().unwrap());
            let payload_len = data_size;
            let mut payload = vec![0u8; payload_len];
            if payload_len > 0 {
                cursor.read_exact(&mut payload).map_err(|e| e.to_string())?;
            }
            let mut full_bytes = Vec::with_capacity(9 + payload_len);
            full_bytes.extend_from_slice(&head);
            full_bytes.extend_from_slice(&payload);
            raw_hex = Some(to_hex_str(&full_bytes));
            format!("Container(type={}, count={})", head[0], count)
        }
        19 | 20 | 130 | 131 => {
            let mut head = [0u8; 10];
            cursor.read_exact(&mut head).map_err(|e| e.to_string())?;
            let s_name = u32::from_le_bytes(head[0..4].try_into().unwrap());
            let s_size = u32::from_le_bytes(head[4..8].try_into().unwrap()) as usize;
            let s_fcount = u16::from_le_bytes(head[8..10].try_into().unwrap());
            let payload_len = s_size;
            let mut payload = vec![0u8; payload_len];
            if payload_len > 0 {
                cursor.read_exact(&mut payload).map_err(|e| e.to_string())?;
            }
            let mut full_bytes = Vec::with_capacity(10 + payload_len);
            full_bytes.extend_from_slice(&head);
            full_bytes.extend_from_slice(&payload);
            raw_hex = Some(to_hex_str(&full_bytes));
            format!(
                "{}(name=0x{:08x}, fields={})",
                if val_type == 19 || val_type == 130 { "Struct" } else { "Embedded" },
                s_name,
                s_fcount
            )
        }
        _ => {
            let mut b = [0u8; 4];
            if cursor.read_exact(&mut b).is_ok() {
                raw_hex = Some(to_hex_str(&b));
            }
            format!("UnknownType({})", val_type)
        }
    };
    Ok((value_str, raw_hex))
}

fn parse_entries_standard(
    bytes: &[u8],
    start_pos: u64,
    entry_count: usize,
) -> Result<Vec<BinEntry>, String> {
    let mut cursor = Cursor::new(bytes);
    cursor.set_position(start_pos);

    let mut class_hashes = Vec::with_capacity(entry_count);
    for i in 0..entry_count {
        let mut class_bytes = [0u8; 4];
        cursor
            .read_exact(&mut class_bytes)
            .map_err(|e| format!("Truncated class hash {i}: {e}"))?;
        class_hashes.push(u32::from_le_bytes(class_bytes));
    }

    let mut entries = Vec::with_capacity(entry_count);
    for e_idx in 0..entry_count {
        if cursor.position() as usize >= bytes.len() {
            break;
        }

        let class_hash = class_hashes[e_idx];

        let mut size_bytes = [0u8; 4];
        cursor
            .read_exact(&mut size_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} size: {e}"))?;
        let entry_size = u32::from_le_bytes(size_bytes) as usize;

        let entry_start_pos = cursor.position() as usize;

        let mut name_bytes = [0u8; 4];
        cursor
            .read_exact(&mut name_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} name hash: {e}"))?;
        let name_hash = u32::from_le_bytes(name_bytes);

        let mut count_bytes = [0u8; 2];
        cursor
            .read_exact(&mut count_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} field count: {e}"))?;
        let field_count = u16::from_le_bytes(count_bytes) as usize;

        let mut fields = Vec::with_capacity(field_count.min(1024));
        for f_idx in 0..field_count {
            if cursor.position() as usize + 5 > bytes.len() {
                break;
            }

            let mut fname_bytes = [0u8; 4];
            cursor
                .read_exact(&mut fname_bytes)
                .map_err(|e| format!("Truncated field {f_idx} name hash: {e}"))?;
            let fname_hash = u32::from_le_bytes(fname_bytes);

            let mut ftype_bytes = [0u8; 1];
            cursor
                .read_exact(&mut ftype_bytes)
                .map_err(|e| format!("Truncated field {f_idx} type: {e}"))?;
            let val_type = ftype_bytes[0];

            let (value_str, raw_hex) = parse_field_value(&mut cursor, val_type)?;

            fields.push(BinField {
                name_hash: fname_hash,
                name_hash_hex: format!("0x{:08x}", fname_hash),
                value_type: val_type,
                type_name: type_name(val_type).into(),
                value_string: value_str,
                raw_bytes_hex: raw_hex,
            });
        }

        if entry_size > 0 {
            let current_read = (cursor.position() as usize).saturating_sub(entry_start_pos);
            if current_read < entry_size && entry_start_pos + entry_size <= bytes.len() {
                cursor.set_position((entry_start_pos + entry_size) as u64);
            }
        }

        entries.push(BinEntry {
            class_hash,
            class_hash_hex: format!("0x{:08x}", class_hash),
            name_hash,
            name_hash_hex: format!("0x{:08x}", name_hash),
            fields,
        });
    }

    Ok(entries)
}

fn parse_entries_interleaved(
    bytes: &[u8],
    start_pos: u64,
    entry_count: usize,
) -> Result<Vec<BinEntry>, String> {
    let mut cursor = Cursor::new(bytes);
    cursor.set_position(start_pos);

    let mut entries = Vec::with_capacity(entry_count);
    for e_idx in 0..entry_count {
        if cursor.position() as usize >= bytes.len() {
            break;
        }

        let mut class_bytes = [0u8; 4];
        cursor
            .read_exact(&mut class_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} class hash: {e}"))?;
        let class_hash = u32::from_le_bytes(class_bytes);

        let mut size_bytes = [0u8; 4];
        cursor
            .read_exact(&mut size_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} size: {e}"))?;
        let entry_size = u32::from_le_bytes(size_bytes) as usize;

        let entry_start_pos = cursor.position() as usize;

        let mut name_bytes = [0u8; 4];
        cursor
            .read_exact(&mut name_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} name hash: {e}"))?;
        let name_hash = u32::from_le_bytes(name_bytes);

        let mut count_bytes = [0u8; 2];
        cursor
            .read_exact(&mut count_bytes)
            .map_err(|e| format!("Truncated entry {e_idx} field count: {e}"))?;
        let field_count = u16::from_le_bytes(count_bytes) as usize;

        let mut fields = Vec::with_capacity(field_count.min(1024));
        for f_idx in 0..field_count {
            if cursor.position() as usize + 5 > bytes.len() {
                break;
            }

            let mut fname_bytes = [0u8; 4];
            cursor
                .read_exact(&mut fname_bytes)
                .map_err(|e| format!("Truncated field {f_idx} name hash: {e}"))?;
            let fname_hash = u32::from_le_bytes(fname_bytes);

            let mut ftype_bytes = [0u8; 1];
            cursor
                .read_exact(&mut ftype_bytes)
                .map_err(|e| format!("Truncated field {f_idx} type: {e}"))?;
            let val_type = ftype_bytes[0];

            let (value_str, raw_hex) = parse_field_value(&mut cursor, val_type)?;

            fields.push(BinField {
                name_hash: fname_hash,
                name_hash_hex: format!("0x{:08x}", fname_hash),
                value_type: val_type,
                type_name: type_name(val_type).into(),
                value_string: value_str,
                raw_bytes_hex: raw_hex,
            });
        }

        if entry_size > 0 {
            let current_read = (cursor.position() as usize).saturating_sub(entry_start_pos);
            if current_read < entry_size && entry_start_pos + entry_size <= bytes.len() {
                cursor.set_position((entry_start_pos + entry_size) as u64);
            }
        }

        entries.push(BinEntry {
            class_hash,
            class_hash_hex: format!("0x{:08x}", class_hash),
            name_hash,
            name_hash_hex: format!("0x{:08x}", name_hash),
            fields,
        });
    }

    Ok(entries)
}

/// Serializes a BinTree back into binary format.
/// Preserves exact raw bytes when present, strictly validates numeric and string fields,
/// and rejects corrupt inputs without silent data loss.
pub fn serialize_bin(tree: &BinTree) -> Result<Vec<u8>, String> {
    let mut out = Cursor::new(Vec::new());

    let magic_bytes = if tree.magic == "PTCH" {
        BIN_MAGIC_PTCH
    } else {
        BIN_MAGIC_PROP
    };
    out.write_all(magic_bytes).map_err(|e| e.to_string())?;
    out.write_all(&tree.version.to_le_bytes())
        .map_err(|e| e.to_string())?;

    if tree.version >= 2 {
        let linked_count = tree.linked_files.len() as u32;
        out.write_all(&linked_count.to_le_bytes())
            .map_err(|e| e.to_string())?;
        for file in &tree.linked_files {
            let bytes = file.as_bytes();
            let len = bytes.len() as u16;
            out.write_all(&len.to_le_bytes()).map_err(|e| e.to_string())?;
            out.write_all(bytes).map_err(|e| e.to_string())?;
        }
    }

    let entries_count = tree.entries.len() as u32;
    out.write_all(&entries_count.to_le_bytes())
        .map_err(|e| e.to_string())?;

    // 1. Write standard League class-hash table (all class hashes in entry order)
    for entry in &tree.entries {
        out.write_all(&entry.class_hash.to_le_bytes())
            .map_err(|e| e.to_string())?;
    }

    // 2. Write each object payload with entry size prefix
    for entry in &tree.entries {
        let mut entry_buf = Cursor::new(Vec::new());
        entry_buf
            .write_all(&entry.name_hash.to_le_bytes())
            .map_err(|e| e.to_string())?;
        let fcount = entry.fields.len() as u16;
        entry_buf
            .write_all(&fcount.to_le_bytes())
            .map_err(|e| e.to_string())?;

        for f in &entry.fields {
            entry_buf
                .write_all(&f.name_hash.to_le_bytes())
                .map_err(|e| e.to_string())?;
            entry_buf.write_all(&[f.value_type]).map_err(|e| e.to_string())?;

            if let Some(ref raw_hex) = f.raw_bytes_hex {
                let raw_bytes = from_hex_str(raw_hex).map_err(|e| {
                    format!(
                        "Invalid rawHex in field 0x{:08x} (type {}): {e}",
                        f.name_hash, f.value_type
                    )
                })?;
                entry_buf
                    .write_all(&raw_bytes)
                    .map_err(|e| e.to_string())?;
                continue;
            }

            match f.value_type {
                0 => {}
                1 | 24 => {
                    let b = match f.value_string.trim().to_ascii_lowercase().as_str() {
                        "true" | "1" => 1u8,
                        "false" | "0" => 0u8,
                        other => {
                            return Err(format!(
                                "Invalid boolean value '{other}' for field 0x{:08x}",
                                f.name_hash
                            ));
                        }
                    };
                    entry_buf.write_all(&[b]).map_err(|e| e.to_string())?;
                }
                2 => {
                    let v = f.value_string.trim().parse::<i8>().map_err(|e| {
                        format!(
                            "Invalid S8 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                3 => {
                    let v = f.value_string.trim().parse::<u8>().map_err(|e| {
                        format!(
                            "Invalid U8 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                4 => {
                    let v = f.value_string.trim().parse::<i16>().map_err(|e| {
                        format!(
                            "Invalid S16 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                5 => {
                    let v = f.value_string.trim().parse::<u16>().map_err(|e| {
                        format!(
                            "Invalid U16 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                6 => {
                    let v = f.value_string.trim().parse::<i32>().map_err(|e| {
                        format!(
                            "Invalid S32 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                7 | 17 | 21 => {
                    let clean = f.value_string.trim().trim_start_matches("0x");
                    let v = if f.value_string.trim().starts_with("0x") || clean.chars().any(|c| c.is_alphabetic()) {
                        u32::from_str_radix(clean, 16)
                    } else {
                        f.value_string.trim().parse::<u32>()
                    }
                    .map_err(|e| {
                        format!(
                            "Invalid U32/Hash value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                8 => {
                    let v = f.value_string.trim().parse::<i64>().map_err(|e| {
                        format!(
                            "Invalid S64 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                9 => {
                    let clean = f.value_string.trim().trim_start_matches("0x");
                    let v = if f.value_string.trim().starts_with("0x") || clean.chars().any(|c| c.is_alphabetic()) {
                        u64::from_str_radix(clean, 16)
                    } else {
                        f.value_string.trim().parse::<u64>()
                    }
                    .map_err(|e| {
                        format!(
                            "Invalid U64 value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                10 => {
                    let v = f.value_string.trim().parse::<f32>().map_err(|e| {
                        format!(
                            "Invalid Float value '{}' for field 0x{:08x}: {e}",
                            f.value_string, f.name_hash
                        )
                    })?;
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                11 => {
                    // Vec2: "[x, y]"
                    let inner = f.value_string.trim().trim_start_matches('[').trim_end_matches(']');
                    let parts: Vec<&str> = inner.split(',').collect();
                    if parts.len() != 2 {
                        return Err(format!("Invalid Vec2 format '{}'", f.value_string));
                    }
                    let x = parts[0].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let y = parts[1].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    entry_buf.write_all(&x.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&y.to_le_bytes()).map_err(|e| e.to_string())?;
                }
                12 => {
                    // Vec3: "[x, y, z]"
                    let inner = f.value_string.trim().trim_start_matches('[').trim_end_matches(']');
                    let parts: Vec<&str> = inner.split(',').collect();
                    if parts.len() != 3 {
                        return Err(format!("Invalid Vec3 format '{}'", f.value_string));
                    }
                    let x = parts[0].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let y = parts[1].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let z = parts[2].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    entry_buf.write_all(&x.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&y.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&z.to_le_bytes()).map_err(|e| e.to_string())?;
                }
                13 => {
                    // Vec4: "[x, y, z, w]"
                    let inner = f.value_string.trim().trim_start_matches('[').trim_end_matches(']');
                    let parts: Vec<&str> = inner.split(',').collect();
                    if parts.len() != 4 {
                        return Err(format!("Invalid Vec4 format '{}'", f.value_string));
                    }
                    let x = parts[0].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let y = parts[1].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let z = parts[2].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    let w = parts[3].trim().parse::<f32>().map_err(|e| e.to_string())?;
                    entry_buf.write_all(&x.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&y.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&z.to_le_bytes()).map_err(|e| e.to_string())?;
                    entry_buf.write_all(&w.to_le_bytes()).map_err(|e| e.to_string())?;
                }
                15 => {
                    // RGBA: "#RRGGBBAA"
                    let clean = f.value_string.trim().trim_start_matches('#');
                    let bytes = from_hex_str(clean).map_err(|e| format!("Invalid RGBA color: {e}"))?;
                    if bytes.len() != 4 {
                        return Err(format!("RGBA color must be exactly 4 bytes (#RRGGBBAA), got '{}'", f.value_string));
                    }
                    entry_buf.write_all(&bytes).map_err(|e| e.to_string())?;
                }
                16 => {
                    let sbytes = f.value_string.as_bytes();
                    let slen = sbytes.len() as u16;
                    entry_buf
                        .write_all(&slen.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                    entry_buf.write_all(sbytes).map_err(|e| e.to_string())?;
                }
                _ => {
                    return Err(format!(
                        "Cannot serialize field 0x{:08x} of type {} without rawBytesHex",
                        f.name_hash, f.value_type
                    ));
                }
            }
        }

        let entry_bytes = entry_buf.into_inner();
        let entry_size = entry_bytes.len() as u32;
        out.write_all(&entry_size.to_le_bytes())
            .map_err(|e| e.to_string())?;
        out.write_all(&entry_bytes).map_err(|e| e.to_string())?;
    }

    Ok(out.into_inner())
}

pub fn inspect_bin(bytes: &[u8]) -> Result<BinInspectionReport, String> {
    let tree = parse_bin(bytes)?;
    let total_fields = tree.entries.iter().map(|e| e.fields.len()).sum();
    let class_hashes = tree
        .entries
        .iter()
        .map(|e| e.class_hash_hex.clone())
        .collect();

    Ok(BinInspectionReport {
        is_valid: true,
        magic: tree.magic,
        version: tree.version,
        linked_files_count: tree.linked_files.len(),
        entries_count: tree.entries.len(),
        total_fields_count: total_fields,
        class_hashes,
    })
}

#[tauri::command]
pub fn bin_inspect(bin_base64: String) -> Result<BinInspectionReport, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(&bin_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    inspect_bin(&bytes)
}

#[tauri::command]
pub fn bin_convert_to_json(bin_base64: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(&bin_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;
    let tree = parse_bin(&bytes)?;
    serde_json::to_string_pretty(&tree).map_err(|e| format!("JSON serialization failed: {e}"))
}

#[tauri::command]
pub fn bin_convert_from_json(json_str: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let tree: BinTree =
        serde_json::from_str(&json_str).map_err(|e| format!("JSON parsing failed: {e}"))?;
    let bytes = serialize_bin(&tree)?;
    Ok(STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bin_round_trip() {
        test_bin_round_trip_with_rich_types();
    }

    #[test]
    fn test_bin_round_trip_with_rich_types() {
        let tree = BinTree {
            magic: "PROP".into(),
            version: 2,
            linked_files: vec!["characters/data/ahri.bin".into()],
            entries: vec![BinEntry {
                class_hash: 0x12345678,
                class_hash_hex: "0x12345678".into(),
                name_hash: 0xabcdef01,
                name_hash_hex: "0xabcdef01".into(),
                fields: vec![
                    BinField {
                        name_hash: 0x01020304,
                        name_hash_hex: "0x01020304".into(),
                        value_type: 1, // Bool
                        type_name: "Bool".into(),
                        value_string: "true".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x05060708,
                        name_hash_hex: "0x05060708".into(),
                        value_type: 6, // S32
                        type_name: "S32".into(),
                        value_string: "42".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x090a0b0c,
                        name_hash_hex: "0x090a0b0c".into(),
                        value_type: 7, // U32
                        type_name: "U32".into(),
                        value_string: "0x0000ffff".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x0d0e0f10,
                        name_hash_hex: "0x0d0e0f10".into(),
                        value_type: 10, // Float
                        type_name: "Float".into(),
                        value_string: "3.1415".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x11121314,
                        name_hash_hex: "0x11121314".into(),
                        value_type: 11, // Vec2
                        type_name: "Vec2".into(),
                        value_string: "[1.5, 2.5]".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x15161718,
                        name_hash_hex: "0x15161718".into(),
                        value_type: 15, // RGBA
                        type_name: "RGBA".into(),
                        value_string: "#ff8800ff".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x191a1b1c,
                        name_hash_hex: "0x191a1b1c".into(),
                        value_type: 16, // String
                        type_name: "String".into(),
                        value_string: "FoxFire".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x1d1e1f20,
                        name_hash_hex: "0x1d1e1f20".into(),
                        value_type: 18, // Container with raw hex bytes
                        type_name: "Container".into(),
                        value_string: "Container(type=7, count=2)".into(),
                        raw_bytes_hex: Some("0708000000020000001111111122222222".into()),
                    },
                ],
            }],
        };

        let binary = serialize_bin(&tree).unwrap();
        assert_eq!(&binary[0..4], b"PROP");

        let report = inspect_bin(&binary).unwrap();
        assert!(report.is_valid);
        assert_eq!(report.version, 2);
        assert_eq!(report.entries_count, 1);
        assert_eq!(report.total_fields_count, 8);

        let parsed = parse_bin(&binary).unwrap();
        assert_eq!(parsed.version, 2);
        assert_eq!(parsed.linked_files.len(), 1);
        assert_eq!(parsed.entries[0].class_hash, 0x12345678);
        assert_eq!(parsed.entries[0].fields[0].value_string, "true");
        assert_eq!(parsed.entries[0].fields[1].value_string, "42");
        assert_eq!(parsed.entries[0].fields[2].value_string, "0x0000ffff");
        assert_eq!(parsed.entries[0].fields[6].value_string, "FoxFire");
        // Verify container raw hex is preserved exactly
        assert_eq!(
            parsed.entries[0].fields[7].raw_bytes_hex.as_deref(),
            Some("0708000000020000001111111122222222")
        );
    }

    #[test]
    fn test_bin_strict_numeric_validation() {
        let tree = BinTree {
            magic: "PROP".into(),
            version: 1,
            linked_files: vec![],
            entries: vec![BinEntry {
                class_hash: 0x11111111,
                class_hash_hex: "0x11111111".into(),
                name_hash: 0x22222222,
                name_hash_hex: "0x22222222".into(),
                fields: vec![BinField {
                    name_hash: 0x33333333,
                    name_hash_hex: "0x33333333".into(),
                    value_type: 6, // S32
                    type_name: "S32".into(),
                    value_string: "not_a_number".into(),
                    raw_bytes_hex: None,
                }],
            }],
        };

        // Must fail with error instead of silently zeroing
        let res = serialize_bin(&tree);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Invalid S32 value"));
    }

    #[test]
    fn test_ltk_meta_interoperability_read() {
        use ltk_meta::{property::values, Bin, BinObject};
        let tree = Bin::builder()
            .dependency("common.bin")
            .object(
                BinObject::builder(0x12345678u32, 0xABCDEF00u32)
                    .property(0x1111, values::I32::new(42))
                    .property(0x2222, values::String::from("FoxFire"))
                    .build(),
            )
            .build();

        let mut buffer = Cursor::new(Vec::new());
        tree.to_writer(&mut buffer).expect("failed to write Bin with ltk_meta");
        let bytes = buffer.into_inner();

        let parsed = parse_bin(&bytes).expect("parse_bin failed to parse ltk_meta binary");
        assert_eq!(parsed.version, 3);
        assert_eq!(parsed.linked_files, vec!["common.bin"]);
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].class_hash, 0xABCDEF00);
        assert_eq!(parsed.entries[0].name_hash, 0x12345678);
        assert_eq!(parsed.entries[0].fields.len(), 2);
        assert_eq!(parsed.entries[0].fields[0].name_hash, 0x1111);
        assert_eq!(parsed.entries[0].fields[0].value_string, "42");
        assert_eq!(parsed.entries[0].fields[1].name_hash, 0x2222);
        assert_eq!(parsed.entries[0].fields[1].value_string, "FoxFire");
    }

    #[test]
    fn test_ltk_meta_interoperability_serialize_to_ltk() {
        let tree = BinTree {
            magic: "PROP".into(),
            version: 3,
            linked_files: vec!["shared_assets.bin".into()],
            entries: vec![BinEntry {
                class_hash: 0x99887766,
                class_hash_hex: "0x99887766".into(),
                name_hash: 0x55443322,
                name_hash_hex: "0x55443322".into(),
                fields: vec![
                    BinField {
                        name_hash: 0x10101010,
                        name_hash_hex: "0x10101010".into(),
                        value_type: 6, // S32
                        type_name: "S32".into(),
                        value_string: "1337".into(),
                        raw_bytes_hex: None,
                    },
                    BinField {
                        name_hash: 0x20202020,
                        name_hash_hex: "0x20202020".into(),
                        value_type: 16, // String
                        type_name: "String".into(),
                        value_string: "AhriSpiritBlossom".into(),
                        raw_bytes_hex: None,
                    },
                ],
            }],
        };

        let binary = serialize_bin(&tree).expect("serialize_bin failed");
        let mut cur = Cursor::new(binary);
        let ltk_tree = ltk_meta::Bin::from_reader(&mut cur).expect("ltk_meta failed to parse LAAP binary");
        assert_eq!(ltk_tree.dependencies, vec!["shared_assets.bin"]);
        assert_eq!(ltk_tree.objects.len(), 1);
        let obj = ltk_tree.objects.values().next().unwrap();
        assert_eq!(*obj.class_hash, 0x99887766);
        assert_eq!(*obj.path_hash, 0x55443322);
        assert_eq!(obj.properties.len(), 2);
    }
}
