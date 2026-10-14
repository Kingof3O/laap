//! Explicit icon downloads and opt-in, read-only League Client synchronization.
//! Browser CSP remains offline; no network operation is started by reading a cached asset.
use crate::local_store::{LocalAccountStorage, LocalStore};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read},
    path::PathBuf,
    time::Duration,
};

const IMAGE_LIMIT: usize = 5 * 1024 * 1024;
const JSON_LIMIT: usize = 8 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
pub struct IconEntry {
    pub id: u32,
    pub label: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct IconCatalog {
    pub version: String,
    pub icons: Vec<IconEntry>,
}
#[derive(Serialize)]
pub struct CachedIcon {
    pub asset: String,
    pub data_url: String,
}
#[derive(Default, Serialize)]
pub struct SyncResult {
    pub changed: bool,
    pub account_id: Option<String>,
    pub message: Option<String>,
    pub state: SyncState,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncState {
    #[default]
    Waiting,
    Success,
    Error,
}
fn assets_dir() -> Result<PathBuf, String> {
    let path = LocalAccountStorage::default_storage_dir().join("profile-assets");
    fs::create_dir_all(&path).map_err(|e| format!("Unable to create icon cache: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(path)
}
pub fn validate_asset_key(key: &str) -> Result<(), String> {
    if key.len() > 100
        || !key.ends_with(".png")
        || !(key.starts_with("upload-") || key.starts_with("dd-"))
        || key.contains("..")
        || !key
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'.'))
    {
        return Err("Invalid cached icon reference".into());
    }
    Ok(())
}
fn version_valid(version: &str) -> bool {
    !version.is_empty()
        && version.len() < 32
        && version
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|c| c.is_ascii_digit()))
}
fn icon_key(version: &str, id: u32) -> Result<String, String> {
    if !version_valid(version) {
        return Err("Invalid Data Dragon version".into());
    }
    Ok(format!("dd-{version}-{id}.png"))
}
fn external_client() -> Result<Client, String> {
    Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .user_agent("LAAP profile assets")
        .build()
        .map_err(|_| "Unable to initialize icon downloads".into())
}
fn download(client: &Client, url: &str, limit: usize) -> Result<Vec<u8>, String> {
    // URLs are constructed internally. Caller cannot supply a host, redirect, or arbitrary path.
    let response = client
        .get(url)
        .send()
        .map_err(|_| "Icon download unavailable. Check your connection and try again.".to_string())?
        .error_for_status()
        .map_err(|e| {
            format!(
                "Asset service returned {}",
                e.status()
                    .map(|s| s.as_u16().to_string())
                    .unwrap_or_else(|| "an error".into())
            )
        })?;
    let mut bytes = Vec::new();
    response
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Unable to read downloaded asset".to_string())?;
    if bytes.len() > limit {
        return Err("Downloaded asset is too large".into());
    }
    Ok(bytes)
}
fn normalize_image(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > IMAGE_LIMIT {
        return Err("Choose an image smaller than 5 MB".into());
    }
    let reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Invalid image file".to_string())?;
    if !matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP)
    ) {
        return Err("Choose a PNG, JPEG, or WebP image".into());
    }
    let (width, height) = reader
        .into_dimensions()
        .map_err(|_| "Unable to read image dimensions".to_string())?;
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err("Choose an image up to 4096 × 4096 pixels".into());
    }
    let image = image::load_from_memory(bytes)
        .map_err(|_| "Unable to decode image".to_string())?
        .resize_to_fill(128, 128, image::imageops::FilterType::Lanczos3);
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|_| "Unable to prepare image".to_string())?;
    Ok(output.into_inner())
}
fn cached_icon(key: &str) -> Result<Option<CachedIcon>, String> {
    cached_icon_in(&assets_dir()?, key)
}
fn cached_icon_in(root: &std::path::Path, key: &str) -> Result<Option<CachedIcon>, String> {
    validate_asset_key(key)?;
    match fs::read(root.join(key)) {
        Ok(bytes) => {
            if bytes.len() > IMAGE_LIMIT || image::load_from_memory(&bytes).is_err() {
                return Err("Cached icon is damaged. Download it again.".into());
            }
            Ok(Some(CachedIcon {
                asset: key.into(),
                data_url: format!("data:image/png;base64,{}", STANDARD.encode(bytes)),
            }))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Unable to read cached icon: {e}")),
    }
}
fn save_icon(key: &str, bytes: &[u8]) -> Result<CachedIcon, String> {
    save_icon_in(&assets_dir()?, key, bytes)
}
fn save_icon_in(root: &std::path::Path, key: &str, bytes: &[u8]) -> Result<CachedIcon, String> {
    validate_asset_key(key)?;
    let png = normalize_image(bytes)?;
    crate::riot::session_manager::write_private(&root.join(key), &png)?;
    Ok(CachedIcon {
        asset: key.into(),
        data_url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
    })
}
fn catalog(download_requested: bool) -> Result<Option<IconCatalog>, String> {
    let path = assets_dir()?.join("icon-catalog.json");
    if !download_requested {
        return match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|_| "Cached catalog is damaged. Download it again.".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        };
    }
    let client = external_client()?;
    let versions: Vec<String> = serde_json::from_slice(&download(
        &client,
        "https://ddragon.leagueoflegends.com/api/versions.json",
        JSON_LIMIT,
    )?)
    .map_err(|_| "Invalid Data Dragon versions response".to_string())?;
    let version = versions
        .into_iter()
        .find(|v| version_valid(v))
        .ok_or("Data Dragon has no supported version")?;
    let data: serde_json::Value = serde_json::from_slice(&download(
        &client,
        &format!("https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/profileicon.json"),
        JSON_LIMIT,
    )?)
    .map_err(|_| "Invalid profile icon catalog".to_string())?;
    let icons = data
        .get("data")
        .and_then(|v| v.as_object())
        .ok_or("No icons in Data Dragon catalog")?;
    let mut icons: Vec<IconEntry> = icons
        .iter()
        .filter_map(|(key, value)| {
            key.parse::<u32>().ok().map(|id| IconEntry {
                id,
                label: value
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("Icon #{id}")),
            })
        })
        .collect();
    icons.sort_by_key(|entry| std::cmp::Reverse(entry.id));
    if icons.is_empty() {
        return Err("Data Dragon returned an empty icon catalog".into());
    }
    let result = IconCatalog { version, icons };
    crate::riot::session_manager::write_private(
        &path,
        &serde_json::to_vec(&result).map_err(|e| e.to_string())?,
    )?;
    Ok(Some(result))
}
fn profile_icon(
    version: &str,
    id: u32,
    download_requested: bool,
) -> Result<Option<CachedIcon>, String> {
    let key = icon_key(version, id)?;
    match cached_icon(&key) {
        Ok(Some(cached)) => return Ok(Some(cached)),
        Err(error) if !download_requested => return Err(error),
        _ => {}
    }
    if !download_requested {
        return Ok(None);
    }
    let bytes = download(
        &external_client()?,
        &format!("https://ddragon.leagueoflegends.com/cdn/{version}/img/profileicon/{id}.png"),
        IMAGE_LIMIT,
    )?;
    save_icon(&key, &bytes).map(Some)
}
#[tauri::command]
pub async fn get_icon_catalog(download_requested: bool) -> Result<Option<IconCatalog>, String> {
    tauri::async_runtime::spawn_blocking(move || catalog(download_requested))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn get_profile_icon(
    version: String,
    icon_id: u32,
    download_requested: bool,
) -> Result<Option<CachedIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        profile_icon(&version, icon_id, download_requested)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_cached_icon(asset: String) -> Result<Option<CachedIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || cached_icon(&asset))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upload_profile_icon(base64_image: String) -> Result<CachedIcon, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if base64_image.len() > 7 * 1024 * 1024 {
            return Err("Choose an image smaller than 5 MB".into());
        }
        let bytes = STANDARD
            .decode(base64_image)
            .map_err(|_| "Invalid image upload".to_string())?;
        let normalized = normalize_image(&bytes)?;
        let hash = format!("{:x}", Sha256::digest(&normalized));
        save_icon(&format!("upload-{hash}.png"), &normalized)
    })
    .await
    .map_err(|e| e.to_string())?
}

struct LcuConnection {
    port: u16,
    password: String,
    client: Client,
}
fn command_argument(arguments: &[String], name: &str) -> Option<String> {
    arguments.iter().enumerate().find_map(|(index, value)| {
        value
            .strip_prefix(&format!("{name}="))
            .map(str::to_string)
            .or_else(|| {
                (value == name)
                    .then(|| arguments.get(index + 1).cloned())
                    .flatten()
            })
    })
}
fn lcu_connection() -> Result<Option<LcuConnection>, String> {
    let system = sysinfo::System::new_all();
    let mut saw_client = false;
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_lowercase();
        if ![
            "leagueclient",
            "leagueclient.exe",
            "leagueclientux",
            "leagueclientux.exe",
        ]
        .contains(&name.as_str())
        {
            continue;
        }
        saw_client = true;
        let args: Vec<String> = process
            .cmd()
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let credentials = command_argument(&args, "--app-port")
            .zip(command_argument(&args, "--remoting-auth-token"));
        let credentials = credentials.or_else(|| {
            for directory in process.exe()?.ancestors().skip(1).take(8) {
                let Ok(contents) = fs::read_to_string(directory.join("lockfile")) else {
                    continue;
                };
                let fields: Vec<_> = contents.trim().split(':').collect();
                if fields.len() == 5 && fields[4] == "https" {
                    return Some((fields[2].into(), fields[3].into()));
                }
            }
            None
        });
        if let Some((port, password)) = credentials {
            let port = port
                .parse::<u16>()
                .map_err(|_| "Invalid local League port".to_string())?;
            if port == 0 || password.is_empty() {
                continue;
            }
            // LCU uses a self-signed loopback certificate. This exception is confined
            // to this client: host is hardcoded, proxies/redirects are disabled, credentials never leave localhost.
            let client = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .danger_accept_invalid_certs(true)
                .timeout(Duration::from_secs(3))
                .build()
                .map_err(|_| "Unable to connect to local League client".to_string())?;
            return Ok(Some(LcuConnection {
                port,
                password,
                client,
            }));
        }
    }
    if saw_client {
        Err("Cannot read League Client connection details. Restart League or run both apps with matching permissions.".into())
    } else {
        Ok(None)
    }
}
impl LcuConnection {
    fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        let response = self
            .client
            .get(format!("https://127.0.0.1:{}{path}", self.port))
            .basic_auth("riot", Some(&self.password))
            .send()
            .map_err(|_| "League client is not ready yet".to_string())?
            .error_for_status()
            .map_err(|_| "League client has no active login yet".to_string())?;
        let mut bytes = Vec::new();
        response
            .take((JSON_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "Unable to read local League response".to_string())?;
        if bytes.len() > JSON_LIMIT {
            return Err("Local League response too large".into());
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| "Invalid response from local League client".into())
    }
}
pub fn solo_rank(value: &serde_json::Value) -> Option<String> {
    let entry = value
        .get("queueMap")
        .and_then(|v| v.as_object())
        .and_then(|map| {
            map.iter()
                .find(|(key, _)| key.eq_ignore_ascii_case("RANKED_SOLO_5x5"))
                .map(|(_, v)| v)
        })
        .or_else(|| {
            value
                .get("queues")
                .and_then(|v| v.as_array())
                .and_then(|queues| {
                    queues.iter().find(|q| {
                        q.get("queueType")
                            .and_then(|v| v.as_str())
                            .is_some_and(|q| q.eq_ignore_ascii_case("RANKED_SOLO_5x5"))
                    })
                })
        });
    let entry = entry?;
    let tier = entry.get("tier")?.as_str()?.to_uppercase();
    let display = match tier.as_str() {
        "UNRANKED" | "NONE" => return Some("Unranked".into()),
        "IRON" => "Iron",
        "BRONZE" => "Bronze",
        "SILVER" => "Silver",
        "GOLD" => "Gold",
        "PLATINUM" => "Platinum",
        "EMERALD" => "Emerald",
        "DIAMOND" => "Diamond",
        "MASTER" => return Some("Master".into()),
        "GRANDMASTER" => return Some("Grandmaster".into()),
        "CHALLENGER" => return Some("Challenger".into()),
        _ => return None,
    };
    let division = match entry.get("division")?.as_str()?.to_uppercase().as_str() {
        "I" | "1" => "I",
        "II" | "2" => "II",
        "III" | "3" => "III",
        "IV" | "4" => "IV",
        _ => return None,
    };
    Some(format!("{display} {division}"))
}
static SYNC_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
fn sync_customizations() -> Result<SyncResult, String> {
    let _sync = match SYNC_LOCK.try_lock() {
        Ok(lock) => lock,
        Err(std::sync::TryLockError::WouldBlock) => {
            return Ok(SyncResult {
                message: Some("Another profile sync is already running. Try again shortly.".into()),
                ..Default::default()
            })
        }
        Err(std::sync::TryLockError::Poisoned(error)) => {
            SYNC_LOCK.clear_poison();
            error.into_inner()
        }
    };
    let store = LocalStore::new()?;
    let accounts = store.load_accounts()?;
    if !accounts
        .iter()
        .any(|a| a.customization.auto_sync_icon || a.customization.auto_sync_rank)
    {
        return Ok(SyncResult {
            message: Some("No saved profile has icon/rank auto-sync enabled. Enable it in Edit Profile first.".into()),
            ..Default::default()
        });
    }
    if accounts
        .iter()
        .filter(|a| a.customization.auto_sync_icon || a.customization.auto_sync_rank)
        .all(|a| a.puuid.is_none())
    {
        return Ok(SyncResult {
            message: Some(
                "Use Sign in again once to bind this profile's identity before auto-sync.".into(),
            ),
            ..Default::default()
        });
    }
    let Some(lcu) = lcu_connection()? else {
        return Ok(SyncResult {
            message: Some("Waiting for League Client login".into()),
            ..Default::default()
        });
    };
    let summoner = lcu.get("/lol-summoner/v1/current-summoner")?;
    let puuid = summoner
        .get("puuid")
        .and_then(|v| v.as_str())
        .ok_or("League has not provided an account identity")?;
    let Some(account) = accounts.iter().find(|a| {
        a.puuid.as_deref() == Some(puuid)
            && (a.customization.auto_sync_icon || a.customization.auto_sync_rank)
    }) else {
        return Ok(SyncResult {
            message: Some("The League account does not match an opted-in saved profile".into()),
            ..Default::default()
        });
    };
    let mut warnings = Vec::new();
    let rank = if account.customization.auto_sync_rank {
        match lcu.get("/lol-ranked/v1/current-ranked-stats") {
            Ok(data) => match solo_rank(&data) {
                Some(rank) => Some(rank),
                None => {
                    warnings.push(
                        "Solo/Duo rank is unavailable; your saved rank was kept.".to_string(),
                    );
                    None
                }
            },
            Err(error) => {
                warnings.push(format!("Rank sync failed: {error}"));
                None
            }
        }
    } else {
        None
    };
    let mut icon = None;
    if account.customization.auto_sync_icon {
        if let Some(id) = summoner
            .get("profileIconId")
            .and_then(|v| v.as_u64())
            .and_then(|v| u32::try_from(v).ok())
        {
            if account.customization.icon_id != Some(id)
                || account
                    .customization
                    .icon_asset
                    .as_ref()
                    .is_none_or(|key| cached_icon(key).ok().flatten().is_none())
            {
                let result = (|| {
                    let initial = match catalog(false).ok().flatten() {
                        Some(c) => c,
                        None => catalog(true)?.ok_or("Icon catalog unavailable")?,
                    };
                    // A cached patch catalog may predate a newly equipped icon.
                    // Refresh once before reporting a visible download failure.
                    match profile_icon(&initial.version, id, true) {
                        Ok(Some(icon)) => Ok(icon),
                        _ => {
                            let latest = catalog(true)?.ok_or("Icon catalog unavailable")?;
                            profile_icon(&latest.version, id, true)?
                                .ok_or_else(|| "Icon unavailable".to_string())
                        }
                    }
                })();
                match result {
                    Ok(asset) => icon = Some((asset.asset, id)),
                    Err(error) => warnings.push(format!("Icon sync failed: {error}")),
                }
            }
        } else {
            warnings
                .push("League has not provided a profile icon; your saved image was kept.".into());
        }
    }
    // Recheck identity after any slow image download; never apply results from a previous login.
    let current = lcu.get("/lol-summoner/v1/current-summoner")?;
    if current.get("puuid").and_then(|v| v.as_str()) != Some(puuid) {
        return Ok(SyncResult {
            message: Some(
                "League account changed during sync. Saved data was kept; try again.".into(),
            ),
            ..Default::default()
        });
    }
    let rank = rank.filter(|rank| account.rank.as_ref() != Some(rank));
    let changed = if rank.is_some() || icon.is_some() {
        store.apply_customization_sync(&account.id, puuid, rank, icon)?
    } else {
        false
    };
    Ok(SyncResult {
        changed,
        account_id: Some(account.id.clone()),
        state: if warnings.is_empty() {
            SyncState::Success
        } else {
            SyncState::Error
        },
        message: Some(if warnings.is_empty() {
            format!(
                "{}: enabled icon/rank sync checked — {}.",
                account.name,
                if changed {
                    "profile updated"
                } else {
                    "already up to date"
                }
            )
        } else {
            format!(
                "{}: {}{}",
                account.name,
                if changed { "Some data updated. " } else { "" },
                warnings.join(" ")
            )
        }),
    })
}
#[tauri::command]
pub async fn sync_profile_customizations() -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(sync_customizations)
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn asset_keys_cannot_escape_cache() {
        for key in [
            "../vault.json",
            "upload-../vault.png",
            "https://example.com/a.png",
            "dd-a/b.png",
        ] {
            assert!(validate_asset_key(key).is_err())
        }
        assert!(validate_asset_key("dd-16.20.1-685.png").is_ok());
    }
    #[test]
    fn reads_only_solo_queue_and_normalizes_divisions() {
        assert_eq!(
            solo_rank(
                &serde_json::json!({"queueMap":{"RANKED_SOLO_5x5":{"tier":"DIAMOND","division":"2"},"RANKED_FLEX_SR":{"tier":"GOLD","division":"I"}}})
            ),
            Some("Diamond II".into())
        );
        assert_eq!(
            solo_rank(
                &serde_json::json!({"queueMap":{"RANKED_SOLO_5x5":{"tier":"MASTER","division":"NA"}}})
            ),
            Some("Master".into())
        );
        assert_eq!(solo_rank(&serde_json::json!({})), None);
    }
    #[test]
    fn rejects_non_images() {
        assert!(normalize_image(b"<svg onload='bad()'/>").is_err());
    }
}

#[cfg(test)]
mod image_tests {
    use super::*;
    #[test]
    fn uploaded_images_become_small_pngs_without_original_metadata() {
        let bytes = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../public/rank-crests/gold.png"
        ));
        let normalized = normalize_image(bytes).unwrap();
        let decoded = image::load_from_memory(&normalized).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (128, 128));
        assert!(normalized.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(
            normalize_image(&vec![0; IMAGE_LIMIT + 1]).unwrap_err(),
            "Choose an image smaller than 5 MB"
        );
    }
}

#[cfg(test)]
mod cache_tests {
    use super::*;
    #[test]
    fn damaged_cached_images_report_a_repairable_error() {
        let root =
            std::env::temp_dir().join(format!("laap-damaged-icon-{:032x}", rand::random::<u128>()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("dd-16.20.1-685.png"), b"incomplete download").unwrap();
        assert!(cached_icon_in(&root, "dd-16.20.1-685.png")
            .err()
            .unwrap()
            .contains("damaged"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn selected_images_are_read_from_disk_without_network_after_memory_is_discarded() {
        let root =
            std::env::temp_dir().join(format!("laap-icon-cache-{:032x}", rand::random::<u128>()));
        fs::create_dir_all(&root).unwrap();
        let bytes = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../public/rank-crests/gold.png"
        ));
        let expected = save_icon_in(&root, "upload-example.png", bytes)
            .unwrap()
            .data_url;
        let restored = cached_icon_in(&root, "upload-example.png")
            .unwrap()
            .unwrap();
        assert_eq!(restored.data_url, expected);
        assert!(cached_icon_in(&root, "dd-16.20.1-123.png")
            .unwrap()
            .is_none());
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod live_contract_tests {
    use super::*;
    #[test]
    #[ignore = "Explicit public Data Dragon network smoke check; no vault or credentials accessed"]
    fn riot_data_dragon_contract_is_usable() {
        let client = external_client().unwrap();
        let versions: Vec<String> = serde_json::from_slice(
            &download(
                &client,
                "https://ddragon.leagueoflegends.com/api/versions.json",
                JSON_LIMIT,
            )
            .unwrap(),
        )
        .unwrap();
        let version = versions
            .iter()
            .find(|version| version_valid(version))
            .unwrap();
        let catalog: serde_json::Value = serde_json::from_slice(
            &download(
                &client,
                &format!(
                    "https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/profileicon.json"
                ),
                JSON_LIMIT,
            )
            .unwrap(),
        )
        .unwrap();
        assert!(catalog["data"]["685"].is_object());
        let bytes = download(
            &client,
            &format!("https://ddragon.leagueoflegends.com/cdn/{version}/img/profileicon/685.png"),
            IMAGE_LIMIT,
        )
        .unwrap();
        assert!(normalize_image(&bytes).unwrap().starts_with(b"\x89PNG"));
    }
}
