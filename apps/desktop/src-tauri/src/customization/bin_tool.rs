use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};

pub const BIN_MAGIC: &[u8; 4] = b"PROP";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinField {
    pub name_hash: u32,
    pub name_hash_hex: String,
    pub value_type: u8,
    pub type_name: String,
    pub value_string: String,
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
    pub version: u32,
    pub linked_files: Vec<String>,
    pub entries: Vec<BinEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinInspectionReport {
    pub is_valid: bool,
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
        15 => "Color",
        16 => "String",
        17 => "Hash",
        18 => "Container",
        19 => "Structure",
        20 => "Map",
        _ => "Unknown",
    }
}

pub fn parse_bin(bytes: &[u8]) -> Result<BinTree, String> {
    if bytes.len() < 12 {
        return Err("Binary file is too small to be a valid PROP file.".into());
    }
    if &bytes[0..4] != BIN_MAGIC {
        return Err(format!(
            "Invalid PROP magic: expected 'PROP', found {:?}",
            &bytes[0..4]
        ));
    }

    let mut cursor = Cursor::new(bytes);
    cursor.set_position(4);

    let mut version_bytes = [0u8; 4];
    cursor
        .read_exact(&mut version_bytes)
        .map_err(|e| e.to_string())?;
    let version = u32::from_le_bytes(version_bytes);

    let mut linked_count_bytes = [0u8; 4];
    cursor
        .read_exact(&mut linked_count_bytes)
        .map_err(|e| e.to_string())?;
    let linked_count = u32::from_le_bytes(linked_count_bytes) as usize;

    if linked_count > 1000 {
        return Err("Exceeded maximum supported linked files in PROP file.".into());
    }

    let mut linked_files = Vec::with_capacity(linked_count);
    for _ in 0..linked_count {
        let mut len_bytes = [0u8; 2];
        cursor
            .read_exact(&mut len_bytes)
            .map_err(|e| e.to_string())?;
        let len = u16::from_le_bytes(len_bytes) as usize;
        let mut str_bytes = vec![0u8; len];
        cursor
            .read_exact(&mut str_bytes)
            .map_err(|e| e.to_string())?;
        linked_files.push(String::from_utf8_lossy(&str_bytes).to_string());
    }

    let mut entries_count_bytes = [0u8; 4];
    cursor
        .read_exact(&mut entries_count_bytes)
        .map_err(|e| e.to_string())?;
    let entry_count = u32::from_le_bytes(entries_count_bytes) as usize;

    if entry_count > 10000 {
        return Err("Exceeded maximum supported entries in PROP file.".into());
    }

    let mut entries = Vec::with_capacity(entry_count);
    for _ in 0..entry_count {
        if cursor.position() as usize + 12 > bytes.len() {
            break;
        }
        let mut class_bytes = [0u8; 4];
        cursor
            .read_exact(&mut class_bytes)
            .map_err(|e| e.to_string())?;
        let class_hash = u32::from_le_bytes(class_bytes);

        let mut size_bytes = [0u8; 4];
        cursor
            .read_exact(&mut size_bytes)
            .map_err(|e| e.to_string())?;
        let _entry_size = u32::from_le_bytes(size_bytes);

        let mut name_bytes = [0u8; 4];
        cursor
            .read_exact(&mut name_bytes)
            .map_err(|e| e.to_string())?;
        let name_hash = u32::from_le_bytes(name_bytes);

        let mut count_bytes = [0u8; 2];
        cursor
            .read_exact(&mut count_bytes)
            .map_err(|e| e.to_string())?;
        let field_count = u16::from_le_bytes(count_bytes) as usize;

        let mut fields = Vec::with_capacity(field_count.min(256));
        for _ in 0..field_count {
            if cursor.position() as usize + 5 > bytes.len() {
                break;
            }
            let mut fname_bytes = [0u8; 4];
            cursor
                .read_exact(&mut fname_bytes)
                .map_err(|e| e.to_string())?;
            let fname_hash = u32::from_le_bytes(fname_bytes);

            let mut ftype_bytes = [0u8; 1];
            cursor
                .read_exact(&mut ftype_bytes)
                .map_err(|e| e.to_string())?;
            let val_type = ftype_bytes[0];

            let value_str = match val_type {
                1 => {
                    let mut b = [0u8; 1];
                    cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
                    format!("{}", b[0] != 0)
                }
                6 => {
                    let mut b = [0u8; 4];
                    cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
                    format!("{}", i32::from_le_bytes(b))
                }
                7 | 17 => {
                    let mut b = [0u8; 4];
                    cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
                    format!("0x{:08x}", u32::from_le_bytes(b))
                }
                10 => {
                    let mut b = [0u8; 4];
                    cursor.read_exact(&mut b).map_err(|e| e.to_string())?;
                    format!("{:.4}", f32::from_le_bytes(b))
                }
                16 => {
                    let mut len_b = [0u8; 2];
                    cursor.read_exact(&mut len_b).map_err(|e| e.to_string())?;
                    let slen = u16::from_le_bytes(len_b) as usize;
                    let mut sbytes = vec![0u8; slen];
                    cursor.read_exact(&mut sbytes).map_err(|e| e.to_string())?;
                    String::from_utf8_lossy(&sbytes).to_string()
                }
                _ => {
                    "binary_data".to_string()
                }
            };

            fields.push(BinField {
                name_hash: fname_hash,
                name_hash_hex: format!("0x{:08x}", fname_hash),
                value_type: val_type,
                type_name: type_name(val_type).into(),
                value_string: value_str,
            });
        }

        entries.push(BinEntry {
            class_hash,
            class_hash_hex: format!("0x{:08x}", class_hash),
            name_hash,
            name_hash_hex: format!("0x{:08x}", name_hash),
            fields,
        });
    }

    Ok(BinTree {
        version,
        linked_files,
        entries,
    })
}

pub fn serialize_bin(tree: &BinTree) -> Result<Vec<u8>, String> {
    let mut out = Cursor::new(Vec::new());
    out.write_all(BIN_MAGIC).map_err(|e| e.to_string())?;
    out.write_all(&tree.version.to_le_bytes())
        .map_err(|e| e.to_string())?;

    let linked_count = tree.linked_files.len() as u32;
    out.write_all(&linked_count.to_le_bytes())
        .map_err(|e| e.to_string())?;
    for file in &tree.linked_files {
        let bytes = file.as_bytes();
        let len = bytes.len() as u16;
        out.write_all(&len.to_le_bytes()).map_err(|e| e.to_string())?;
        out.write_all(bytes).map_err(|e| e.to_string())?;
    }

    let entries_count = tree.entries.len() as u32;
    out.write_all(&entries_count.to_le_bytes())
        .map_err(|e| e.to_string())?;

    for entry in &tree.entries {
        out.write_all(&entry.class_hash.to_le_bytes())
            .map_err(|e| e.to_string())?;

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
            match f.value_type {
                1 => {
                    let b = if f.value_string == "true" { 1u8 } else { 0u8 };
                    entry_buf.write_all(&[b]).map_err(|e| e.to_string())?;
                }
                6 => {
                    let v = f.value_string.parse::<i32>().unwrap_or(0);
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                7 | 17 => {
                    let hex_clean = f.value_string.trim_start_matches("0x");
                    let v = u32::from_str_radix(hex_clean, 16).unwrap_or(0);
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                10 => {
                    let v = f.value_string.parse::<f32>().unwrap_or(0.0);
                    entry_buf
                        .write_all(&v.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                }
                16 => {
                    let sbytes = f.value_string.as_bytes();
                    let slen = sbytes.len() as u16;
                    entry_buf
                        .write_all(&slen.to_le_bytes())
                        .map_err(|e| e.to_string())?;
                    entry_buf.write_all(sbytes).map_err(|e| e.to_string())?;
                }
                _ => {}
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
        let tree = BinTree {
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
                        value_type: 1,
                        type_name: "Bool".into(),
                        value_string: "true".into(),
                    },
                    BinField {
                        name_hash: 0x05060708,
                        name_hash_hex: "0x05060708".into(),
                        value_type: 6,
                        type_name: "S32".into(),
                        value_string: "42".into(),
                    },
                    BinField {
                        name_hash: 0x090a0b0c,
                        name_hash_hex: "0x090a0b0c".into(),
                        value_type: 16,
                        type_name: "String".into(),
                        value_string: "FoxFire".into(),
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
        assert_eq!(report.total_fields_count, 3);

        let parsed = parse_bin(&binary).unwrap();
        assert_eq!(parsed.version, 2);
        assert_eq!(parsed.linked_files.len(), 1);
        assert_eq!(parsed.entries[0].class_hash, 0x12345678);
        assert_eq!(parsed.entries[0].fields[0].value_string, "true");
        assert_eq!(parsed.entries[0].fields[1].value_string, "42");
        assert_eq!(parsed.entries[0].fields[2].value_string, "FoxFire");
    }
}
