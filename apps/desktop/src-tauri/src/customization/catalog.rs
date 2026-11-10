use super::{catalog_seed::Seed, storage};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::BTreeMap, io::Read, path::PathBuf, time::Duration};
use tauri::AppHandle;

const SOURCE: &str = "https://ddragon.leagueoflegends.com";
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const LOCALES: &[&str] = &[
    "en_US", "de_DE", "es_ES", "es_MX", "fr_FR", "it_IT", "ja_JP", "ko_KR", "pl_PL", "pt_BR",
    "ru_RU", "tr_TR", "zh_CN", "zh_TW", "th_TH", "vi_VN", "id_ID", "ms_MY", "en_GB", "el_GR",
    "cs_CZ", "hu_HU", "ro_RO", "ar_AE",
];
static NETWORK: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

#[derive(Deserialize, Serialize)]
struct SourceList<T> {
    data: BTreeMap<String, T>,
}

#[derive(Deserialize, Serialize)]
pub struct Champion {
    pub(super) id: String,
    name: String,
    title: String,
    tags: Vec<String>,
}

#[derive(Deserialize, Serialize)]
pub struct ChampionDetail {
    #[serde(flatten)]
    pub(super) champion: Champion,
    lore: String,
    pub(super) skins: Vec<Skin>,
}

#[derive(Deserialize, Serialize)]
pub struct Skin {
    pub(super) id: String,
    pub(super) num: u32,
    name: String,
    chromas: bool,
}

#[derive(Deserialize, Serialize)]
pub struct Snapshot<T> {
    pub(super) version: String,
    pub(super) locale: String,
    pub(super) data: T,
    #[serde(default)]
    cached: bool,
    #[serde(default)]
    bundled: bool,
}

pub(super) fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

pub(super) fn safe_version(version: &str) -> bool {
    version.len() <= 24
        && version.split('.').count() == 3
        && version
            .split('.')
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

fn fetch<T: DeserializeOwned>(client: &reqwest::blocking::Client, path: &str) -> Result<T, String> {
    let mut bytes = Vec::new();
    client
        .get(format!("{SOURCE}/{path}"))
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|e| e.to_string())?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Catalog response exceeds the supported size.".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("Invalid catalog response: {e}"))
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("LAAP-Studio-Catalog")
        .build()
        .map_err(|e| e.to_string())
}

async fn cached_or_fetch<T: DeserializeOwned + Serialize + Send + 'static>(
    path: PathBuf,
    refresh: bool,
    load: impl FnOnce() -> Result<Snapshot<T>, String> + Send + 'static,
) -> Result<Snapshot<T>, String> {
    let permit = NETWORK
        .acquire()
        .await
        .map_err(|_| "Catalog requests are busy. Try again shortly.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let cached = storage::read::<Snapshot<T>>(&path, MAX_BYTES)
            .ok()
            .flatten()
            .map(|mut c| {
                c.cached = true;
                c
            });
        if !refresh {
            if let Some(cached) = cached {
                return Ok(cached);
            }
        }
        match load() {
            Ok(snapshot) => {
                storage::write(&path, &snapshot)?;
                Ok(snapshot)
            }
            Err(error) => cached.ok_or_else(|| format!("Catalog unavailable: {error}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn catalog_list(
    app: AppHandle,
    locale: String,
    refresh: bool,
) -> Result<Snapshot<Vec<Champion>>, String> {
    if !LOCALES.contains(&locale.as_str()) {
        return Err("Unsupported catalog locale.".into());
    }
    let path = storage::root(&app)?
        .join("catalog")
        .join(format!("champions-{locale}.json"));
    let seed_app = app.clone();
    let seed_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let cache_valid = storage::read::<Snapshot<Vec<Champion>>>(&seed_path, MAX_BYTES)
            .ok()
            .flatten()
            .is_some_and(|snapshot| {
                safe_version(&snapshot.version)
                    && LOCALES.contains(&snapshot.locale.as_str())
                    && !snapshot.data.is_empty()
                    && snapshot.data.iter().all(|row| safe_id(&row.id))
            });
        if !cache_valid {
            if let Ok(seed) = Seed::open(&seed_app).and_then(|seed| seed.index()) {
                storage::write(&seed_path, &seed)?;
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    cached_or_fetch(path, refresh, move || {
        let client = client()?;
        let versions: Vec<String> = fetch(&client, "api/versions.json")?;
        let version = versions
            .into_iter()
            .find(|v| safe_version(v))
            .ok_or("No supported catalog version.")?;
        let load = |locale: &str| {
            fetch::<SourceList<Champion>>(
                &client,
                &format!("cdn/{version}/data/{locale}/champion.json"),
            )
        };
        let (mut rows, actual_locale) = match load(&locale) {
            Ok(rows) => (rows.data, locale),
            Err(_) if locale != "en_US" => (load("en_US")?.data, "en_US".into()),
            Err(e) => return Err(e),
        };
        rows.retain(|key, row| key == &row.id && safe_id(key));
        if rows.is_empty() {
            return Err("No valid champions in catalog response.".into());
        }
        Ok(Snapshot {
            version,
            locale: actual_locale,
            data: rows.into_values().collect(),
            cached: false,
            bundled: false,
        })
    })
    .await
}

#[tauri::command]
pub async fn catalog_champion(
    app: AppHandle,
    id: String,
    version: String,
    locale: String,
) -> Result<Snapshot<ChampionDetail>, String> {
    if !safe_id(&id) || !safe_version(&version) || !LOCALES.contains(&locale.as_str()) {
        return Err("Invalid catalog selection.".into());
    }
    // Only resolve IDs present in the current provider index. This bounds on-disk keys.
    let dir = storage::root(&app)?.join("catalog");
    let mut known = false;
    for key in LOCALES {
        let path = dir.join(format!("champions-{key}.json"));
        if let Ok(Some(index)) = storage::read::<Snapshot<Vec<Champion>>>(&path, MAX_BYTES) {
            if index.version == version
                && index.locale == locale
                && index.data.iter().any(|row| row.id == id)
            {
                known = true;
                break;
            }
        }
    }
    if !known {
        return Err("Refresh the catalog before opening this champion.".into());
    }
    if locale == "en_US" {
        let seed_app = app.clone();
        let seed_id = id.clone();
        let seed_version = version.clone();
        if let Some(snapshot) = tauri::async_runtime::spawn_blocking(move || {
            Seed::open(&seed_app)
                .and_then(|seed| seed.detail(&seed_id, &seed_version))
                .ok()
        })
        .await
        .map_err(|e| e.to_string())?
        {
            return Ok(snapshot);
        }
    }
    let path = dir.join(format!("detail-{locale}-{id}.json"));
    let refresh = storage::read::<Snapshot<ChampionDetail>>(&path, MAX_BYTES)
        .ok()
        .flatten()
        .is_some_and(|entry| entry.version != version);
    cached_or_fetch(path, refresh, move || {
        let client = client()?;
        let mut response: SourceList<ChampionDetail> = fetch(
            &client,
            &format!("cdn/{version}/data/{locale}/champion/{id}.json"),
        )?;
        let data = response
            .data
            .remove(&id)
            .filter(|row| row.champion.id == id)
            .ok_or("Champion missing from provider response.")?;
        Ok(Snapshot {
            version,
            locale,
            data,
            cached: false,
            bundled: false,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Uses the public Riot Data Dragon HTTPS service"]
    fn live_studio_catalog_contract() {
        let client = client().unwrap();
        let versions: Vec<String> = fetch(&client, "api/versions.json").unwrap();
        let version = versions
            .into_iter()
            .find(|version| safe_version(version))
            .unwrap();
        let index: SourceList<Champion> =
            fetch(&client, &format!("cdn/{version}/data/en_US/champion.json")).unwrap();
        assert!(index.data.contains_key("Ahri"));
        let detail: SourceList<ChampionDetail> = fetch(
            &client,
            &format!("cdn/{version}/data/en_US/champion/Ahri.json"),
        )
        .unwrap();
        assert!(!detail.data["Ahri"].skins.is_empty());
    }

    #[test]
    fn provider_keys_are_not_paths() {
        assert!(safe_id("MonkeyKing"));
        assert!(!safe_id("../Ahri"));
        assert!(safe_version("16.22.1"));
        assert!(!safe_version("1.2.3/../../"));
    }
}
