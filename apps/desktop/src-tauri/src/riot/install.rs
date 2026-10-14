//! Riot's installation manifests and OS metadata are authoritative across drives.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
pub struct ClientLocation {
    pub path: String,
    pub source: String,
}
pub fn manifest_candidates(value: &serde_json::Value) -> Vec<String> {
    let mut paths = Vec::new();
    for key in ["rc_default", "rc_live", "rc_beta"] {
        if let Some(path) = value.get(key).and_then(|v| v.as_str()) {
            paths.push(path.to_owned());
        }
    }
    if let Some(clients) = value.get("associated_client").and_then(|v| v.as_object()) {
        paths.extend(
            clients
                .values()
                .filter_map(|v| v.as_str())
                .map(str::to_owned),
        );
    }
    paths
}
pub fn executable_from_value(value: &str) -> String {
    let trimmed = value.trim().trim_start_matches('"');
    let lower = trimmed.to_ascii_lowercase();
    if let Some(end) = lower.find("riotclientservices.exe") {
        return trimmed[..end + "riotclientservices.exe".len()].to_owned();
    }
    trimmed.trim_end_matches('"').to_owned()
}
fn expand_environment(value: &str) -> String {
    let mut result = String::new();
    let mut remainder = value;
    while let Some(start) = remainder.find('%') {
        result.push_str(&remainder[..start]);
        let tail = &remainder[start + 1..];
        let Some(end) = tail.find('%') else {
            result.push_str(&remainder[start..]);
            return result;
        };
        let token = &tail[..end];
        match std::env::var(token) {
            Ok(replacement) => result.push_str(&replacement),
            Err(_) => {
                result.push('%');
                result.push_str(token);
                result.push('%');
            }
        }
        remainder = &tail[end + 1..];
    }
    result.push_str(remainder);
    result
}
fn variants(value: &str) -> Vec<PathBuf> {
    let root = PathBuf::from(expand_environment(&executable_from_value(value)));
    let mut paths = vec![
        root.clone(),
        root.join("RiotClientServices.exe"),
        root.join("Riot Client").join("RiotClientServices.exe"),
    ];
    if let Some(parent) = root.parent() {
        paths.push(parent.join("Riot Client").join("RiotClientServices.exe"));
    }
    paths
}
pub fn valid_executable(path: &Path) -> bool {
    path.is_absolute()
        && path.is_file()
        && path.file_name().is_some_and(|name| {
            name.to_string_lossy()
                .eq_ignore_ascii_case("RiotClientServices.exe")
        })
}
pub fn validate_override(value: &str) -> Result<Option<String>, String> {
    if value.trim().is_empty() {
        return Ok(None);
    }
    variants(value)
        .into_iter()
        .find(|p| valid_executable(p))
        .map(|p| Some(p.to_string_lossy().into_owned()))
        .ok_or_else(|| {
            "Choose an existing RiotClientServices.exe file, or its Riot Client folder.".into()
        })
}
pub fn manifest_path() -> Option<PathBuf> {
    std::env::var_os("PROGRAMDATA")
        .map(PathBuf::from)
        .map(|root| root.join("Riot Games").join("RiotClientInstalls.json"))
}
pub fn manifest_location() -> Option<ClientLocation> {
    let raw = std::fs::read_to_string(manifest_path()?).ok()?;
    let json: serde_json::Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).ok()?;
    choose(
        manifest_candidates(&json)
            .into_iter()
            .map(|path| (path, "Riot installation record".into()))
            .collect(),
    )
}
fn choose(candidates: Vec<(String, String)>) -> Option<ClientLocation> {
    for (value, source) in candidates {
        for path in variants(&value) {
            if valid_executable(&path) {
                return Some(ClientLocation {
                    path: path.to_string_lossy().into_owned(),
                    source,
                });
            }
        }
    }
    None
}
#[cfg(target_os = "windows")]
fn registry_candidates() -> Vec<(String, String)> {
    use winreg::{enums::*, RegKey};
    let mut candidates = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            for path in [
                r"SOFTWARE\Riot Games\Riot Client",
                r"SOFTWARE\Riot Games\League of Legends",
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\RiotClientServices.exe",
            ] {
                if let Ok(key) = root.open_subkey_with_flags(path, KEY_READ | view) {
                    for name in ["", "Path", "InstallLocation", "InstallDir"] {
                        if let Ok(value) = key.get_value::<String, _>(name) {
                            candidates.push((value, "Windows registry".into()));
                        }
                    }
                }
            }
            if let Ok(uninstall) = root.open_subkey_with_flags(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ | view,
            ) {
                for name in uninstall.enum_keys().filter_map(Result::ok) {
                    if let Ok(key) = uninstall.open_subkey(name) {
                        let display = key
                            .get_value::<String, _>("DisplayName")
                            .unwrap_or_default()
                            .to_ascii_lowercase();
                        if !display.contains("riot client")
                            && !display.contains("league of legends")
                        {
                            continue;
                        }
                        for field in ["InstallLocation", "DisplayIcon", "UninstallString"] {
                            if let Ok(value) = key.get_value::<String, _>(field) {
                                candidates.push((value, "Windows uninstall registry".into()));
                            }
                        }
                    }
                }
            }
        }
    }
    candidates
}
pub fn discover() -> Result<ClientLocation, String> {
    #[cfg(target_os = "windows")]
    {
        let settings = crate::launcher_settings::load()?;
        if let Some(path) = settings.riot_client_path {
            if let Some(found) = choose(vec![(path, "Saved path override".into())]) {
                return Ok(found);
            }
        }
        if let Some(found) = manifest_location() {
            return Ok(found);
        }
        let system = sysinfo::System::new_all();
        let running: Vec<_> = system
            .processes()
            .values()
            .filter(|process| {
                process
                    .name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("RiotClientServices.exe")
            })
            .filter_map(|process| {
                process.exe().map(|path| {
                    (
                        path.to_string_lossy().into_owned(),
                        "Running Riot Client".into(),
                    )
                })
            })
            .collect();
        if let Some(found) = choose(running) {
            return Ok(found);
        }
        if let Some(found) = choose(registry_candidates()) {
            return Ok(found);
        }
        let mut defaults = Vec::new();
        for name in ["PROGRAMFILES", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(root) = std::env::var_os(name) {
                defaults.push((
                    PathBuf::from(root)
                        .join("Riot Games")
                        .join("Riot Client")
                        .to_string_lossy()
                        .into_owned(),
                    "Standard install folder".into(),
                ));
            }
        }
        use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
        let mounted = unsafe { GetLogicalDrives() };
        for drive in b'C'..=b'Z' {
            if mounted & (1u32 << (drive - b'A')) == 0 {
                continue;
            }
            let root: Vec<u16> = format!("{}:\\", drive as char)
                .encode_utf16()
                .chain(Some(0))
                .collect();
            // Win32 DRIVE_REMOVABLE (2) and DRIVE_FIXED (3). Avoid probing
            // disconnected network mappings or empty optical drives.
            if !matches!(unsafe { GetDriveTypeW(root.as_ptr()) }, 2 | 3) {
                continue;
            }
            defaults.push((
                format!("{}:\\Riot Games\\Riot Client", drive as char),
                "Drive install folder".into(),
            ));
        }
        if let Some(found) = choose(defaults) {
            return Ok(found);
        }
        Err("Riot Client was not found. Open Riot once so it can refresh its installation record, or set RiotClientServices.exe in Settings → Riot installation.".into())
    }
    #[cfg(not(target_os = "windows"))]
    {
        for path in [
            "/Applications/Riot Client.app",
            "/Applications/League of Legends.app/Contents/LoL/Riot Client.app",
        ] {
            if Path::new(path).is_dir() {
                return Ok(ClientLocation {
                    path: path.into(),
                    source: "macOS application bundle".into(),
                });
            }
        }
        Ok(ClientLocation {
            path: "Riot Client".into(),
            source: "macOS Launch Services".into(),
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_a_custom_drive_location_from_riot_records() {
        let paths = manifest_candidates(
            &serde_json::json!({"rc_default":"E:\\Games & Apps\\Riot\\RiotClientServices.exe","rc_live":"F:\\Gaming\\RiotClientServices.exe","associated_client":{"G:\\League":"F:\\Gaming\\RiotClientServices.exe"}}),
        );
        assert_eq!(paths[0], r"E:\Games & Apps\Riot\RiotClientServices.exe");
        assert_eq!(paths.len(), 3);
        assert_eq!(
            executable_from_value(r#""E:\Games & Apps\RiotClientServices.exe",0"#),
            r"E:\Games & Apps\RiotClientServices.exe"
        );
        assert_eq!(
            executable_from_value(
                r#""F:\Games\RiotClientServices.exe" --uninstall-product=league_of_legends"#
            ),
            r"F:\Games\RiotClientServices.exe"
        );
    }
    #[test]
    fn stale_candidates_do_not_hide_a_valid_custom_location() {
        let root =
            std::env::temp_dir().join(format!("laap-install-{:032x}", rand::random::<u128>()));
        std::fs::create_dir_all(root.join("Custom Games & Apps")).unwrap();
        let path = root.join("Custom Games & Apps/RiotClientServices.exe");
        std::fs::write(&path, b"test executable path only").unwrap();
        let found = choose(vec![
            (
                root.join("missing/RiotClientServices.exe")
                    .to_string_lossy()
                    .into_owned(),
                "stale".into(),
            ),
            (path.to_string_lossy().into_owned(), "custom".into()),
        ])
        .unwrap();
        assert_eq!(found.source, "custom");
        assert!(validate_override(root.to_str().unwrap()).is_err());
        assert!(validate_override(path.to_str().unwrap()).unwrap().is_some());
        std::fs::remove_dir_all(root).unwrap();
    }
}
