//! On-demand official-skin overlay generation from local League WAD/BIN files.
//!
//! Reads the champion WAD streaming entry-by-entry (avoiding loading multi-hundred-MB
//! WADs into memory), extracts the requested skin's `.bin` (and any sub-character
//! skin bins), retargets `SkinCharacterDataProperties` onto the base `skin0` slot
//! (matching `path_hash` + rebasing `championSkinName` and padded `skn`/`skl` paths
//! so both CSLoL and LTK integrity scans accept it), and packages a valid
//! `.fantome`/`.modpkg` ZIP archive in the LAAP library.

use super::{library, storage, wad_tool};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const SKIN_DATA_CLASS_HASH: u32 = fnv1a_lower("SkinCharacterDataProperties");
const PROP_SKIN_MESH: u32 = fnv1a_lower("skinMeshProperties");
const PROP_SKELETON: u32 = fnv1a_lower("skeleton");
const PROP_SIMPLE_SKIN: u32 = fnv1a_lower("simpleSkin");
const PROP_CHAMPION_SKIN_NAME: u32 = fnv1a_lower("championSkinName");
#[allow(dead_code)]
const PROP_SKIN_AUDIO: u32 = fnv1a_lower("skinAudioProperties");
#[allow(dead_code)]
const PROP_TAG_EVENT_LIST: u32 = fnv1a_lower("tagEventList");
const STATIC_MATERIAL_DEF_CLASS: u32 = 0xFF9D_3409;
const STATIC_MATERIAL_DEF_NAME: u32 = 0x8D39_BDE6;
const MESH_PADDING_BYTES: usize = 16;
const MAX_SUBCHARACTER_SKIN_NUM: u32 = 200;
const RESOURCE_RESOLVER_CLASS_HASH: u32 = fnv1a_lower("ResourceResolver");
const PROP_M_RESOURCE_RESOLVER: u32 = fnv1a_lower("mResourceResolver");
const PROP_SKIN_PARENT: u32 = fnv1a_lower("skinParent");

/// Compute League `.bin` 32-bit FNV-1a hash (ASCII lowercased).
pub const fn fnv1a_lower(text: &str) -> u32 {
    let bytes = text.as_bytes();
    let mut hash: u32 = 0x811C_9DC5;
    let mut i = 0;
    while i < bytes.len() {
        let mut b = bytes[i];
        if b >= b'A' && b <= b'Z' {
            b += 32;
        }
        hash ^= b as u32;
        hash = hash.wrapping_mul(0x0100_0193);
        i += 1;
    }
    hash
}

fn subcharacters_for(champ_internal: &str) -> &'static [&'static str] {
    match champ_internal {
        "anivia" => &["aniviaegg", "aniviaiceblock"],
        "annie" => &["annietibbers"],
        "aphelios" => &["apheliosturret"],
        "aurora" => &["auroraspirits"],
        "azir" => &["azirsoldier", "azirsundisc", "azirtowerclicker", "azirultsoldier"],
        "bard" => &[
            "bardfollower",
            "bardhealthshrine",
            "bardpickup",
            "bardpickupnoicon",
            "bardportalclickable",
        ],
        "belveth" => &["belvethspore", "belvethvoidling"],
        "caitlyn" => &["caitlyntrap"],
        "cassiopeia" => &["cassiopeia_death"],
        "elise" => &["elisespider", "elisespiderling"],
        "fiddlesticks" => &["fiddlestickseffigy"],
        "fizz" => &["fizzbait", "fizzshark"],
        "gangplank" => &["gangplankbarrel"],
        "gnar" => &["gnarbig"],
        "heimerdinger" => &["heimertblue", "heimertyellow"],
        "illaoi" => &["illaoiminion"],
        "irelia" => &["ireliablades"],
        "ivern" => &["ivernminion", "iverntotem"],
        "jarvaniv" => &["jarvanivstandard", "jarvanivwall"],
        "jhin" => &["jhintrap"],
        "jinx" => &["jinxmine"],
        "kalista" => &["kalistaaltar", "kalistaspawn"],
        "kindred" => &["kindredjunglebountyminion", "kindredwolf"],
        "kled" => &["kledmount", "kledrider"],
        "kogmaw" => &["kogmawdead"],
        "lissandra" => &["lissandrapassive"],
        "lulu" => &["lulufaerie", "lulupolymorphcritter"],
        "lux" => &[
            "luxair",
            "luxdark",
            "luxfire",
            "luxice",
            "luxmagma",
            "luxmystic",
            "luxnature",
            "luxstorm",
            "luxwater",
        ],
        "malzahar" => &["malzaharvoidling"],
        "maokai" => &["maokaisproutling"],
        "milio" => &["miliominion"],
        "monkeyking" => &["monkeykingclone", "monkeykingflying"],
        "naafiri" => &["naafiripackmate"],
        "nasus" => &["nasusult"],
        "nidalee" => &["nidaleecougar", "nidaleespear"],
        "nunu" => &["nunusnowball"],
        "olaf" => &["olafaxe"],
        "orianna" => &["oriannaball", "oriannanoball"],
        "ornn" => &["ornnram"],
        "quinn" => &["quinnvalor"],
        "rammus" => &["rammusdbc", "rammuspb"],
        "reksai" => &["reksaitunnel"],
        "senna" => &["sennasoul"],
        "shaco" => &["shacobox"],
        "shen" => &["shenspirit"],
        "shyvana" => &["shyvanadragon"],
        "sona" => &["sonadjgenre01", "sonadjgenre02", "sonadjgenre03"],
        "swain" => &["swaindemonform"],
        "syndra" => &["syndraorbs", "syndrasphere"],
        "taliyah" => &["taliyahwallchunk"],
        "teemo" => &["teemomushroom"],
        "thresh" => &["threshlantern"],
        "trundle" => &["trundlewall"],
        "viego" => &["viegosoul"],
        "viktor" => &["viktorsingularity"],
        "yorick" => &[
            "yorickbigghoul",
            "yorickghoulmelee",
            "yorickwghoul",
            "yorickwinvisible",
        ],
        "zac" => &["zacrebirthbloblet"],
        "zed" => &["zedshadow"],
        "zoe" => &["zoeorbs"],
        "zyra" => &[
            "zyragraspingplant",
            "zyrapassive",
            "zyraseed",
            "zyrathornplant",
        ],
        _ => &[],
    }
}

fn normalize_internal_champion(id_or_name: &str) -> String {
    let cleaned: String = id_or_name
        .chars()
        .filter(|c| !matches!(c, '\'' | ' ' | '.'))
        .map(|c| c.to_ascii_lowercase())
        .collect();
    match cleaned.as_str() {
        "wukong" => "monkeyking".into(),
        "renataglasc" => "renata".into(),
        "nunu&willump" | "nunuwillump" => "nunu".into(),
        _ => cleaned,
    }
}

struct StreamingGameWad {
    file: File,
    total_len: u64,
    by_hash: HashMap<u64, wad_tool::WadEntry>,
    toc: Option<Vec<wad_tool::WadSubchunkRecord>>,
}

impl StreamingGameWad {
    fn open(path: &Path) -> Result<Self, String> {
        let mut file = File::open(path)
            .map_err(|e| format!("Failed opening champion WAD '{}': {e}", path.display()))?;
        let total_len = file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let (_, _, entries) = wad_tool::parse_wad_reader(&mut file, total_len)?;
        let toc = wad_tool::detect_subchunk_toc(&mut file, total_len, &entries);
        let mut by_hash = HashMap::with_capacity(entries.len());
        for e in entries {
            by_hash.entry(e.path_hash).or_insert(e);
        }
        Ok(Self {
            file,
            total_len,
            by_hash,
            toc,
        })
    }

    fn read_path(&mut self, rel_path: &str) -> Result<Option<Vec<u8>>, String> {
        let norm = rel_path.replace('\\', "/").to_ascii_lowercase();
        let h = wad_tool::xxhash64(norm.as_bytes(), 0);
        let Some(entry) = self.by_hash.get(&h).cloned() else {
            return Ok(None);
        };
        if entry.compression_type == 2 {
            return Ok(None);
        }
        let bytes = wad_tool::decompress_entry_from_reader(
            &mut self.file,
            self.total_len,
            &entry,
            self.toc.as_deref(),
        )?;
        Ok(Some(bytes))
    }
}

#[derive(Clone, Debug)]
enum PropVal {
    Fixed(u8, Vec<u8>),
    None,
    Str(String),
    List(u8, u8, Vec<PropVal>),
    Struct(u8, Option<PropEmbed>),
    OptionVal(u8, Option<Box<PropVal>>),
    Map(u8, u8, Vec<(PropVal, PropVal)>),
}

#[derive(Clone, Debug)]
struct PropEmbed {
    name_hash: u32,
    fields: Vec<PropField>,
}

#[derive(Clone, Debug)]
struct PropField {
    name_hash: u32,
    value: PropVal,
}

#[derive(Clone, Debug)]
struct PropEntry {
    #[allow(dead_code)]
    type_hash: u32,
    path_hash: u32,
    fields: Vec<PropField>,
}

fn prop_fixed_size(ty: u8) -> Option<usize> {
    // 0: None, 1: Bool, 2: I8, 3: U8, 4: I16, 5: U16, 6: I32, 7: U32, 8: I64, 9: U64,
    // 10: F32, 11: Vec2, 12: Vec3, 13: Vec4, 14: Mtx44, 15: RGBA,
    // 0x10: String, 0x11: Hash, 0x12: File, 0x80..0x87 containers
    match ty {
        1 | 2 | 3 | 0x87 => Some(1),
        4 | 5 => Some(2),
        6 | 7 | 10 | 15 | 0x11 | 0x84 => Some(4),
        8 | 9 | 11 | 0x12 => Some(8),
        12 => Some(12),
        13 => Some(16),
        14 => Some(64),
        _ => None,
    }
}

struct PropCursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> PropCursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let end = self
            .pos
            .checked_add(n)
            .ok_or_else(|| "PropBin offset overflow".to_string())?;
        if end > self.data.len() {
            return Err(format!(
                "PropBin unexpected EOF at {} (need {n}, len {})",
                self.pos,
                self.data.len()
            ));
        }
        let slice = &self.data[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, String> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn u32(&mut self) -> Result<u32, String> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn string(&mut self) -> Result<String, String> {
        let len = self.u16()? as usize;
        let b = self.take(len)?;
        Ok(String::from_utf8_lossy(b).into_owned())
    }

    fn read_fields(&mut self, owner_class: u32) -> Result<Vec<PropField>, String> {
        let count = self.u16()? as usize;
        let mut fields = Vec::with_capacity(count);
        for _ in 0..count {
            let name_hash = self.u32()?;
            let ty = self.u8()?;
            let val = if ty == 0x11
                && owner_class == STATIC_MATERIAL_DEF_CLASS
                && name_hash == STATIC_MATERIAL_DEF_NAME
            {
                PropVal::Fixed(ty, self.take(8)?.to_vec())
            } else {
                self.read_value(ty)?
            };
            fields.push(PropField {
                name_hash,
                value: val,
            });
        }
        Ok(fields)
    }

    fn read_value(&mut self, ty: u8) -> Result<PropVal, String> {
        if let Some(sz) = prop_fixed_size(ty) {
            return Ok(PropVal::Fixed(ty, self.take(sz)?.to_vec()));
        }
        match ty {
            0 => Ok(PropVal::None),
            0x10 => Ok(PropVal::Str(self.string()?)),
            0x80 | 0x81 => {
                let elem_ty = self.u8()?;
                let _size = self.u32()?;
                let count = self.u32()? as usize;
                let mut items = Vec::with_capacity(count.min(4096));
                for _ in 0..count {
                    items.push(self.read_value(elem_ty)?);
                }
                Ok(PropVal::List(ty, elem_ty, items))
            }
            0x82 | 0x83 => {
                let name_hash = self.u32()?;
                if name_hash == 0 {
                    return Ok(PropVal::Struct(ty, None));
                }
                let _size = self.u32()?;
                let fields = self.read_fields(name_hash)?;
                Ok(PropVal::Struct(
                    ty,
                    Some(PropEmbed { name_hash, fields }),
                ))
            }
            0x85 => {
                let elem_ty = self.u8()?;
                let present = self.u8()? != 0;
                let inner = if present {
                    Some(Box::new(self.read_value(elem_ty)?))
                } else {
                    None
                };
                Ok(PropVal::OptionVal(elem_ty, inner))
            }
            0x86 => {
                let k_ty = self.u8()?;
                let v_ty = self.u8()?;
                let _size = self.u32()?;
                let count = self.u32()? as usize;
                let mut pairs = Vec::with_capacity(count.min(4096));
                for _ in 0..count {
                    let k = self.read_value(k_ty)?;
                    let v = self.read_value(v_ty)?;
                    pairs.push((k, v));
                }
                Ok(PropVal::Map(k_ty, v_ty, pairs))
            }
            _ => Err(format!("Unknown PropBin type tag 0x{ty:02x}")),
        }
    }
}

fn write_prop_str(out: &mut Vec<u8>, s: &str) {
    let b = s.as_bytes();
    out.extend_from_slice(&(b.len() as u16).to_le_bytes());
    out.extend_from_slice(b);
}

fn write_prop_fields(out: &mut Vec<u8>, fields: &[PropField]) {
    out.extend_from_slice(&(fields.len() as u16).to_le_bytes());
    for f in fields {
        out.extend_from_slice(&f.name_hash.to_le_bytes());
        out.push(val_type_tag(&f.value));
        write_prop_val(out, &f.value);
    }
}

fn val_type_tag(v: &PropVal) -> u8 {
    match v {
        PropVal::Fixed(ty, _) => *ty,
        PropVal::None => 0,
        PropVal::Str(_) => 0x10,
        PropVal::List(ty, _, _) => *ty,
        PropVal::Struct(ty, _) => *ty,
        PropVal::OptionVal(_, _) => 0x85,
        PropVal::Map(_, _, _) => 0x86,
    }
}

fn write_prop_val(out: &mut Vec<u8>, v: &PropVal) {
    match v {
        PropVal::Fixed(_, raw) => out.extend_from_slice(raw),
        PropVal::None => {}
        PropVal::Str(s) => write_prop_str(out, s),
        PropVal::List(_, elem_ty, items) => {
            let mut body = Vec::new();
            body.extend_from_slice(&(items.len() as u32).to_le_bytes());
            for item in items {
                write_prop_val(&mut body, item);
            }
            out.push(*elem_ty);
            out.extend_from_slice(&(body.len() as u32).to_le_bytes());
            out.extend_from_slice(&body);
        }
        PropVal::Struct(_, None) => {
            out.extend_from_slice(&0u32.to_le_bytes());
        }
        PropVal::Struct(_, Some(emb)) => {
            let mut body = Vec::new();
            write_prop_fields(&mut body, &emb.fields);
            out.extend_from_slice(&emb.name_hash.to_le_bytes());
            out.extend_from_slice(&(body.len() as u32).to_le_bytes());
            out.extend_from_slice(&body);
        }
        PropVal::OptionVal(elem_ty, inner) => {
            out.push(*elem_ty);
            match inner {
                Some(val) => {
                    out.push(1);
                    write_prop_val(out, val);
                }
                None => out.push(0),
            }
        }
        PropVal::Map(k_ty, v_ty, pairs) => {
            let mut body = Vec::new();
            body.extend_from_slice(&(pairs.len() as u32).to_le_bytes());
            for (k, val) in pairs {
                write_prop_val(&mut body, k);
                write_prop_val(&mut body, val);
            }
            out.push(*k_ty);
            out.push(*v_ty);
            out.extend_from_slice(&(body.len() as u32).to_le_bytes());
            out.extend_from_slice(&body);
        }
    }
}

fn serialize_prop_entry(entry: &PropEntry) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(&entry.path_hash.to_le_bytes());
    write_prop_fields(&mut body, &entry.fields);
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

struct PropFile<'a> {
    raw: &'a [u8],
    types: Vec<u32>,
    spans: Vec<(usize, usize)>,
}

impl<'a> PropFile<'a> {
    fn parse(raw: &'a [u8]) -> Result<Self, String> {
        let mut c = PropCursor::new(raw);
        let mut magic = c.take(4)?;
        if magic == b"PTCH" {
            let _ = c.take(8)?;
            magic = c.take(4)?;
        }
        if magic != b"PROP" {
            return Err("Not a PROP bin file.".into());
        }
        let version = c.u32()?;
        if version >= 2 {
            let linked = c.u32()? as usize;
            for _ in 0..linked {
                let len = c.u16()? as usize;
                let _ = c.take(len)?;
            }
        }
        let count = c.u32()? as usize;
        let mut types = Vec::with_capacity(count.min(65536));
        for _ in 0..count {
            types.push(c.u32()?);
        }
        let mut spans = Vec::with_capacity(types.len());
        let mut pos = c.pos;
        for _ in &types {
            if pos + 4 > raw.len() {
                return Err("PropBin entry size past EOF.".into());
            }
            let sz = u32::from_le_bytes([raw[pos], raw[pos + 1], raw[pos + 2], raw[pos + 3]]) as usize;
            let end = pos + 4 + sz;
            if end > raw.len() {
                return Err("PropBin entry body past EOF.".into());
            }
            spans.push((pos, end));
            pos = end;
        }
        Ok(Self { raw, types, spans })
    }

    fn read_skin_data_entry(&self) -> Result<Option<(usize, PropEntry)>, String> {
        let Some(idx) = self.types.iter().position(|&t| t == SKIN_DATA_CLASS_HASH) else {
            return Ok(None);
        };
        let (start, end) = self.spans[idx];
        let mut c = PropCursor::new(&self.raw[start + 4..end]);
        let path_hash = c.u32()?;
        let fields = c.read_fields(SKIN_DATA_CLASS_HASH)?;
        Ok(Some((
            idx,
            PropEntry {
                type_hash: SKIN_DATA_CLASS_HASH,
                path_hash,
                fields,
            },
        )))
    }

    fn read_entry_path_hash(&self, idx: usize) -> Option<u32> {
        let (start, end) = *self.spans.get(idx)?;
        if end < start + 8 {
            return None;
        }
        let b = &self.raw[start + 4..start + 8];
        Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    #[cfg(test)]
    fn rewrite_entry(&self, target_idx: usize, entry: &PropEntry) -> Vec<u8> {
        self.rewrite_skin_and_resolver(target_idx, entry, None)
    }

    fn rewrite_skin_and_resolver(
        &self,
        skin_idx: usize,
        skin_entry: &PropEntry,
        resolver_retarget: Option<(usize, u32)>,
    ) -> Vec<u8> {
        let head_end = self.spans.first().map(|s| s.0).unwrap_or(self.raw.len());
        let mut out = Vec::with_capacity(self.raw.len() + 256);
        out.extend_from_slice(&self.raw[..head_end]);
        for (i, &(start, end)) in self.spans.iter().enumerate() {
            if i == skin_idx {
                out.extend_from_slice(&serialize_prop_entry(skin_entry));
            } else if let Some((res_idx, new_path_hash)) = resolver_retarget {
                if i == res_idx && end >= start + 8 {
                    out.extend_from_slice(&self.raw[start..start + 4]);
                    out.extend_from_slice(&new_path_hash.to_le_bytes());
                    out.extend_from_slice(&self.raw[start + 8..end]);
                } else {
                    out.extend_from_slice(&self.raw[start..end]);
                }
            } else {
                out.extend_from_slice(&self.raw[start..end]);
            }
        }
        if let Some(&(_, tail)) = self.spans.last() {
            if tail < self.raw.len() {
                out.extend_from_slice(&self.raw[tail..]);
            }
        }
        out
    }
}

fn find_field_link(fields: &[PropField], hash: u32) -> Option<(u8, u32)> {
    fields.iter().find(|f| f.name_hash == hash).and_then(|f| match &f.value {
        PropVal::Fixed(ty @ (0x84 | 0x11), bytes) if bytes.len() == 4 => Some((
            *ty,
            u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        )),
        _ => None,
    })
}

fn set_field_link(fields: &mut Vec<PropField>, hash: u32, default_ty: u8, target_hash: u32) {
    let bytes = target_hash.to_le_bytes().to_vec();
    if let Some(f) = fields.iter_mut().find(|f| f.name_hash == hash) {
        let ty = match f.value {
            PropVal::Fixed(existing_ty @ (0x84 | 0x11), _) => existing_ty,
            _ => default_ty,
        };
        f.value = PropVal::Fixed(ty, bytes);
    } else {
        fields.push(PropField {
            name_hash: hash,
            value: PropVal::Fixed(default_ty, bytes),
        });
    }
}

fn find_field_i32(fields: &[PropField], hash: u32) -> Option<i32> {
    fields.iter().find(|f| f.name_hash == hash).and_then(|f| match &f.value {
        PropVal::Fixed(0x06 | 0x07, bytes) if bytes.len() == 4 => {
            Some(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        }
        _ => None,
    })
}

fn find_field_str<'a>(fields: &'a [PropField], hash: u32) -> Option<&'a str> {
    fields.iter().find(|f| f.name_hash == hash).and_then(|f| match &f.value {
        PropVal::Str(s) => Some(s.as_str()),
        _ => None,
    })
}

fn set_field_str(fields: &mut Vec<PropField>, hash: u32, text: String) {
    if let Some(f) = fields.iter_mut().find(|f| f.name_hash == hash) {
        f.value = PropVal::Str(text);
    } else {
        fields.push(PropField {
            name_hash: hash,
            value: PropVal::Str(text),
        });
    }
}

fn mesh_paths(entry: &PropEntry) -> (Option<String>, Option<String>) {
    let Some(mesh_field) = entry.fields.iter().find(|f| f.name_hash == PROP_SKIN_MESH) else {
        return (None, None);
    };
    let PropVal::Struct(_, Some(embed)) = &mesh_field.value else {
        return (None, None);
    };
    let skel = find_field_str(&embed.fields, PROP_SKELETON)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    let simple = find_field_str(&embed.fields, PROP_SIMPLE_SKIN)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    (skel, simple)
}

fn set_mesh_path(entry: &mut PropEntry, field_hash: u32, new_path: String) {
    if let Some(mesh_field) = entry.fields.iter_mut().find(|f| f.name_hash == PROP_SKIN_MESH) {
        if let PropVal::Struct(_, Some(embed)) = &mut mesh_field.value {
            set_field_str(&mut embed.fields, field_hash, new_path);
        }
    }
}

/// Generate and cache a local mod package for an official champion skin by
/// extracting and rebasing the target skin `.bin` (plus sub-characters and padded
/// mesh/skeleton assets) from the local League champion WAD onto the `skin0` slot.
fn synthetic_official_mod_id(champion_id: &str, skin_num: u32, full_skin_id: u32) -> String {
    format!(
        "official_{champion_id}_{skin_num}_{}",
        &format!(
            "{:x}",
            Sha256::digest(format!("v3:{champion_id}:{skin_num}:{full_skin_id}").as_bytes())
        )[..16]
    )
}

#[allow(dead_code)]
pub fn ensure_official_skin_mod(
    app: &AppHandle,
    champion_id: &str,
    champion_name: &str,
    champion_key: Option<&str>,
    skin_num: u32,
    full_skin_id: u32,
) -> Result<String, String> {
    let root = storage::root(app)?;
    let synthetic_id = synthetic_official_mod_id(champion_id, skin_num, full_skin_id);
    let lib_dir = root.join("library");
    let content_dir = lib_dir.join("content");
    fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;

    if let Ok(rows) = library::list_installed_at(&root) {
        if let Some(existing) = rows.iter().find(|m| m.manifest.mod_id == synthetic_id) {
            if content_dir.join(&existing.manifest.sha256).is_file() {
                return Ok(existing.manifest.sha256.clone());
            }
        }
    }

    let game_install = super::game_path::resolve_validated_game_install(app)?;
    let final_dir = wad_tool::find_game_final_dir(
        &game_install.install_dir,
        game_install.game_dir.as_deref(),
    )
    .ok_or_else(|| "League DATA/FINAL directory not found.".to_string())?;

    ensure_official_skin_mod_at(
        &root,
        &final_dir,
        champion_id,
        champion_name,
        champion_key,
        skin_num,
        full_skin_id,
    )
}

pub(crate) fn ensure_official_skin_mod_at(
    root: &Path,
    final_dir: &Path,
    champion_id: &str,
    champion_name: &str,
    champion_key: Option<&str>,
    skin_num: u32,
    full_skin_id: u32,
) -> Result<String, String> {
    let synthetic_id = synthetic_official_mod_id(champion_id, skin_num, full_skin_id);
    let lib_dir = root.join("library");
    let content_dir = lib_dir.join("content");
    fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;

    if let Ok(rows) = library::list_installed_at(root) {
        if let Some(existing) = rows.iter().find(|m| m.manifest.mod_id == synthetic_id) {
            if content_dir.join(&existing.manifest.sha256).is_file() {
                return Ok(existing.manifest.sha256.clone());
            }
        }
    }

    let wad_path = find_champion_wad(final_dir, champion_id, champion_name)?;
    let wad_file_name = wad_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Champion.wad.client")
        .to_string();

    let mut game_wad = StreamingGameWad::open(&wad_path)?;
    let champ_internal = normalize_internal_champion(
        wad_file_name.trim_end_matches(".wad.client"),
    );

    let mut characters = vec![champ_internal.as_str()];
    characters.extend_from_slice(subcharacters_for(&champ_internal));

    let mut wad_entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut padded_paths_seen: HashMap<String, String> = HashMap::new();

    for (idx, character) in characters.iter().enumerate() {
        let base_bin_path = format!("data/characters/{character}/skins/skin0.bin");
        let skin_bin_path = format!("data/characters/{character}/skins/skin{skin_num}.bin");

        let Some(target_raw) = game_wad.read_path(&skin_bin_path)? else {
            if idx == 0 {
                return Err(format!(
                    "Skin {skin_num} data ('{skin_bin_path}') not found in '{}'.",
                    wad_file_name
                ));
            }
            continue;
        };

        if skin_num == 0 {
            wad_entries.push((base_bin_path, target_raw));
            continue;
        }

        let Some(base_raw) = game_wad.read_path(&base_bin_path)? else {
            if idx == 0 {
                return Err(format!(
                    "Base skin0 data ('{base_bin_path}') not found in '{}'.",
                    wad_file_name
                ));
            }
            continue;
        };

        let target_prop = PropFile::parse(&target_raw)?;
        let base_prop = PropFile::parse(&base_raw)?;
        let (target_idx, mut target_entry) = target_prop
            .read_skin_data_entry()?
            .ok_or_else(|| format!("SkinCharacterDataProperties missing in '{skin_bin_path}'"))?;
        let (_, base_entry) = base_prop
            .read_skin_data_entry()?
            .ok_or_else(|| format!("SkinCharacterDataProperties missing in '{base_bin_path}'"))?;

        // 1) Retarget SkinCharacterDataProperties path_hash and mResourceResolver to Skin0's identity.
        target_entry.path_hash = base_entry.path_hash;
        let base_resolver_idx = base_prop
            .types
            .iter()
            .position(|&t| t == RESOURCE_RESOLVER_CLASS_HASH);
        let base_resolver_link = find_field_link(&base_entry.fields, PROP_M_RESOURCE_RESOLVER);
        let base_resolver_hash = base_resolver_link
            .map(|(_, h)| h)
            .or_else(|| base_resolver_idx.and_then(|i| base_prop.read_entry_path_hash(i)));
        if let Some(res_hash) = base_resolver_hash {
            let tag = base_resolver_link.map(|(ty, _)| ty).unwrap_or(0x84);
            set_field_link(&mut target_entry.fields, PROP_M_RESOURCE_RESOLVER, tag, res_hash);
        }

        // 2) Rebase championSkinName to base skin's name.
        if let Some(base_name) = find_field_str(&base_entry.fields, PROP_CHAMPION_SKIN_NAME) {
            set_field_str(
                &mut target_entry.fields,
                PROP_CHAMPION_SKIN_NAME,
                base_name.to_string(),
            );
        }

        // 3) Copy skin's SKL/SKN to base paths with +16 zero padding and update skinMeshProperties
        //    so base skin integrity scans accept it cleanly while keeping the skin's own geometry.
        //    For chromas that omit skeleton/simpleSkin and inherit via skinParent, resolve from parent skin.
        let (mut skin_skel, mut skin_simple) = mesh_paths(&target_entry);
        if skin_skel.is_none() || skin_simple.is_none() {
            if let Some(parent_num) =
                find_field_i32(&target_entry.fields, PROP_SKIN_PARENT).filter(|&p| p >= 0)
            {
                let parent_path = format!("data/characters/{character}/skins/skin{parent_num}.bin");
                if let Some(parent_raw) = game_wad.read_path(&parent_path)? {
                    if let Ok(parent_prop) = PropFile::parse(&parent_raw) {
                        if let Ok(Some((_, parent_entry))) = parent_prop.read_skin_data_entry() {
                            let (p_skel, p_simple) = mesh_paths(&parent_entry);
                            if skin_skel.is_none() {
                                skin_skel = p_skel;
                            }
                            if skin_simple.is_none() {
                                skin_simple = p_simple;
                            }
                        }
                    }
                }
            }
        }
        let (base_skel, base_simple) = mesh_paths(&base_entry);

        for (field_hash, skin_p_opt, base_p_opt) in [
            (PROP_SKELETON, skin_skel, base_skel),
            (PROP_SIMPLE_SKIN, skin_simple, base_simple),
        ] {
            if let (Some(sp), Some(bp)) = (skin_p_opt, base_p_opt) {
                let bp_lower = bp.replace('\\', "/").to_ascii_lowercase();
                let sp_lower = sp.replace('\\', "/").to_ascii_lowercase();
                if sp_lower == bp_lower {
                    continue;
                }
                if let Some(existing_source) = padded_paths_seen.get(&bp_lower) {
                    if *existing_source == sp_lower {
                        set_mesh_path(&mut target_entry, field_hash, bp);
                    }
                    continue;
                }
                if let Some(mut mesh_bytes) = game_wad.read_path(&sp)? {
                    mesh_bytes.resize(mesh_bytes.len() + MESH_PADDING_BYTES, 0);
                    padded_paths_seen.insert(bp_lower.clone(), sp_lower);
                    wad_entries.push((bp_lower, mesh_bytes));
                    set_mesh_path(&mut target_entry, field_hash, bp);
                }
            }
        }

        let target_resolver_idx = target_prop
            .types
            .iter()
            .position(|&t| t == RESOURCE_RESOLVER_CLASS_HASH);
        let rebased_bin = target_prop.rewrite_skin_and_resolver(
            target_idx,
            &target_entry,
            target_resolver_idx.zip(base_resolver_hash),
        );
        wad_entries.push((base_bin_path, rebased_bin));
    }

    if wad_entries.is_empty() || skin_num > MAX_SUBCHARACTER_SKIN_NUM && wad_entries.is_empty() {
        return Err(format!(
            "Could not build overlay entries for {champion_name} skin {skin_num}."
        ));
    }

    let overlay_wad_bytes = wad_tool::create_wad_v3(&wad_entries)?;
    let display_name = format!("{champion_name} - Skin {skin_num}");
    let info_json = serde_json::to_vec_pretty(&json!({
        "Author": "LAAP Auto",
        "Description": format!("On-demand official skin overlay for {champion_name} (skin {skin_num})"),
        "Name": display_name,
        "Version": "1.0.0",
    }))
    .map_err(|e| e.to_string())?;

    let wad_rel = format!("WAD/{wad_file_name}");
    let info_rel = "META/info.json".to_string();

    let mut zip_buf = Cursor::new(Vec::new());
    {
        let mut zw = zip::ZipWriter::new(&mut zip_buf);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        zw.start_file(&info_rel, opts).map_err(|e| e.to_string())?;
        zw.write_all(&info_json).map_err(|e| e.to_string())?;
        zw.start_file(&wad_rel, opts).map_err(|e| e.to_string())?;
        zw.write_all(&overlay_wad_bytes).map_err(|e| e.to_string())?;
        zw.finish().map_err(|e| e.to_string())?;
    }
    let archive_bytes = zip_buf.into_inner();
    let archive_sha = format!("{:x}", Sha256::digest(&archive_bytes));
    let info_sha = format!("{:x}", Sha256::digest(&info_json));
    let wad_sha = format!("{:x}", Sha256::digest(&overlay_wad_bytes));

    let manifest = library::Manifest {
        schema_version: 1,
        mod_id: synthetic_id,
        version: "1.0.0".into(),
        display_name,
        author: "LAAP Auto".into(),
        license: "Local-use-only".into(),
        right_to_distribute: false,
        contains_paid_riot_content: true,
        sha256: archive_sha.clone(),
        supported_game_builds: vec![],
        champion_ids: parse_champion_numeric_key(champion_key).into_iter().collect(),
        files: vec![
            library::Entry {
                relative_path: info_rel,
                sha256: info_sha,
                size_bytes: info_json.len() as u64,
            },
            library::Entry {
                relative_path: wad_rel,
                sha256: wad_sha,
                size_bytes: overlay_wad_bytes.len() as u64,
            },
        ],
        attribution_url: None,
        notes: Some("Auto-generated official skin overlay from local WAD.".into()),
    };

    library::validate_archive(&archive_bytes, &manifest)?;
    install_generated_mod(&lib_dir, &archive_bytes, manifest)?;
    Ok(archive_sha)
}

fn parse_champion_numeric_key(key: Option<&str>) -> Option<u32> {
    key.and_then(|k| k.parse::<u32>().ok()).filter(|&n| n > 0)
}

fn find_champion_wad(
    final_dir: &Path,
    champion_id: &str,
    champion_name: &str,
) -> Result<PathBuf, String> {
    let internal = normalize_internal_champion(champion_id);
    let candidate_names = [
        format!("Champions/{champion_id}.wad.client"),
        format!("Champions/{}.wad.client", champion_id.to_ascii_lowercase()),
        format!("Champions/{internal}.wad.client"),
        format!("Champions/{champion_name}.wad.client"),
        format!("Champions/{}.wad.client", champion_name.to_ascii_lowercase()),
        format!("Champions/{}.wad.client", champion_id.replace(' ', "")),
    ];
    for rel in &candidate_names {
        if let Ok(p) = wad_tool::resolve_safe_game_archive(final_dir, rel) {
            return Ok(p);
        }
    }
    let champs_dir = final_dir.join("Champions");
    if let Ok(rd) = fs::read_dir(&champs_dir) {
        let want_id = normalize_internal_champion(champion_id);
        let want_name = normalize_internal_champion(champion_name);
        for entry in rd.flatten() {
            let p = entry.path();
            let n = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !n.ends_with(".wad.client") || n.contains('.') && n.matches('.').count() > 2 {
                // skip localized <Champ>.<locale>.wad.client
                if n.trim_end_matches(".wad.client").contains('.') {
                    continue;
                }
            }
            if !n.ends_with(".wad.client") {
                continue;
            }
            let stem = normalize_internal_champion(n.trim_end_matches(".wad.client"));
            if stem == want_id || stem == want_name {
                return Ok(p);
            }
        }
    }
    Err(format!(
        "Champion WAD not found for {champion_name} ({champion_id})."
    ))
}

fn install_generated_mod(
    lib_dir: &Path,
    archive_bytes: &[u8],
    manifest: library::Manifest,
) -> Result<(), String> {
    let content_dir = lib_dir.join("content");
    fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;
    let blob_path = content_dir.join(&manifest.sha256);
    fs::write(&blob_path, archive_bytes).map_err(|e| e.to_string())?;

    let index_path = lib_dir.join("index.json");
    let mut rows: Vec<library::InstalledMod> =
        storage::read(&index_path, 12 * 1024 * 1024)?.unwrap_or_default();
    let sha = manifest.sha256.clone();
    let entry = library::InstalledMod {
        manifest,
        archive_bytes: archive_bytes.len() as u64,
        format: "fantome".into(),
        enabled: false,
        priority: (rows.len() as u32).saturating_add(1),
    };
    if let Some(existing) = rows.iter_mut().find(|r| r.manifest.sha256 == sha) {
        *existing = entry;
    } else {
        rows.push(entry);
    }
    storage::write(&index_path, &rows)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_synthetic_skin_prop_bin(
        skin_path: &str,
        champ_skin_name: &str,
        skel_path: &str,
        simple_path: &str,
        extra_raw_entry: Option<(u32, &[u8])>,
    ) -> Vec<u8> {
        let skin_entry = PropEntry {
            type_hash: SKIN_DATA_CLASS_HASH,
            path_hash: fnv1a_lower(skin_path),
            fields: vec![
                PropField {
                    name_hash: PROP_CHAMPION_SKIN_NAME,
                    value: PropVal::Str(champ_skin_name.to_string()),
                },
                PropField {
                    name_hash: PROP_SKIN_MESH,
                    value: PropVal::Struct(
                        0x83,
                        Some(PropEmbed {
                            name_hash: fnv1a_lower("SkinMeshDataProperties"),
                            fields: vec![
                                PropField {
                                    name_hash: PROP_SKELETON,
                                    value: PropVal::Str(skel_path.to_string()),
                                },
                                PropField {
                                    name_hash: PROP_SIMPLE_SKIN,
                                    value: PropVal::Str(simple_path.to_string()),
                                },
                            ],
                        }),
                    ),
                },
            ],
        };

        let mut types = Vec::new();
        let mut blobs = Vec::new();
        if let Some((ty, raw_body)) = extra_raw_entry {
            types.push(ty);
            let mut framed = Vec::with_capacity(4 + raw_body.len());
            framed.extend_from_slice(&(raw_body.len() as u32).to_le_bytes());
            framed.extend_from_slice(raw_body);
            blobs.push(framed);
        }
        types.push(SKIN_DATA_CLASS_HASH);
        blobs.push(serialize_prop_entry(&skin_entry));

        let mut out = Vec::new();
        out.extend_from_slice(b"PROP");
        out.extend_from_slice(&2u32.to_le_bytes()); // version 2
        out.extend_from_slice(&0u32.to_le_bytes()); // 0 linked files
        out.extend_from_slice(&(types.len() as u32).to_le_bytes());
        for t in types {
            out.extend_from_slice(&t.to_le_bytes());
        }
        for b in blobs {
            out.extend_from_slice(&b);
        }
        out
    }

    #[test]
    fn ensure_official_skin_mod_at_retargets_resource_resolver_and_chroma_parent() {
        fn build_prop_with_resolver(
            skin_path: &str,
            skin_name: &str,
            skel: Option<&str>,
            simple: Option<&str>,
            resolver_path: &str,
            parent_num: Option<i32>,
            extra_opaque: Option<(u32, &[u8])>,
        ) -> Vec<u8> {
            let mut mesh_fields = Vec::new();
            if let Some(s) = skel {
                mesh_fields.push(PropField {
                    name_hash: PROP_SKELETON,
                    value: PropVal::Str(s.into()),
                });
            }
            if let Some(s) = simple {
                mesh_fields.push(PropField {
                    name_hash: PROP_SIMPLE_SKIN,
                    value: PropVal::Str(s.into()),
                });
            }
            let mut fields = vec![PropField {
                name_hash: PROP_CHAMPION_SKIN_NAME,
                value: PropVal::Str(skin_name.into()),
            }];
            if let Some(p) = parent_num {
                fields.push(PropField {
                    name_hash: PROP_SKIN_PARENT,
                    value: PropVal::Fixed(0x06, p.to_le_bytes().to_vec()),
                });
            }
            fields.push(PropField {
                name_hash: PROP_M_RESOURCE_RESOLVER,
                value: PropVal::Fixed(0x84, fnv1a_lower(resolver_path).to_le_bytes().to_vec()),
            });
            fields.push(PropField {
                name_hash: PROP_SKIN_MESH,
                value: PropVal::Struct(
                    0x83,
                    Some(PropEmbed {
                        name_hash: fnv1a_lower("SkinMeshDataProperties"),
                        fields: mesh_fields,
                    }),
                ),
            });

            let skin_entry = PropEntry {
                type_hash: SKIN_DATA_CLASS_HASH,
                path_hash: fnv1a_lower(skin_path),
                fields,
            };
            let resolver_entry = PropEntry {
                type_hash: RESOURCE_RESOLVER_CLASS_HASH,
                path_hash: fnv1a_lower(resolver_path),
                fields: vec![PropField {
                    name_hash: fnv1a_lower("resourceMap"),
                    value: PropVal::Map(0x11, 0x84, vec![]),
                }],
            };

            let mut types = vec![SKIN_DATA_CLASS_HASH];
            let mut blobs = vec![serialize_prop_entry(&skin_entry)];
            if let Some((ty, raw_body)) = extra_opaque {
                types.push(ty);
                let mut framed = Vec::with_capacity(4 + raw_body.len());
                framed.extend_from_slice(&(raw_body.len() as u32).to_le_bytes());
                framed.extend_from_slice(raw_body);
                blobs.push(framed);
            }
            types.push(RESOURCE_RESOLVER_CLASS_HASH);
            blobs.push(serialize_prop_entry(&resolver_entry));

            let mut out = Vec::new();
            out.extend_from_slice(b"PROP");
            out.extend_from_slice(&2u32.to_le_bytes());
            out.extend_from_slice(&0u32.to_le_bytes());
            out.extend_from_slice(&(types.len() as u32).to_le_bytes());
            for t in types {
                out.extend_from_slice(&t.to_le_bytes());
            }
            for b in blobs {
                out.extend_from_slice(&b);
            }
            out
        }

        let temp = std::env::temp_dir().join(format!(
            "laap-overlay-res-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&temp);
        let final_dir = temp.join("Game").join("DATA").join("FINAL");
        let champs_dir = final_dir.join("Champions");
        fs::create_dir_all(&champs_dir).unwrap();

        let base_bin = build_prop_with_resolver(
            "Characters/Ahri/Skins/Skin0",
            "AhriBase",
            Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skl"),
            Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skn"),
            "Characters/Ahri/Skins/Skin0/Resources",
            None,
            None,
        );
        let skin11_bin = build_prop_with_resolver(
            "Characters/Ahri/Skins/Skin11",
            "AhriSkin11",
            Some("ASSETS/Characters/Ahri/Skins/Skin11/Ahri_Skin11.skl"),
            Some("ASSETS/Characters/Ahri/Skins/Skin11/Ahri_Skin11.skn"),
            "Characters/Ahri/Skins/Skin11/Resources",
            None,
            None,
        );
        let opaque_mat = vec![0xCA, 0xFE, 0xBA, 0xBE, 0x01, 0x02];
        // Chroma inherits mesh from parent Skin11 and defines its own Skin12 ResourceResolver
        let skin12_bin = build_prop_with_resolver(
            "Characters/Ahri/Skins/Skin12",
            "AhriSkin12",
            None,
            None,
            "Characters/Ahri/Skins/Skin12/Resources",
            Some(11),
            Some((STATIC_MATERIAL_DEF_CLASS, &opaque_mat)),
        );

        let wad_bytes = wad_tool::create_wad_v3(&[
            ("data/characters/ahri/skins/skin0.bin".into(), base_bin),
            ("data/characters/ahri/skins/skin11.bin".into(), skin11_bin),
            ("data/characters/ahri/skins/skin12.bin".into(), skin12_bin),
            (
                "assets/characters/ahri/skins/skin11/ahri_skin11.skl".into(),
                b"PARENT_SKL".to_vec(),
            ),
            (
                "assets/characters/ahri/skins/skin11/ahri_skin11.skn".into(),
                b"PARENT_SKN".to_vec(),
            ),
        ])
        .unwrap();
        fs::write(champs_dir.join("Ahri.wad.client"), wad_bytes).unwrap();

        let root = temp.join("laap_root");
        let sha = ensure_official_skin_mod_at(&root, &final_dir, "Ahri", "Ahri", Some("103"), 12, 103012)
            .expect("ensure chroma overlay");

        let zip_bytes = fs::read(root.join("library").join("content").join(&sha)).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(&zip_bytes)).unwrap();
        let mut wad_out = Vec::new();
        {
            let mut wf = archive.by_name("WAD/Ahri.wad.client").unwrap();
            std::io::Read::read_to_end(&mut wf, &mut wad_out).unwrap();
        }
        let temp_wad = temp.join("extracted_res.wad.client");
        fs::write(&temp_wad, &wad_out).unwrap();
        let mut gen_wad = StreamingGameWad::open(&temp_wad).unwrap();

        let out_skin0 = gen_wad
            .read_path("data/characters/ahri/skins/skin0.bin")
            .unwrap()
            .unwrap();
        let out_prop = PropFile::parse(&out_skin0).unwrap();
        let (_, out_entry) = out_prop.read_skin_data_entry().unwrap().unwrap();
        assert_eq!(out_entry.path_hash, fnv1a_lower("Characters/Ahri/Skins/Skin0"));
        assert_eq!(
            find_field_str(&out_entry.fields, PROP_CHAMPION_SKIN_NAME).as_deref(),
            Some("AhriBase")
        );
        assert_eq!(
            find_field_link(&out_entry.fields, PROP_M_RESOURCE_RESOLVER),
            Some((0x84, fnv1a_lower("Characters/Ahri/Skins/Skin0/Resources")))
        );

        let res_idx = out_prop
            .types
            .iter()
            .position(|&t| t == RESOURCE_RESOLVER_CLASS_HASH)
            .expect("ResourceResolver preserved");
        assert_eq!(
            out_prop.read_entry_path_hash(res_idx),
            Some(fnv1a_lower("Characters/Ahri/Skins/Skin0/Resources"))
        );

        let (skel, simple) = mesh_paths(&out_entry);
        assert_eq!(skel.as_deref(), Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skl"));
        assert_eq!(simple.as_deref(), Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skn"));

        let out_skl = gen_wad
            .read_path("assets/characters/ahri/skins/base/ahri.skl")
            .unwrap()
            .unwrap();
        assert_eq!(out_skl.len(), b"PARENT_SKL".len() + MESH_PADDING_BYTES);

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn prop_file_rewrite_preserves_unrelated_entries_verbatim() {
        // Entry 0 simulates StaticMaterialDef (0xFF9D3409) with arbitrary bytes that standard full-BIN parsers may reject
        let opaque_material_payload = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x11, 0x22, 0x33, 0x44, 0x55];
        let raw = build_synthetic_skin_prop_bin(
            "Characters/Ahri/Skins/Skin1",
            "AhriSkin01",
            "ASSETS/Characters/Ahri/Skins/Skin01/Ahri_Skin01.skl",
            "ASSETS/Characters/Ahri/Skins/Skin01/Ahri_Skin01.skn",
            Some((STATIC_MATERIAL_DEF_CLASS, &opaque_material_payload)),
        );

        let prop = PropFile::parse(&raw).expect("parse synthetic prop");
        assert_eq!(prop.types.len(), 2);
        let (idx, mut entry) = prop.read_skin_data_entry().unwrap().expect("skin entry");
        assert_eq!(idx, 1);

        entry.path_hash = fnv1a_lower("Characters/Ahri/Skins/Skin0");
        set_field_str(&mut entry.fields, PROP_CHAMPION_SKIN_NAME, "AhriSkin00".into());
        set_mesh_path(&mut entry, PROP_SKELETON, "ASSETS/Characters/Ahri/Skins/Base/Ahri.skl".into());
        set_mesh_path(&mut entry, PROP_SIMPLE_SKIN, "ASSETS/Characters/Ahri/Skins/Base/Ahri.skn".into());

        let rewritten = prop.rewrite_entry(idx, &entry);
        let reparsed = PropFile::parse(&rewritten).expect("reparse rewritten prop");
        // Verify entry 0 opaque bytes remain identical
        let (s0, e0) = reparsed.spans[0];
        assert_eq!(&rewritten[s0 + 4..e0], opaque_material_payload.as_slice());

        let (_, new_entry) = reparsed.read_skin_data_entry().unwrap().unwrap();
        assert_eq!(
            find_field_str(&new_entry.fields, PROP_CHAMPION_SKIN_NAME).as_deref(),
            Some("AhriSkin00")
        );
        let (skel, simple) = mesh_paths(&new_entry);
        assert_eq!(skel.as_deref(), Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skl"));
        assert_eq!(simple.as_deref(), Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.skn"));
    }

    #[test]
    fn ensure_official_skin_mod_at_builds_valid_fantome_package() {
        let temp = std::env::temp_dir().join(format!(
            "laap-overlay-unit-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&temp);
        let final_dir = temp.join("Game").join("DATA").join("FINAL");
        let champs_dir = final_dir.join("Champions");
        fs::create_dir_all(&champs_dir).unwrap();

        let base_bin = build_synthetic_skin_prop_bin(
            "Characters/Ahri/Skins/Skin0",
            "AhriBase",
            "ASSETS/Characters/Ahri/Skins/Base/Ahri.skl",
            "ASSETS/Characters/Ahri/Skins/Base/Ahri.skn",
            None,
        );
        let skin1_bin = build_synthetic_skin_prop_bin(
            "Characters/Ahri/Skins/Skin1",
            "AhriSkin01",
            "ASSETS/Characters/Ahri/Skins/Skin01/Ahri_Skin01.skl",
            "ASSETS/Characters/Ahri/Skins/Skin01/Ahri_Skin01.skn",
            None,
        );
        let skin1_skl = b"SKL1_DATA".to_vec();
        let skin1_skn = b"SKN1_DATA".to_vec();

        let wad_bytes = wad_tool::create_wad_v3(&[
            ("data/characters/ahri/skins/skin0.bin".into(), base_bin),
            ("data/characters/ahri/skins/skin1.bin".into(), skin1_bin),
            ("assets/characters/ahri/skins/skin01/ahri_skin01.skl".into(), skin1_skl.clone()),
            ("assets/characters/ahri/skins/skin01/ahri_skin01.skn".into(), skin1_skn.clone()),
        ])
        .unwrap();
        fs::write(champs_dir.join("Ahri.wad.client"), wad_bytes).unwrap();

        let root = temp.join("laap_root");
        let sha = ensure_official_skin_mod_at(&root, &final_dir, "Ahri", "Ahri", Some("103"), 1, 103001)
            .expect("ensure official skin mod");

        // Second call returns cached sha without failing
        let sha2 = ensure_official_skin_mod_at(&root, &final_dir, "Ahri", "Ahri", Some("103"), 1, 103001)
            .expect("cached skin mod");
        assert_eq!(sha, sha2);

        let installed = library::list_installed_at(&root).unwrap();
        assert_eq!(installed.len(), 1);
        assert!(!installed[0].enabled, "generated official mods should remain disabled by default");
        assert!(installed[0].manifest.mod_id.starts_with("official_Ahri_1_"));

        let zip_bytes = fs::read(root.join("library").join("content").join(&sha)).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(&zip_bytes)).unwrap();
        assert!(archive.by_name("META/info.json").is_ok());

        let mut wad_out = Vec::new();
        {
            let mut wf = archive.by_name("WAD/Ahri.wad.client").unwrap();
            std::io::Read::read_to_end(&mut wf, &mut wad_out).unwrap();
        }
        let temp_wad = temp.join("extracted.wad.client");
        fs::write(&temp_wad, &wad_out).unwrap();
        let mut gen_wad = StreamingGameWad::open(&temp_wad).unwrap();
        let out_skin0 = gen_wad.read_path("data/characters/ahri/skins/skin0.bin").unwrap().unwrap();
        let out_prop = PropFile::parse(&out_skin0).unwrap();
        let (_, out_entry) = out_prop.read_skin_data_entry().unwrap().unwrap();
        assert_eq!(
            find_field_str(&out_entry.fields, PROP_CHAMPION_SKIN_NAME).as_deref(),
            Some("AhriBase")
        );
        let out_skl = gen_wad
            .read_path("assets/characters/ahri/skins/base/ahri.skl")
            .unwrap()
            .unwrap();
        assert_eq!(out_skl.len(), skin1_skl.len() + MESH_PADDING_BYTES);

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    #[ignore]
    fn inspect_local_ahri_wad_and_mkoverlay() {
        let game_dir = Path::new(r"C:\Riot Games\League of Legends\Game");
        let final_dir = game_dir.join("DATA").join("FINAL");
        let wad_path = final_dir.join("Champions").join("Ahri.wad.client");
        if !wad_path.is_file() {
            return;
        }
        let mut wad = StreamingGameWad::open(&wad_path).unwrap();
        for skin_num in [0u32, 1, 7, 85] {
            let raw = wad
                .read_path(&format!("data/characters/ahri/skins/skin{skin_num}.bin"))
                .unwrap()
                .unwrap();
            let prop = PropFile::parse(&raw).unwrap();
            let (idx, entry) = prop.read_skin_data_entry().unwrap().unwrap();
            let name = find_field_str(&entry.fields, PROP_CHAMPION_SKIN_NAME);
            let (skel, simple) = mesh_paths(&entry);
            let tag_count = entry
                .fields
                .iter()
                .find(|f| f.name_hash == PROP_SKIN_AUDIO)
                .and_then(|f| match &f.value {
                    PropVal::Struct(_, Some(e)) => e.fields.iter().find(|sf| sf.name_hash == PROP_TAG_EVENT_LIST),
                    _ => None,
                });
            println!(
                "skin{skin_num}: entry_idx={idx}, path_hash=0x{:08x}, championSkinName={name:?}, skel={skel:?}, simple={simple:?}, has_audio={}",
                entry.path_hash,
                tag_count.is_some()
            );
        }

        // Also test building Ahri skin 1 overlay mod end-to-end
        let temp = std::env::temp_dir().join("laap-ahri-overlay-test");
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).unwrap();
        let sha = ensure_official_skin_mod_at(&temp, &final_dir, "Ahri", "Ahri", Some("103"), 1, 103001)
            .expect("generate Ahri skin 1 mod");
        let zip_bytes = fs::read(temp.join("library").join("content").join(&sha)).unwrap();
        println!("Generated Ahri skin 1 fantome zip: {} bytes, sha={sha}", zip_bytes.len());

        // Test mod-tools mkoverlay using the extracted SFX binary if available
        let sfx = PathBuf::from(r"C:\Users\hessa\.gemini\antigravity\brain\dd38b228-912d-44c7-b4d9-47f740ca1ae4\scratch\cslol-manager-windows.exe");
        if sfx.is_file() {
            let tools_stage = temp.join("tools-stage");
            let tools_dir = temp.join("tools");
            super::super::skin_bootstrap::extract_backend_package(&sfx, &tools_stage).unwrap();
            let mod_tools = super::super::skin_bootstrap::promote_modtools_from_extracted(&tools_stage, &tools_dir).unwrap();
            let mods_dir = temp.join("mods");
            let mod_folder = mods_dir.join("ahri_skin1");
            fs::create_dir_all(&mod_folder).unwrap();
            let mut archive = zip::ZipArchive::new(Cursor::new(&zip_bytes)).unwrap();
            archive.extract(&mod_folder).unwrap();
            let overlay_dir = temp.join("overlay");
            let out = std::process::Command::new(&mod_tools)
                .arg("mkoverlay")
                .arg(&mods_dir)
                .arg(&overlay_dir)
                .arg(format!("--game:{}", game_dir.display()))
                .arg("--mods:ahri_skin1")
                .arg("--noTFT")
                .arg("--ignoreConflict")
                .output()
                .expect("run mkoverlay");
            println!(
                "mkoverlay exit={:?}\nstdout={}\nstderr={}",
                out.status,
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            assert!(out.status.success(), "mkoverlay should succeed cleanly");
        }
        let _ = fs::remove_dir_all(&temp);
    }
}
