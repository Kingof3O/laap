use super::{catalog_preferences::Selection, catalog_seed::Seed, storage};
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

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chroma {
    pub id: String,
    pub name: String,
    pub num: u32,
    #[serde(default)]
    pub colors: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TftItem {
    pub id: String,
    pub name: String,
    pub category: String, // "Tactician", "Arena", "Boom"
    pub tier: Option<u32>,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Champion {
    pub(super) id: String,
    #[serde(default)]
    pub(super) key: Option<String>,
    name: String,
    title: String,
    tags: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct ChampionDetail {
    #[serde(flatten)]
    pub(super) champion: Champion,
    lore: String,
    pub(super) skins: Vec<Skin>,
    #[serde(default)]
    pub variants: Vec<Variant>,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Skin {
    pub(super) id: String,
    pub(super) num: u32,
    name: String,
    chromas: bool,
    #[serde(default, rename = "availableChromas")]
    pub chroma_list: Vec<Chroma>,
    #[serde(default)]
    pub variants: Vec<Variant>,
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

fn attach_chromas_and_variants(detail: &mut ChampionDetail) {
    // Known multi-form champions
    match detail.champion.id.as_str() {
        "Lux" => {
            for skin in &mut detail.skins {
                if skin.name.contains("Elementalist") {
                    skin.variants = vec![
                        Variant {
                            id: "light".into(),
                            name: "Light".into(),
                            description: "Starting form".into(),
                        },
                        Variant {
                            id: "fire".into(),
                            name: "Fire".into(),
                            description: "Offensive fire magic".into(),
                        },
                        Variant {
                            id: "water".into(),
                            name: "Water".into(),
                            description: "Flowing oceanic form".into(),
                        },
                        Variant {
                            id: "air".into(),
                            name: "Air".into(),
                            description: "Swift atmospheric form".into(),
                        },
                        Variant {
                            id: "nature".into(),
                            name: "Nature".into(),
                            description: "Verdant earth form".into(),
                        },
                        Variant {
                            id: "magma".into(),
                            name: "Magma".into(),
                            description: "Molten combination".into(),
                        },
                        Variant {
                            id: "storm".into(),
                            name: "Storm".into(),
                            description: "Lightning combination".into(),
                        },
                        Variant {
                            id: "mystic".into(),
                            name: "Mystic".into(),
                            description: "Arcane butterfly form".into(),
                        },
                        Variant {
                            id: "ice".into(),
                            name: "Ice".into(),
                            description: "Glacial combination".into(),
                        },
                        Variant {
                            id: "dark".into(),
                            name: "Dark".into(),
                            description: "Shadow eclipse form".into(),
                        },
                    ];
                }
            }
        }
        "Kayn" => {
            for skin in &mut detail.skins {
                skin.variants = vec![
                    Variant {
                        id: "base".into(),
                        name: "Base Kayn".into(),
                        description: "Standard form".into(),
                    },
                    Variant {
                        id: "shadow".into(),
                        name: "Shadow Assassin".into(),
                        description: "Lethal blue mobility form".into(),
                    },
                    Variant {
                        id: "rhaast".into(),
                        name: "Darkin Rhaast".into(),
                        description: "Sustained red bruiser form".into(),
                    },
                ];
            }
        }
        "Sona" => {
            for skin in &mut detail.skins {
                if skin.name.contains("DJ") {
                    skin.variants = vec![
                        Variant {
                            id: "kinetic".into(),
                            name: "Kinetic".into(),
                            description: "Upbeat electronic rhythm".into(),
                        },
                        Variant {
                            id: "concussive".into(),
                            name: "Concussive".into(),
                            description: "Intense bass beat".into(),
                        },
                        Variant {
                            id: "ethereal".into(),
                            name: "Ethereal".into(),
                            description: "Atmospheric ambient tune".into(),
                        },
                    ];
                }
            }
        }
        "MissFortune" => {
            for skin in &mut detail.skins {
                if skin.name.contains("Gun Goddess") {
                    skin.variants = vec![
                        Variant {
                            id: "scarlet".into(),
                            name: "Scarlet Fair".into(),
                            description: "Default assault exo-suit".into(),
                        },
                        Variant {
                            id: "zero".into(),
                            name: "Zero Hour".into(),
                            description: "Gravity-well heavy armor".into(),
                        },
                        Variant {
                            id: "starswarm".into(),
                            name: "Starswarm".into(),
                            description: "Plasma wave armament".into(),
                        },
                        Variant {
                            id: "royal".into(),
                            name: "Royal Arms".into(),
                            description: "Antimatter fleet commander".into(),
                        },
                    ];
                }
            }
        }
        "Seraphine" => {
            for skin in &mut detail.skins {
                if skin.name.contains("K/DA") {
                    skin.variants = vec![
                        Variant {
                            id: "indie".into(),
                            name: "Indie".into(),
                            description: "Acoustic bedroom musician".into(),
                        },
                        Variant {
                            id: "rising_star".into(),
                            name: "Rising Star".into(),
                            description: "Debut viral performer".into(),
                        },
                        Variant {
                            id: "superstar".into(),
                            name: "Superstar".into(),
                            description: "Global pop sensation".into(),
                        },
                    ];
                }
            }
        }
        _ => {}
    }

    // Only attach authentic canonical multi-form variants (Elementalist Lux, DJ Sona, Gun Goddess MF, K/DA Seraphine, Kayn)
    // Synthetic chroma IDs are never fabricated; authentic chromas are fetched from CommunityDragon.
}

#[derive(Deserialize)]
struct CdChroma {
    id: u64,
    name: String,
    #[serde(default)]
    colors: Vec<String>,
}

#[derive(Deserialize)]
struct CdSkin {
    id: u64,
    #[serde(default)]
    chromas: Vec<CdChroma>,
}

#[derive(Deserialize)]
struct CdChampion {
    #[serde(default)]
    skins: Vec<CdSkin>,
}

fn fetch_community_dragon_chromas(
    key: &str,
    version: &str,
) -> Option<BTreeMap<String, Vec<Chroma>>> {
    if !safe_version(version) || !key.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let patch = version.rsplit_once('.')?.0;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .ok()?;
    let url = format!(
        "https://raw.communitydragon.org/{patch}/plugins/rcp-be-lol-game-data/global/default/v1/champions/{key}.json"
    );
    let res = client.get(&url).send().ok()?;
    if !res.status().is_success() {
        return None;
    }
    let mut bytes = Vec::new();
    res.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MAX_BYTES {
        return None;
    }
    let cd: CdChampion = serde_json::from_slice(&bytes).ok()?;
    let mut map = BTreeMap::new();
    for s in cd.skins {
        if !s.chromas.is_empty() {
            let chromas: Vec<Chroma> = s
                .chromas
                .into_iter()
                .map(|c| Chroma {
                    id: c.id.to_string(),
                    name: c.name,
                    num: (c.id % 1000) as u32,
                    colors: c.colors,
                })
                .collect();
            map.insert(s.id.to_string(), chromas);
        }
    }
    Some(map)
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
        if let Some(mut snapshot) = tauri::async_runtime::spawn_blocking(move || {
            Seed::open(&seed_app)
                .and_then(|seed| seed.detail(&seed_id, &seed_version))
                .ok()
        })
        .await
        .map_err(|e| e.to_string())?
        {
            attach_chromas_and_variants(&mut snapshot.data);
            snapshot = tauri::async_runtime::spawn_blocking(move || {
                if let Some(key) = &snapshot.data.champion.key {
                    if let Some(mut cd_chromas) =
                        fetch_community_dragon_chromas(key, &snapshot.version)
                    {
                        for skin in &mut snapshot.data.skins {
                            if let Some(chromas) = cd_chromas.remove(&skin.id) {
                                skin.chroma_list = chromas;
                            }
                        }
                    }
                }
                snapshot
            })
            .await
            .map_err(|e| e.to_string())?;
            storage::write(&dir.join(format!("detail-{locale}-{id}.json")), &snapshot)?;
            return Ok(snapshot);
        }
    }
    let path = dir.join(format!("detail-{locale}-{id}.json"));
    let refresh = storage::read::<Snapshot<ChampionDetail>>(&path, MAX_BYTES)
        .ok()
        .flatten()
        .is_some_and(|entry| entry.version != version);
    let mut result = cached_or_fetch(path, refresh, move || {
        let client = client()?;
        let mut response: SourceList<ChampionDetail> = fetch(
            &client,
            &format!("cdn/{version}/data/{locale}/champion/{id}.json"),
        )?;
        let mut data = response
            .data
            .remove(&id)
            .filter(|row| row.champion.id == id)
            .ok_or("Champion missing from provider response.")?;
        attach_chromas_and_variants(&mut data);
        Ok(Snapshot {
            version,
            locale,
            data,
            cached: false,
            bundled: false,
        })
    })
    .await?;
    attach_chromas_and_variants(&mut result.data);
    result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(key) = &result.data.champion.key {
            if let Some(mut cd_chromas) = fetch_community_dragon_chromas(key, &result.version) {
                for skin in &mut result.data.skins {
                    if let Some(chromas) = cd_chromas.remove(&skin.id) {
                        skin.chroma_list = chromas;
                    }
                }
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[derive(Deserialize)]
struct CdCompanion {
    #[serde(rename = "itemId")]
    item_id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    level: Option<u32>,
}

#[derive(Deserialize)]
struct CdCosmeticItem {
    #[serde(rename = "itemId")]
    item_id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
}

#[tauri::command]
pub async fn catalog_tft_list(app: AppHandle) -> Result<Vec<TftItem>, String> {
    let snapshot = catalog_list(app.clone(), "en_US".into(), false).await?;
    let version = snapshot.version;
    let patch = version
        .rsplit_once('.')
        .ok_or("Invalid catalog patch")?
        .0
        .to_string();
    let path = storage::root(&app)?
        .join("catalog")
        .join(format!("tft-{patch}.json"));
    tauri::async_runtime::spawn_blocking(move||{
        if let Ok(Some(cached))=storage::read::<Snapshot<Vec<TftItem>>>(&path,MAX_BYTES){if cached.version==version{return Ok(cached.data)}}
        let client=client()?;let base=format!("https://raw.communitydragon.org/{patch}/plugins/rcp-be-lol-game-data/global/default/v1");
        fn read<T:serde::de::DeserializeOwned>(c:&reqwest::blocking::Client,url:String)->Result<T,String>{
            let r=c.get(url).send().and_then(reqwest::blocking::Response::error_for_status).map_err(|_|"TFT metadata unavailable for the selected patch")?;
            let mut bytes=Vec::new();r.take(MAX_BYTES+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;if bytes.len() as u64>MAX_BYTES{return Err("TFT response exceeds limit".into());}
            serde_json::from_slice(&bytes).map_err(|_|"Unsupported TFT provider schema".into())
        }
        let companions:Vec<CdCompanion>=read(&client,format!("{base}/companions.json"))?;
        let arenas:Vec<CdCosmeticItem>=read(&client,format!("{base}/tftmapskins.json"))?;
        let booms:Vec<CdCosmeticItem>=read(&client,format!("{base}/tftdamageskins.json"))?;
        let mut items:Vec<_>=companions.into_iter().filter(|c|!c.name.trim().is_empty()).map(|c|TftItem{id:c.item_id.to_string(),name:c.name,category:"Tactician".into(),tier:c.level,description:c.description}).collect();
        for (category,rows) in [("Arena",arenas),("Boom",booms)]{items.extend(rows.into_iter().filter(|c|!c.name.trim().is_empty()).map(|c|TftItem{id:c.item_id.to_string(),name:c.name,category:category.into(),tier:None,description:c.description}));}
        storage::write(&path,&Snapshot{version,locale:"default".into(),data:items.clone(),cached:false,bundled:false})?;Ok(items)
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn catalog_random_pick(
    app: AppHandle,
    favorites_only: bool,
    champion_id: Option<String>,
) -> Result<Selection, String> {
    let dir = storage::root(&app)?.join("catalog");
    let prefs_path = storage::root(&app)?.join("catalog-preferences.json");
    let prefs = storage::read::<super::catalog_preferences::Preferences>(&prefs_path, 64 * 1024)?
        .unwrap_or_default();

    let target_champ = if let Some(id) = champion_id {
        if !safe_id(&id) {
            return Err("Invalid champion ID.".into());
        }
        id
    } else {
        let index_path = dir.join("champions-en_US.json");
        let index = storage::read::<Snapshot<Vec<Champion>>>(&index_path, MAX_BYTES)?
            .ok_or("Catalog index not loaded. Browse catalog first.")?;

        let eligible: Vec<String> = if favorites_only {
            let favs: Vec<String> = prefs
                .favorites()
                .iter()
                .filter(|id| index.data.iter().any(|c| &c.id == *id))
                .cloned()
                .collect();
            if favs.is_empty() {
                return Err("No favorite champions saved.".into());
            }
            favs
        } else {
            index.data.into_iter().map(|c| c.id).collect()
        };

        if eligible.is_empty() {
            return Err("No eligible champions in catalog.".into());
        }

        let mut random_bytes = [0u8; 4];
        getrandom::fill(&mut random_bytes).map_err(|e| e.to_string())?;
        let random_idx = (u32::from_be_bytes(random_bytes) as usize) % eligible.len();
        eligible[random_idx].clone()
    };

    // Load detail to pick skin
    let detail_path = dir.join(format!("detail-en_US-{target_champ}.json"));
    let detail = storage::read::<Snapshot<ChampionDetail>>(&detail_path, MAX_BYTES)?
        .ok_or("Champion detail not loaded.")?;

    if detail.data.skins.is_empty() {
        return Err("No skins found for champion.".into());
    }

    let mut random_bytes = [0u8; 4];
    getrandom::fill(&mut random_bytes).map_err(|e| e.to_string())?;
    let skin_idx = (u32::from_be_bytes(random_bytes) as usize) % detail.data.skins.len();
    let picked_skin = &detail.data.skins[skin_idx];

    Ok(Selection {
        champion_id: target_champ,
        skin_id: picked_skin.id.clone(),
    })
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

    #[test]
    fn attach_chromas_and_variants_handles_lux_and_chromas() {
        let mut detail = ChampionDetail {
            champion: Champion {
                id: "Lux".into(),
                key: Some("99".into()),
                name: "Lux".into(),
                title: "the Lady of Luminosity".into(),
                tags: vec!["Mage".into(), "Support".into()],
            },
            lore: "Luxanna Crownguard hails from Demacia.".into(),
            skins: vec![
                Skin {
                    id: "99000".into(),
                    num: 0,
                    name: "default".into(),
                    chromas: false,
                    chroma_list: vec![],
                    variants: vec![],
                },
                Skin {
                    id: "99007".into(),
                    num: 7,
                    name: "Elementalist Lux".into(),
                    chromas: false,
                    chroma_list: vec![],
                    variants: vec![],
                },
                Skin {
                    id: "99008".into(),
                    num: 8,
                    name: "Steel Legion Lux".into(),
                    chromas: true,
                    chroma_list: vec![],
                    variants: vec![],
                },
            ],
            variants: vec![],
        };

        attach_chromas_and_variants(&mut detail);
        // Elementalist Lux should have 10 elemental variants
        assert_eq!(detail.skins[1].variants.len(), 10);
        assert_eq!(detail.skins[1].variants[0].name, "Light");
        // Steel Legion Lux should NOT have fake synthetic chromas generated
        assert!(detail.skins[2].chroma_list.is_empty());
    }
}
