use super::storage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GamePathConfig {
    pub custom_game_path: Option<String>,
    pub detected_game_path: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("game_path_config.json"))
}

pub fn detect_league_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Check default common locations
        let common = [
            r"C:\Riot Games\League of Legends",
            r"D:\Riot Games\League of Legends",
            r"E:\Riot Games\League of Legends",
            r"C:\Program Files\Riot Games\League of Legends",
            r"C:\Program Files (x86)\Riot Games\League of Legends",
        ];
        for path in &common {
            let p = Path::new(path);
            if p.exists() && (p.join("LeagueClient.exe").exists() || p.join("Game").exists()) {
                return Some(path.to_string());
            }
        }

        // 2. Check Windows Registry
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Riot Games, Inc\League of Legends") {
            if let Ok(location) = key.get_value::<String, _>("Location") {
                if Path::new(&location).exists() {
                    return Some(location);
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let mac_path = "/Applications/League of Legends.app";
        if Path::new(mac_path).exists() {
            return Some(mac_path.to_string());
        }
    }

    None
}

#[tauri::command]
pub fn get_game_path(app: AppHandle) -> Result<String, String> {
    if let Ok(validated) = resolve_validated_game_install(&app) {
        return Ok(validated.install_dir.to_string_lossy().into_owned());
    }
    let p = config_path(&app)?;
    let cfg = storage::read::<GamePathConfig>(&p, 64 * 1024)?.unwrap_or_default();
    if let Some(custom) = cfg.custom_game_path {
        if Path::new(&custom).exists() {
            return Ok(custom);
        }
    }
    if let Some(detected) = detect_league_path() {
        return Ok(detected);
    }
    Err("League of Legends game installation not detected.".into())
}

#[tauri::command]
pub fn set_game_path(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("League of Legends path cannot be empty.".into());
    }
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err("The specified path does not exist.".into());
    }
    if !p.is_dir() {
        return Err("The specified path is not a directory.".into());
    }
    let (normalized_dir, _, _) = validate_league_install_dir(p)?;
    let normalized = normalized_dir.to_string_lossy().into_owned();

    let p_cfg = config_path(&app)?;
    let mut cfg = storage::read::<GamePathConfig>(&p_cfg, 64 * 1024)?.unwrap_or_default();
    cfg.custom_game_path = Some(normalized.clone());
    storage::write(&p_cfg, &cfg)?;
    Ok(normalized)
}

#[tauri::command]
pub fn clear_game_path(app: AppHandle) -> Result<GameInstallInfo, String> {
    let p_cfg = config_path(&app)?;
    let mut cfg = storage::read::<GamePathConfig>(&p_cfg, 64 * 1024)?.unwrap_or_default();
    cfg.custom_game_path = None;
    storage::write(&p_cfg, &cfg)?;
    Ok(get_game_install_info(app))
}

#[tauri::command]
pub fn pick_game_path(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Select League of Legends installation folder")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| "Selected folder cannot be represented as a local filesystem path.".to_string())?;
    let path_str = path.to_string_lossy().into_owned();
    let saved = set_game_path(app, path_str)?;
    Ok(Some(saved))
}

#[tauri::command]
pub fn get_game_install_info(app: AppHandle) -> GameInstallInfo {
    let config_file = match config_path(&app) {
        Ok(p) => p,
        Err(e) => {
            return GameInstallInfo {
                league_path: None,
                game_dir: None,
                game_exe_path: None,
                detected_build: None,
                is_detected: false,
                source: None,
                validation_error: Some(e),
            };
        }
    };
    resolve_game_install_info_at(&config_file, None)
}

#[allow(unused_imports)]
pub use install_meta::{
    detect_league_game_build, resolve_game_install_info_at, resolve_validated_game_install,
    resolve_validated_game_install_at, validate_league_install_dir, GameInstallInfo,
    ValidatedGameInstall,
};
pub(crate) use install_meta::{ensure_safe_existing_entry, sanitize_build_string};

mod install_meta {
    use serde::{Deserialize, Serialize};
    use std::fs::{self, File};
    use std::io::{Read, Seek, SeekFrom};
    use std::path::{Component, Path, PathBuf};
    use tauri::AppHandle;

    use super::{config_path, detect_league_path, storage, GamePathConfig};

    const MAX_RSRC_BYTES: usize = 4 * 1024 * 1024;
    const MAX_VERSION_TEXT_BYTES: usize = 64 * 1024;

    #[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
    #[serde(rename_all = "camelCase")]
    pub struct ValidatedGameInstall {
        pub install_dir: PathBuf,
        pub game_dir: Option<PathBuf>,
        pub game_executable: Option<PathBuf>,
        pub detected_build: Option<String>,
        pub source: String,
    }

    #[derive(Clone, Debug, Deserialize, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct GameInstallInfo {
        pub league_path: Option<String>,
        pub game_dir: Option<String>,
        pub game_exe_path: Option<String>,
        pub detected_build: Option<String>,
        pub is_detected: bool,
        pub source: Option<String>,
        pub validation_error: Option<String>,
    }

    fn has_reparse_flag(meta: &fs::Metadata) -> bool {
        if meta.file_type().is_symlink() {
            return true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return true;
            }
        }
        false
    }

    fn ensure_no_parent_traversal(path: &Path) -> Result<(), String> {
        if !path.is_absolute() {
            return Err("Path must be an absolute filesystem path.".into());
        }
        for comp in path.components() {
            if matches!(comp, Component::ParentDir) {
                return Err("Path must not contain '..' parent directory components.".into());
            }
        }
        Ok(())
    }

    pub(crate) fn ensure_safe_existing_entry(path: &Path, expect_dir: bool) -> Result<(), String> {
        ensure_no_parent_traversal(path)?;

        #[cfg(windows)]
        {
            let mut acc = PathBuf::new();
            for comp in path.components() {
                acc.push(comp);
                if matches!(comp, Component::Prefix(_) | Component::RootDir) {
                    continue;
                }
                let meta = fs::symlink_metadata(&acc)
                    .map_err(|e| format!("Cannot inspect '{}': {e}", acc.to_string_lossy()))?;
                if has_reparse_flag(&meta) {
                    return Err(format!(
                        "Refusing symlink or NTFS reparse point at '{}'.",
                        acc.to_string_lossy()
                    ));
                }
            }
        }

        let meta = fs::symlink_metadata(path)
            .map_err(|e| format!("Cannot inspect '{}': {e}", path.to_string_lossy()))?;
        if has_reparse_flag(&meta) {
            return Err(format!(
                "Refusing symlink or reparse point at '{}'.",
                path.to_string_lossy()
            ));
        }
        if expect_dir && !meta.is_dir() {
            return Err(format!("'{}' is not a directory.", path.to_string_lossy()));
        }
        if !expect_dir && !meta.is_file() {
            return Err(format!("'{}' is not a regular file.", path.to_string_lossy()));
        }
        Ok(())
    }

    fn safe_optional_file(path: &Path) -> Result<Option<PathBuf>, String> {
        match fs::symlink_metadata(path) {
            Ok(meta) => {
                if has_reparse_flag(&meta) || !meta.is_file() {
                    return Err(format!(
                        "Untrusted or invalid League marker file '{}'.",
                        path.to_string_lossy()
                    ));
                }
                Ok(Some(path.to_path_buf()))
            }
            Err(_) => Ok(None),
        }
    }

    fn safe_optional_dir(path: &Path) -> Result<Option<PathBuf>, String> {
        match fs::symlink_metadata(path) {
            Ok(meta) => {
                if has_reparse_flag(&meta) || !meta.is_dir() {
                    return Err(format!(
                        "Untrusted or invalid League directory '{}'.",
                        path.to_string_lossy()
                    ));
                }
                Ok(Some(path.to_path_buf()))
            }
            Err(_) => Ok(None),
        }
    }

    pub fn validate_league_install_dir(
        path: &Path,
    ) -> Result<(PathBuf, Option<PathBuf>, Option<PathBuf>), String> {
        ensure_safe_existing_entry(path, true)?;

        let direct_exe = safe_optional_file(&path.join("League of Legends.exe"))?;
        if let Some(exe) = direct_exe {
            let root = path
                .file_name()
                .and_then(|n| n.to_str())
                .filter(|n| n.eq_ignore_ascii_case("Game"))
                .and_then(|_| path.parent())
                .filter(|parent| {
                    ensure_safe_existing_entry(parent, true).is_ok()
                        && safe_optional_file(&parent.join("LeagueClient.exe"))
                            .ok()
                            .flatten()
                            .is_some()
                })
                .map(Path::to_path_buf)
                .unwrap_or_else(|| path.to_path_buf());
            return Ok((root, Some(path.to_path_buf()), Some(exe)));
        }

        let game_dir = safe_optional_dir(&path.join("Game"))?;
        let game_exe = if let Some(ref gd) = game_dir {
            safe_optional_file(&gd.join("League of Legends.exe"))?
        } else {
            None
        };
        let client_exe = safe_optional_file(&path.join("LeagueClient.exe"))?;

        let mac_lol_game = safe_optional_dir(&path.join("Contents").join("LoL").join("Game"))?;
        let mac_app_game = safe_optional_dir(
            &path
                .join("League of Legends.app")
                .join("Contents")
                .join("LoL")
                .join("Game"),
        )?;

        if game_dir.is_some()
            || game_exe.is_some()
            || client_exe.is_some()
            || mac_lol_game.is_some()
            || mac_app_game.is_some()
        {
            return Ok((
                path.to_path_buf(),
                game_dir.or(mac_lol_game).or(mac_app_game),
                game_exe.or(client_exe),
            ));
        }

        Err(
            "Directory does not look like a League of Legends installation (expected Game/League of Legends.exe or LeagueClient.exe)."
                .into(),
        )
    }

    pub fn resolve_validated_game_install(app: &AppHandle) -> Result<ValidatedGameInstall, String> {
        let cfg_path = config_path(app)?;
        resolve_validated_game_install_at(&cfg_path)
    }

    pub fn resolve_validated_game_install_at(
        cfg_path: &Path,
    ) -> Result<ValidatedGameInstall, String> {
        resolve_validated_game_install_with_detector(cfg_path, detect_league_path)
    }

    pub(crate) fn resolve_validated_game_install_with_detector<F>(
        cfg_path: &Path,
        detector: F,
    ) -> Result<ValidatedGameInstall, String>
    where
        F: FnOnce() -> Option<String>,
    {
        let cfg = storage::read::<GamePathConfig>(cfg_path, 64 * 1024)?.unwrap_or_default();
        if let Some(custom) = cfg.custom_game_path {
            let p = Path::new(custom.trim());
            if p.exists() {
                let (install_dir, game_dir, game_executable) = validate_league_install_dir(p)?;
                let detected_build = detect_league_game_build(&install_dir);
                return Ok(ValidatedGameInstall {
                    install_dir,
                    game_dir,
                    game_executable,
                    detected_build,
                    source: "custom".into(),
                });
            }
        }

        if let Some(detected) = detector() {
            let p = Path::new(detected.trim());
            if p.exists() {
                let (install_dir, game_dir, game_executable) = validate_league_install_dir(p)?;
                let detected_build = detect_league_game_build(&install_dir);
                return Ok(ValidatedGameInstall {
                    install_dir,
                    game_dir,
                    game_executable,
                    detected_build,
                    source: "detected".into(),
                });
            }
        }

        Err("League of Legends game installation not detected.".into())
    }

    pub fn resolve_game_install_info_at(
        cfg_path: &Path,
        lcu_build_hint: Option<&str>,
    ) -> GameInstallInfo {
        match resolve_validated_game_install_at(cfg_path) {
            Ok(inst) => GameInstallInfo {
                league_path: Some(inst.install_dir.to_string_lossy().into_owned()),
                game_dir: inst
                    .game_dir
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                game_exe_path: inst
                    .game_executable
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                detected_build: inst
                    .detected_build
                    .or_else(|| sanitize_build_string(lcu_build_hint.unwrap_or(""))),
                is_detected: true,
                source: Some(inst.source),
                validation_error: None,
            },
            Err(e) => GameInstallInfo {
                league_path: None,
                game_dir: None,
                game_exe_path: None,
                detected_build: lcu_build_hint.and_then(sanitize_build_string),
                is_detected: false,
                source: None,
                validation_error: Some(e),
            },
        }
    }

    pub fn detect_league_game_build(install_dir: &Path) -> Option<String> {
        let exe_candidates = [
            install_dir.join("Game").join("League of Legends.exe"),
            install_dir.join("League of Legends.exe"),
            install_dir.join("LeagueClient.exe"),
        ];
        for candidate in &exe_candidates {
            if ensure_safe_existing_entry(candidate, false).is_ok() {
                if let Some(ver) = read_pe_file_version(candidate) {
                    return Some(ver);
                }
            }
        }

        let text_candidates = [
            install_dir.join("Game").join("version.txt"),
            install_dir.join("version.txt"),
            install_dir
                .join("Game")
                .join("DATA")
                .join("FINAL")
                .join("version.txt"),
        ];
        for candidate in &text_candidates {
            if ensure_safe_existing_entry(candidate, false).is_ok() {
                if let Some(ver) = read_version_text_file(candidate) {
                    return Some(ver);
                }
            }
        }

        let plist_candidates = [
            install_dir.join("Contents").join("Info.plist"),
            install_dir
                .join("League of Legends.app")
                .join("Contents")
                .join("Info.plist"),
        ];
        for candidate in &plist_candidates {
            if ensure_safe_existing_entry(candidate, false).is_ok() {
                if let Some(ver) = read_plist_version(candidate) {
                    return Some(ver);
                }
            }
        }

        None
    }

    pub(crate) fn sanitize_build_string(raw: &str) -> Option<String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.len() > 64 {
            return None;
        }
        let cleaned = trimmed.strip_prefix('v').unwrap_or(trimmed).trim();
        let mut parts = cleaned.split('.');
        let first = parts.next()?;
        let second = parts.next()?;
        if first.is_empty()
            || second.is_empty()
            || !first.chars().all(|c| c.is_ascii_digit())
            || !second.chars().all(|c| c.is_ascii_digit())
        {
            return None;
        }
        let mut valid_parts = vec![first.to_string(), second.to_string()];
        for p in parts {
            let head = p
                .split(|c: char| !c.is_ascii_digit())
                .next()
                .unwrap_or("");
            if head.is_empty() {
                break;
            }
            valid_parts.push(head.to_string());
            if valid_parts.len() >= 4 {
                break;
            }
        }
        Some(valid_parts.join("."))
    }

    fn read_version_text_file(path: &Path) -> Option<String> {
        let meta = fs::symlink_metadata(path).ok()?;
        if meta.len() as usize > MAX_VERSION_TEXT_BYTES {
            return None;
        }
        let content = fs::read_to_string(path).ok()?;
        for line in content.lines() {
            if let Some(ver) = sanitize_build_string(line) {
                return Some(ver);
            }
        }
        None
    }

    fn read_plist_version(path: &Path) -> Option<String> {
        let meta = fs::symlink_metadata(path).ok()?;
        if meta.len() as usize > MAX_VERSION_TEXT_BYTES {
            return None;
        }
        let content = fs::read_to_string(path).ok()?;
        for key in ["CFBundleShortVersionString", "CFBundleVersion"] {
            if let Some(idx) = content.find(key) {
                let tail = &content[idx..];
                if let Some(start) = tail.find("<string>") {
                    let after = &tail[start + 8..];
                    if let Some(end) = after.find("</string>") {
                        if let Some(ver) = sanitize_build_string(&after[..end]) {
                            return Some(ver);
                        }
                    }
                }
            }
        }
        None
    }

    fn u16_le(buf: &[u8], off: usize) -> Option<u16> {
        let slice = buf.get(off..off.checked_add(2)?)?;
        Some(u16::from_le_bytes([slice[0], slice[1]]))
    }

    fn u32_le(buf: &[u8], off: usize) -> Option<u32> {
        let slice = buf.get(off..off.checked_add(4)?)?;
        Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
    }

    fn read_pe_file_version(path: &Path) -> Option<String> {
        let mut f = File::open(path).ok()?;
        let mut dos = [0u8; 64];
        f.read_exact(&mut dos).ok()?;
        if &dos[0..2] != b"MZ" {
            return None;
        }
        let e_lfanew = u32_le(&dos, 0x3C)? as usize;
        if e_lfanew < 64 || e_lfanew > 1024 * 1024 {
            return None;
        }
        f.seek(SeekFrom::Start(e_lfanew as u64)).ok()?;
        let mut pe_hdr = [0u8; 24];
        f.read_exact(&mut pe_hdr).ok()?;
        if &pe_hdr[0..4] != b"PE\0\0" {
            return None;
        }
        let num_sections = u16_le(&pe_hdr, 6)? as usize;
        let opt_size = u16_le(&pe_hdr, 20)? as usize;
        if opt_size < 120 || opt_size > 4096 || num_sections == 0 || num_sections > 96 {
            return None;
        }
        let mut opt = vec![0u8; opt_size];
        f.read_exact(&mut opt).ok()?;
        let magic = u16_le(&opt, 0)?;
        let data_dir_off = match magic {
            0x10B => 96usize,
            0x20B => 112usize,
            _ => return None,
        };
        let rsrc_entry_off = data_dir_off.checked_add(2 * 8)?;
        let rsrc_rva = u32_le(&opt, rsrc_entry_off)?;
        let rsrc_size = u32_le(&opt, rsrc_entry_off + 4)?;
        if rsrc_rva == 0 || rsrc_size == 0 {
            return None;
        }

        let mut secs_raw = vec![0u8; num_sections.checked_mul(40)?];
        f.read_exact(&mut secs_raw).ok()?;

        #[derive(Clone, Copy)]
        struct Sec {
            va: u32,
            vsize: u32,
            raw_ptr: u32,
            raw_size: u32,
        }
        let mut secs = Vec::with_capacity(num_sections);
        for i in 0..num_sections {
            let base = i * 40;
            secs.push(Sec {
                vsize: u32_le(&secs_raw, base + 8)?,
                va: u32_le(&secs_raw, base + 12)?,
                raw_size: u32_le(&secs_raw, base + 16)?,
                raw_ptr: u32_le(&secs_raw, base + 20)?,
            });
        }

        let rsrc_sec = secs.iter().find(|s| {
            let span = s.vsize.max(s.raw_size);
            rsrc_rva >= s.va && rsrc_rva < s.va.saturating_add(span)
        })?;
        let rsrc_delta = rsrc_rva.checked_sub(rsrc_sec.va)?;
        let rsrc_file_off = rsrc_sec.raw_ptr.checked_add(rsrc_delta)?;
        let avail_in_sec = rsrc_sec.raw_size.saturating_sub(rsrc_delta);
        let to_read = (rsrc_size.min(avail_in_sec) as usize).min(MAX_RSRC_BYTES);
        if to_read < 32 {
            return None;
        }
        f.seek(SeekFrom::Start(rsrc_file_off as u64)).ok()?;
        let mut rsrc = vec![0u8; to_read];
        f.read_exact(&mut rsrc).ok()?;

        let rva_to_rsrc_slice = |data_rva: u32, len: usize| -> Option<&[u8]> {
            if data_rva >= rsrc_rva {
                let rel = (data_rva - rsrc_rva) as usize;
                let end = rel.checked_add(len)?;
                if end <= rsrc.len() {
                    return Some(&rsrc[rel..end]);
                }
            }
            None
        };

        let named_1 = u16_le(&rsrc, 12)? as usize;
        let id_1 = u16_le(&rsrc, 14)? as usize;
        let entries_1 = 16usize;
        let total_1 = named_1.checked_add(id_1)?.min(256);
        let mut ver_dir_off = None;
        for i in named_1..total_1 {
            let e_off = entries_1.checked_add(i * 8)?;
            if u32_le(&rsrc, e_off)? == 16 {
                let data_or_sub = u32_le(&rsrc, e_off + 4)?;
                if data_or_sub & 0x8000_0000 != 0 {
                    ver_dir_off = Some((data_or_sub & 0x7FFF_FFFF) as usize);
                }
                break;
            }
        }
        let lvl2 = ver_dir_off?;

        let n2 = (u16_le(&rsrc, lvl2 + 12)? as usize)
            .saturating_add(u16_le(&rsrc, lvl2 + 14)? as usize);
        if n2 == 0 {
            return None;
        }
        let lvl2_child = u32_le(&rsrc, lvl2 + 16 + 4)?;
        if lvl2_child & 0x8000_0000 == 0 {
            return None;
        }
        let lvl3 = (lvl2_child & 0x7FFF_FFFF) as usize;

        let n3 = (u16_le(&rsrc, lvl3 + 12)? as usize)
            .saturating_add(u16_le(&rsrc, lvl3 + 14)? as usize);
        if n3 == 0 {
            return None;
        }
        let data_entry_off = u32_le(&rsrc, lvl3 + 16 + 4)?;
        if data_entry_off & 0x8000_0000 != 0 {
            return None;
        }
        let de = data_entry_off as usize;
        let ver_rva = u32_le(&rsrc, de)?;
        let ver_size = (u32_le(&rsrc, de + 4)? as usize).min(64 * 1024);

        let ver_bytes = if let Some(slice) = rva_to_rsrc_slice(ver_rva, ver_size) {
            slice.to_vec()
        } else {
            let sec = secs.iter().find(|s| {
                let span = s.vsize.max(s.raw_size);
                ver_rva >= s.va && ver_rva < s.va.saturating_add(span)
            })?;
            let file_off = sec.raw_ptr.checked_add(ver_rva - sec.va)?;
            f.seek(SeekFrom::Start(file_off as u64)).ok()?;
            let mut buf = vec![0u8; ver_size];
            f.read_exact(&mut buf).ok()?;
            buf
        };

        parse_vs_fixedfileinfo(&ver_bytes)
    }

    pub(crate) fn parse_vs_fixedfileinfo(ver_bytes: &[u8]) -> Option<String> {
        const SIG: [u8; 4] = [0xBD, 0x04, 0xEF, 0xFE];
        let mut off = 0usize;
        while off + 52 <= ver_bytes.len() {
            if ver_bytes[off..off + 4] == SIG {
                let file_ver_ms = u32_le(ver_bytes, off + 8)?;
                let file_ver_ls = u32_le(ver_bytes, off + 12)?;
                let major = file_ver_ms >> 16;
                let minor = file_ver_ms & 0xFFFF;
                let patch = file_ver_ls >> 16;
                let build = file_ver_ls & 0xFFFF;
                if major > 0 || minor > 0 {
                    return Some(format!("{major}.{minor}.{patch}.{build}"));
                }
            }
            off += 4;
        }
        None
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn temp_dir(label: &str) -> PathBuf {
            let dir = std::env::temp_dir().join(format!(
                "laap-game-path-{}-{}",
                label,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ));
            fs::create_dir_all(&dir).unwrap();
            dir
        }

        #[test]
        fn rejects_relative_and_non_league_dirs_and_accepts_valid_league_dir() {
            assert!(validate_league_install_dir(Path::new("relative/League")).is_err());

            let empty_dir = temp_dir("empty");
            assert!(validate_league_install_dir(&empty_dir).is_err());
            let _ = fs::remove_dir_all(&empty_dir);

            let valid_dir = temp_dir("valid");
            let game_dir = valid_dir.join("Game");
            fs::create_dir_all(&game_dir).unwrap();
            fs::write(game_dir.join("League of Legends.exe"), b"MZ").unwrap();
            fs::write(game_dir.join("version.txt"), "14.12.590.1234\n").unwrap();

            let (root, gd, exe) = validate_league_install_dir(&valid_dir).unwrap();
            assert_eq!(root, valid_dir);
            assert_eq!(gd.as_deref(), Some(game_dir.as_path()));
            assert_eq!(
                exe.as_deref(),
                Some(game_dir.join("League of Legends.exe").as_path())
            );
            assert_eq!(
                detect_league_game_build(&valid_dir).as_deref(),
                Some("14.12.590.1234")
            );
            let _ = fs::remove_dir_all(&valid_dir);
        }

        #[test]
        fn parses_vs_fixedfileinfo_signature_and_resolves_cfg() {
            let mut blob = vec![0u8; 64];
            blob[8..12].copy_from_slice(&0xFEEF04BDu32.to_le_bytes());
            blob[16..20].copy_from_slice(&((14u32 << 16) | 18u32).to_le_bytes());
            blob[20..24].copy_from_slice(&((612u32 << 16) | 44u32).to_le_bytes());
            assert_eq!(
                parse_vs_fixedfileinfo(&blob).as_deref(),
                Some("14.18.612.44")
            );

            let root = temp_dir("cfg");
            let install = root.join("League of Legends");
            fs::create_dir_all(install.join("Game")).unwrap();
            fs::write(install.join("Game").join("League of Legends.exe"), b"MZ").unwrap();
            fs::write(install.join("Game").join("version.txt"), "v14.18.612.44").unwrap();

            let cfg_file = root.join("game_path.json");
            let cfg = GamePathConfig {
                custom_game_path: Some(install.to_string_lossy().into_owned()),
                ..Default::default()
            };
            storage::write(&cfg_file, &cfg).unwrap();

            let resolved = resolve_validated_game_install_at(&cfg_file).unwrap();
            assert_eq!(resolved.source, "custom");
            assert_eq!(resolved.detected_build.as_deref(), Some("14.18.612.44"));
            let _ = fs::remove_dir_all(&root);
        }
    }
}

#[tauri::command]
pub fn open_folder_in_explorer(folder_path: String) -> Result<bool, String> {
    let trimmed = folder_path.trim();
    let p = Path::new(trimmed);
    if !p.exists() {
        return Err("Folder does not exist.".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {e}"))?;
        Ok(true)
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {e}"))?;
        Ok(true)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_path_config_serialization() {
        let cfg = GamePathConfig {
            custom_game_path: Some(r"C:\Games\League of Legends".into()),
            detected_game_path: None,
        };
        let serialized = serde_json::to_string(&cfg).unwrap();
        assert!(serialized.contains("C:\\\\Games\\\\League of Legends"));
    }
}
