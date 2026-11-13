//! Helpers for exposing the full in-game skin catalog and applying a selected skin.
//!
//! Catalog data comes from cached DDragon snapshots (no user-supplied files).
//! Rendering in-game for unowned/custom skins requires the managed patcher backend;
//! selection is still recorded and best-effort LCU selection is attempted.

use super::{catalog, storage};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;

const MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinOption {
    pub id: String,
    pub num: u32,
    pub name: String,
    pub chromas: bool,
    pub is_base: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSkins {
    pub champion_id: String,
    pub champion_name: String,
    pub champion_key: Option<String>,
    pub skins: Vec<SkinOption>,
}

/// Read a cached champion detail snapshot by champion string id (e.g. "Ahri").
/// Tries en_US detail cache first, then falls back to any locale detail cache.
pub fn read_cached_champion_detail_at(
    root: &Path,
    champion_id: &str,
) -> Option<catalog::Snapshot<catalog::ChampionDetail>> {
    if champion_id.is_empty() {
        return None;
    }
    let dir = root.join("catalog");
    // Prefer en_US
    let preferred = dir.join(format!("detail-en_US-{champion_id}.json"));
    if let Ok(Some(snap)) = storage::read::<catalog::Snapshot<catalog::ChampionDetail>>(&preferred, MAX_BYTES) {
        return Some(snap);
    }
    // Any locale
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("detail-") && name.ends_with(&format!("-{champion_id}.json")) {
                if let Ok(Some(snap)) = storage::read::<catalog::Snapshot<catalog::ChampionDetail>>(&entry.path(), MAX_BYTES) {
                    return Some(snap);
                }
            }
        }
    }
    None
}

/// Find `(id, name, key)` for a numeric champion ID using cached champions index.
pub fn champion_display_from_numeric_at(
    root: &Path,
    numeric_id: u32,
) -> Option<(String, String, String)> {
    let needle = numeric_id.to_string();
    let dir = root.join("catalog");
    let preferred = dir.join("champions-en_US.json");
    if let Ok(Some(snap)) = storage::read::<catalog::Snapshot<Vec<catalog::Champion>>>(&preferred, MAX_BYTES) {
        if let Some(c) = snap
            .data
            .into_iter()
            .find(|c| c.key.as_deref() == Some(needle.as_str()))
        {
            return Some((c.id, c.name, c.key.unwrap_or_else(|| needle.clone())));
        }
    }
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name();
            let fname = fname.to_string_lossy();
            if fname.starts_with("champions-") && fname.ends_with(".json") {
                if let Ok(Some(snap)) =
                    storage::read::<catalog::Snapshot<Vec<catalog::Champion>>>(&entry.path(), MAX_BYTES)
                {
                    if let Some(c) = snap
                        .data
                        .into_iter()
                        .find(|c| c.key.as_deref() == Some(needle.as_str()))
                    {
                        return Some((c.id, c.name, c.key.unwrap_or_else(|| needle.clone())));
                    }
                }
            }
        }
    }
    None
}

/// Find champion string id by numeric key using cached champions index.
pub fn champion_id_from_numeric_at(root: &Path, numeric_id: u32) -> Option<String> {
    champion_display_from_numeric_at(root, numeric_id).map(|(id, _, _)| id)
}

pub fn list_cached_skins_for_champion_at(root: &Path, champion_id: &str) -> Option<ChampionSkins> {
    let snap = read_cached_champion_detail_at(root, champion_id)?;
    let detail = snap.data;
    let skins = detail
        .skins
        .into_iter()
        .map(|s| SkinOption {
            is_base: s.num == 0,
            id: s.id,
            num: s.num,
            name: s.name,
            chromas: s.chromas || !s.chroma_list.is_empty(),
        })
        .collect();
    Some(ChampionSkins {
        champion_id: detail.champion.id,
        champion_name: detail.champion.name,
        champion_key: detail.champion.key,
        skins,
    })
}

pub fn list_cached_skins_for_numeric_champion_at(
    root: &Path,
    numeric_id: u32,
) -> Option<ChampionSkins> {
    let champ_id = champion_id_from_numeric_at(root, numeric_id)?;
    list_cached_skins_for_champion_at(root, &champ_id)
}

/// Best-effort: tell LCU Champ Select to use a specific skinId for the local player.
/// This may be rejected by the client for unowned skins on some patches; it never
/// guarantees in-game rendering without a patched mod overlay.
pub fn try_select_skin_in_champ_select(skin_id: u32) -> Result<(), String> {
    let conn = crate::lcu_read::connection()?
        .ok_or_else(|| "League client is not connected".to_string())?;
    conn.patch(
        "/lol-champ-select/v1/session/my-selection",
        &serde_json::json!({ "selectedSkinId": skin_id }),
    )?;
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct SkinSelectionStore {
    selections: std::collections::BTreeMap<String, SkinSelection>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SkinSelection {
    pub champion_id: u32,
    pub skin_id: u32,
    pub champion_name: Option<String>,
    pub updated_at: u64,
}

/// Persist the user's desired skin for a champion (used by auto-apply/picker).
pub fn save_skin_selection_at(
    root: &Path,
    champion_id: u32,
    skin_id: u32,
    champion_name: Option<&str>,
) -> Result<(), String> {
    let path = root.join("skin_selections.json");
    let mut store: SkinSelectionStore = storage::read(&path, 256 * 1024)?.unwrap_or_default();
    store.selections.insert(
        champion_id.to_string(),
        SkinSelection {
            champion_id,
            skin_id,
            champion_name: champion_name.map(str::to_string),
            updated_at: super::game_adapter::now_unix(),
        },
    );
    storage::write(&path, &store)
}

pub fn read_skin_selection_at(root: &Path, champion_id: u32) -> Option<SkinSelection> {
    let path = root.join("skin_selections.json");
    let store: SkinSelectionStore = storage::read(&path, 256 * 1024).ok().flatten().unwrap_or_default();
    store.selections.get(&champion_id.to_string()).cloned()
}

/// Remove any saved official skin override for `champion_id` (e.g. when selecting a custom mod).
pub fn clear_skin_selection_at(root: &Path, champion_id: u32) -> Result<(), String> {
    let path = root.join("skin_selections.json");
    let mut store: SkinSelectionStore = storage::read(&path, 256 * 1024)?.unwrap_or_default();
    if store.selections.remove(&champion_id.to_string()).is_some() {
        storage::write(&path, &store)?;
    }
    Ok(())
}

/// Resolve `(champ_internal_id, champ_display_name, champ_key, skin_num, skin_name)`
/// from cached DDragon catalog or fallback heuristics (`skin_id % 1000`).
pub fn resolve_skin_meta_at(
    root: &Path,
    champion_id: u32,
    skin_id: u32,
    champion_name_hint: Option<&str>,
) -> (String, String, Option<String>, u32, Option<String>) {
    if let Some(info) = list_cached_skins_for_numeric_champion_at(root, champion_id) {
        let key_u32 = info
            .champion_key
            .as_deref()
            .and_then(|k| k.parse::<u32>().ok())
            .unwrap_or(champion_id);
        let matched = info.skins.into_iter().find(|s| {
            s.id.parse::<u32>().ok() == Some(skin_id)
                || (key_u32 > 0 && key_u32 * 1000 + s.num == skin_id)
        });
        if let Some(s) = matched {
            return (
                info.champion_id,
                info.champion_name,
                info.champion_key,
                s.num,
                Some(s.name),
            );
        }
        return (
            info.champion_id,
            info.champion_name,
            info.champion_key,
            skin_id % 1000,
            None,
        );
    }

    if let Some((cid, cname, ckey)) = champion_display_from_numeric_at(root, champion_id) {
        return (cid, cname, Some(ckey), skin_id % 1000, None);
    }

    let fallback_name = champion_name_hint
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "Unknown Champion")
        .map(str::to_string)
        .unwrap_or_else(|| format!("Champion{champion_id}"));
    (
        fallback_name.replace(' ', ""),
        fallback_name,
        (champion_id > 0).then(|| champion_id.to_string()),
        skin_id % 1000,
        None,
    )
}

pub(crate) async fn ensure_champion_detail_cached(
    app: &AppHandle,
    numeric_champion_id: u32,
) -> Option<String> {
    let root = storage::root(app).ok()?;
    if let Some(id) = champion_id_from_numeric_at(&root, numeric_champion_id) {
        if read_cached_champion_detail_at(&root, &id).is_some() {
            return Some(id);
        }
    }

    // Best-effort: ensure champions index, then fetch detail for this champion.
    let index = catalog::catalog_list(app.clone(), "en_US".into(), false).await.ok()?;
    let champ = index
        .data
        .iter()
        .find(|c| c.key.as_deref() == Some(numeric_champion_id.to_string().as_str()))?;
    let champ_id = champ.id.clone();
    let _ = catalog::catalog_champion(
        app.clone(),
        champ_id.clone(),
        index.version,
        index.locale,
    )
    .await;
    Some(champ_id)
}

#[tauri::command]
pub async fn skin_catalog_for_champion(
    app: AppHandle,
    champion_id: String,
) -> Result<Option<ChampionSkins>, String> {
    let root = storage::root(&app)?;
    if read_cached_champion_detail_at(&root, &champion_id).is_none() {
        if let Ok(index) = catalog::catalog_list(app.clone(), "en_US".into(), false).await {
            let _ = catalog::catalog_champion(
                app.clone(),
                champion_id.clone(),
                index.version,
                index.locale,
            )
            .await;
        }
    }
    Ok(list_cached_skins_for_champion_at(&root, &champion_id))
}

#[tauri::command]
pub async fn skin_catalog_for_numeric_champion(
    app: AppHandle,
    numeric_champion_id: u32,
) -> Result<Option<ChampionSkins>, String> {
    let _ = ensure_champion_detail_cached(&app, numeric_champion_id).await;
    let root = storage::root(&app)?;
    Ok(list_cached_skins_for_numeric_champion_at(&root, numeric_champion_id))
}

/// Select a skin: ensure DDragon cache, generate official skin overlay from local
/// game WAD if needed, persist selection, attempt best-effort LCU selection, and
/// apply immediately through the managed patcher backend (unless match active).
#[tauri::command]
pub async fn skin_select(
    app: AppHandle,
    champion_id: u32,
    skin_id: u32,
    champion_name: Option<String>,
) -> Result<serde_json::Value, String> {
    if champion_id > 0 {
        let _ = ensure_champion_detail_cached(&app, champion_id).await;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage::root(&app)?;
        super::in_game_runner::apply_selected_skin_at(
            &root,
            champion_id,
            skin_id,
            champion_name.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Skin select task failed: {e}"))?
}
