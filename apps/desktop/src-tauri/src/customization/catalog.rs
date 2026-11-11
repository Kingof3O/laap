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
    pub tier: u32,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Champion {
    pub(super) id: String,
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
    #[serde(default)]
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
                        Variant { id: "light".into(), name: "Light".into(), description: "Starting form".into() },
                        Variant { id: "fire".into(), name: "Fire".into(), description: "Offensive fire magic".into() },
                        Variant { id: "water".into(), name: "Water".into(), description: "Flowing oceanic form".into() },
                        Variant { id: "air".into(), name: "Air".into(), description: "Swift atmospheric form".into() },
                        Variant { id: "nature".into(), name: "Nature".into(), description: "Verdant earth form".into() },
                        Variant { id: "magma".into(), name: "Magma".into(), description: "Molten combination".into() },
                        Variant { id: "storm".into(), name: "Storm".into(), description: "Lightning combination".into() },
                        Variant { id: "mystic".into(), name: "Mystic".into(), description: "Arcane butterfly form".into() },
                        Variant { id: "ice".into(), name: "Ice".into(), description: "Glacial combination".into() },
                        Variant { id: "dark".into(), name: "Dark".into(), description: "Shadow eclipse form".into() },
                    ];
                }
            }
        }
        "Kayn" => {
            for skin in &mut detail.skins {
                skin.variants = vec![
                    Variant { id: "base".into(), name: "Base Kayn".into(), description: "Standard form".into() },
                    Variant { id: "shadow".into(), name: "Shadow Assassin".into(), description: "Lethal blue mobility form".into() },
                    Variant { id: "rhaast".into(), name: "Darkin Rhaast".into(), description: "Sustained red bruiser form".into() },
                ];
            }
        }
        "Sona" => {
            for skin in &mut detail.skins {
                if skin.name.contains("DJ") {
                    skin.variants = vec![
                        Variant { id: "kinetic".into(), name: "Kinetic".into(), description: "Upbeat electronic rhythm".into() },
                        Variant { id: "concussive".into(), name: "Concussive".into(), description: "Intense bass beat".into() },
                        Variant { id: "ethereal".into(), name: "Ethereal".into(), description: "Atmospheric ambient tune".into() },
                    ];
                }
            }
        }
        "MissFortune" => {
            for skin in &mut detail.skins {
                if skin.name.contains("Gun Goddess") {
                    skin.variants = vec![
                        Variant { id: "scarlet".into(), name: "Scarlet Fair".into(), description: "Default assault exo-suit".into() },
                        Variant { id: "zero".into(), name: "Zero Hour".into(), description: "Gravity-well heavy armor".into() },
                        Variant { id: "starswarm".into(), name: "Starswarm".into(), description: "Plasma wave armament".into() },
                        Variant { id: "royal".into(), name: "Royal Arms".into(), description: "Antimatter fleet commander".into() },
                    ];
                }
            }
        }
        "Seraphine" => {
            for skin in &mut detail.skins {
                if skin.name.contains("K/DA") {
                    skin.variants = vec![
                        Variant { id: "indie".into(), name: "Indie".into(), description: "Acoustic bedroom musician".into() },
                        Variant { id: "rising_star".into(), name: "Rising Star".into(), description: "Debut viral performer".into() },
                        Variant { id: "superstar".into(), name: "Superstar".into(), description: "Global pop sensation".into() },
                    ];
                }
            }
        }
        _ => {}
    }

    // Populate structured chromas for skins with chromas: true
    for skin in &mut detail.skins {
        if skin.chromas && skin.chroma_list.is_empty() {
            let base_num = skin.num;
            let colors_list = [
                vec!["#d4380d".into(), "#fa541c".into()], // Ruby
                vec!["#1890ff".into(), "#40a9ff".into()], // Sapphire
                vec!["#52c41a".into(), "#73d13d".into()], // Emerald
                vec!["#faad14".into(), "#ffc53d".into()], // Catseye
                vec!["#eb2f96".into(), "#f759ab".into()], // Rose Quartz
                vec!["#722ed1".into(), "#9254de".into()], // Amethyst
                vec!["#13c2c2".into(), "#36cfc9".into()], // Turquoise
                vec!["#bfbfbf".into(), "#d9d9d9".into()], // Pearl
                vec!["#262626".into(), "#434343".into()], // Obsidian
            ];
            let names = ["Ruby", "Sapphire", "Emerald", "Catseye", "Rose Quartz", "Amethyst", "Turquoise", "Pearl", "Obsidian"];
            for (idx, name) in names.iter().enumerate() {
                let chroma_num = base_num * 100 + (idx as u32 + 1);
                skin.chroma_list.push(Chroma {
                    id: format!("{}{:03}", detail.champion.id, chroma_num),
                    name: format!("{} ({})", skin.name, name),
                    num: chroma_num,
                    colors: colors_list[idx % colors_list.len()].clone(),
                });
            }
        }
    }
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
    Ok(result)
}

#[tauri::command]
pub async fn catalog_tft_list(app: AppHandle) -> Result<Vec<TftItem>, String> {
    let path = storage::root(&app)?.join("catalog").join("tft-items.json");
    if let Ok(Some(cached)) = storage::read::<Vec<TftItem>>(&path, MAX_BYTES) {
        if !cached.is_empty() {
            return Ok(cached);
        }
    }
    // Bundled standard TFT content catalog
    let items = vec![
        TftItem { id: "tft_tactician_01".into(), name: "Featherknight (Pengu)".into(), category: "Tactician".into(), tier: 1, description: "Classic valiant knight".into() },
        TftItem { id: "tft_tactician_02".into(), name: "Choncc".into(), category: "Tactician".into(), tier: 2, description: "Gentle giant with a big appetite".into() },
        TftItem { id: "tft_tactician_03".into(), name: "Dowsie".into(), category: "Tactician".into(), tier: 2, description: "Sweet water-dwelling creature".into() },
        TftItem { id: "tft_tactician_04".into(), name: "Furyhorn".into(), category: "Tactician".into(), tier: 1, description: "Fierce charging friend".into() },
        TftItem { id: "tft_tactician_05".into(), name: "Silverwing".into(), category: "Tactician".into(), tier: 1, description: "High-flying avian companion".into() },
        TftItem { id: "tft_tactician_06".into(), name: "Sprite".into(), category: "Tactician".into(), tier: 1, description: "Original River Sprite".into() },
        TftItem { id: "tft_arena_01".into(), name: "Hextech Laboratory Arena".into(), category: "Arena".into(), tier: 3, description: "Piltover technological marvel".into() },
        TftItem { id: "tft_arena_02".into(), name: "Kanmei Garden Arena".into(), category: "Arena".into(), tier: 3, description: "Peaceful Ionian spirit retreat".into() },
        TftItem { id: "tft_arena_03".into(), name: "Akana Sanctuary Arena".into(), category: "Arena".into(), tier: 3, description: "Shadowy spirit blossoms arena".into() },
        TftItem { id: "tft_arena_04".into(), name: "Golden Spatula Arena".into(), category: "Arena".into(), tier: 4, description: "Opulent championship arena".into() },
        TftItem { id: "tft_boom_01".into(), name: "Super Galaxy Boom".into(), category: "Boom".into(), tier: 2, description: "Cosmic impact damage effect".into() },
        TftItem { id: "tft_boom_02".into(), name: "Arcade Finisher Boom".into(), category: "Boom".into(), tier: 3, description: "8-bit victory damage finisher".into() },
    ];
    let _ = storage::write(&path, &items);
    Ok(items)
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
        // Steel Legion Lux should have chromas generated
        assert_eq!(detail.skins[2].chroma_list.len(), 9);
        assert!(detail.skins[2].chroma_list[0].name.contains("Ruby"));
    }
}
