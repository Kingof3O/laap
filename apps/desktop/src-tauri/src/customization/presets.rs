use super::storage;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::AppHandle;

const MAX_BYTES: u64 = 1024 * 1024;
const LIMIT: usize = 500;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preset {
    id: Option<String>,
    name: String,
    champion_id: String,
    skin_id: String,
    account_id: Option<String>,
    #[serde(default)]
    queue_mode: Option<String>,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    priority: i16,
    #[serde(default)]
    revision: u32,
}

#[derive(Deserialize, Serialize)]
struct Store {
    version: u32,
    presets: Vec<Preset>,
}

fn read(path: &Path) -> Result<Store, String> {
    let state = storage::read::<Store>(path, MAX_BYTES)?.unwrap_or(Store {
        version: 1,
        presets: vec![],
    });
    if state.version != 1 {
        return Err("Unsupported preset store version.".into());
    }
    Ok(state)
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join("presets.json"))
}

fn validate(preset: &mut Preset) -> Result<(), String> {
    preset.name = preset.name.trim().into();
    if preset.name.is_empty()
        || preset.name.chars().count() > 80
        || preset.name.chars().any(char::is_control)
    {
        return Err("Use a preset name of 1 to 80 characters.".into());
    }
    if preset.champion_id.is_empty()
        || preset.champion_id.len() > 64
        || !preset
            .champion_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric())
        || preset.skin_id.is_empty()
        || preset.skin_id.len() > 16
        || !preset.skin_id.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("Select a valid champion and skin.".into());
    }
    if preset.notes.chars().count() > 2000
        || !(-100..=100).contains(&preset.priority)
        || preset.queue_mode.as_ref().is_some_and(|mode| {
            !["classic", "quickplay", "swiftplay", "aram", "arena", "tft"].contains(&mode.as_str())
        })
    {
        return Err("Invalid preset notes, priority, or queue preference.".into());
    }
    #[cfg(feature = "studio")]
    if preset.account_id.is_some() {
        return Err("Local account binding is available only in Complete.".into());
    }
    #[cfg(not(feature = "studio"))]
    if let Some(id) = &preset.account_id {
        if !crate::local_store::LocalStore::new()?
            .list_summaries()?
            .iter()
            .any(|row| &row.id == id)
        {
            return Err("This local profile no longer exists.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn customization_preset_list(app: AppHandle) -> Result<Vec<Preset>, String> {
    let path = path(&app)?;
    tauri::async_runtime::spawn_blocking(move || Ok(read(&path)?.presets))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn customization_preset_save(app: AppHandle, mut preset: Preset) -> Result<Preset, String> {
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    validate(&mut preset)?;
    let mut store = read(&path)?;
    if let Some(id) = &preset.id {
        let slot = store
            .presets
            .iter_mut()
            .find(|p| p.id.as_ref() == Some(id))
            .ok_or("Preset no longer exists.")?;
        if slot.revision != preset.revision {
            return Err("This preset changed in another window. Reload it before saving.".into());
        }
        preset.revision = preset
            .revision
            .checked_add(1)
            .ok_or("Preset revision limit reached.")?;
        *slot = preset.clone();
    } else {
        if store.presets.len() >= LIMIT {
            return Err("The preset library is full.".into());
        }
        let mut random = [0; 16];
        getrandom::fill(&mut random).map_err(|e| e.to_string())?;
        preset.id = Some(format!("{:032x}", u128::from_be_bytes(random)));
        preset.revision = 1;
        store.presets.push(preset.clone());
    }
    write_store(&path, &store)?;
    Ok(preset)
}

#[tauri::command]
pub fn customization_preset_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    let mut store = read(&path)?;
    store.presets.retain(|p| p.id.as_ref() != Some(&id));
    write_store(&path, &store)
}

fn write_store(path: &Path, store: &Store) -> Result<(), String> {
    let data = serde_json::to_vec(store).map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BYTES {
        return Err("The preset library exceeds its storage quota.".into());
    }
    storage::write_bytes(path, &data)
}

#[derive(Serialize)]
pub struct ImportSummary {
    count: usize,
    names: Vec<String>,
}

#[tauri::command]
pub fn customization_preset_export(app: AppHandle) -> Result<String, String> {
    let mut store = read(&path(&app)?)?;
    // Account IDs are local to this installation and never belong in portable preset files.
    for preset in &mut store.presets {
        preset.account_id = None;
    }
    serde_json::to_string_pretty(&store).map_err(|e| e.to_string())
}

fn parse_import(json: &str) -> Result<Store, String> {
    if json.len() as u64 > MAX_BYTES {
        return Err("Preset import exceeds one MiB.".into());
    }
    let mut store: Store =
        serde_json::from_str(json).map_err(|e| format!("Invalid preset file: {e}"))?;
    if store.version != 1 || store.presets.is_empty() || store.presets.len() > LIMIT {
        return Err("Unsupported or empty preset import.".into());
    }
    for preset in &mut store.presets {
        preset.id = None;
        preset.account_id = None;
        preset.revision = 1;
        validate(preset)?;
    }
    Ok(store)
}

#[tauri::command]
pub fn customization_preset_import(
    app: AppHandle,
    json: String,
    commit: bool,
) -> Result<ImportSummary, String> {
    let mut imported = parse_import(&json)?;
    let result = ImportSummary {
        count: imported.presets.len(),
        names: imported
            .presets
            .iter()
            .map(|preset| preset.name.clone())
            .collect(),
    };
    if !commit {
        return Ok(result);
    }
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    let mut store = read(&path)?;
    if store.presets.len() + imported.presets.len() > LIMIT {
        return Err("Import would exceed the 500-preset library limit.".into());
    }
    for preset in &mut imported.presets {
        let mut random = [0; 16];
        getrandom::fill(&mut random).map_err(|e| e.to_string())?;
        preset.id = Some(format!("{:032x}", u128::from_be_bytes(random)));
    }
    store.presets.extend(imported.presets);
    write_store(&path, &store)?;
    Ok(result)
}

#[tauri::command]
pub fn customization_preset_resolve(
    app: AppHandle,
    account_id: Option<String>,
    champion_id: Option<String>,
    queue_mode: Option<String>,
) -> Result<Vec<Preset>, String> {
    #[cfg(feature = "studio")]
    if account_id.is_some() {
        return Err("Studio does not support local profile scopes.".into());
    }
    let mut rows = read(&path(&app)?)?.presets;
    rows.retain(|preset| {
        (preset.account_id.is_none() || preset.account_id == account_id)
            && champion_id
                .as_ref()
                .is_none_or(|champion| &preset.champion_id == champion)
            && (preset.queue_mode.is_none() || preset.queue_mode == queue_mode)
    });
    rows.sort_by(|a, b| {
        b.account_id
            .is_some()
            .cmp(&a.account_id.is_some())
            .then_with(|| b.queue_mode.is_some().cmp(&a.queue_mode.is_some()))
            .then_with(|| b.priority.cmp(&a.priority))
            .then_with(|| b.favorite.cmp(&a.favorite))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_import_preserves_old_presets_and_clears_local_links() {
        let old = r#"{"version":1,"presets":[{"id":"old","name":"My preset","championId":"Ahri","skinId":"103000","accountId":"old-machine"}]}"#;
        let result = parse_import(old).unwrap();
        assert!(result.presets[0].id.is_none());
        assert!(result.presets[0].account_id.is_none());
        assert_eq!(result.presets[0].revision, 1);
        assert!(result.presets[0].queue_mode.is_none());
    }

    #[test]
    fn invalid_preset_in_import_rejects_the_whole_transaction() {
        let invalid = r#"{"version":1,"presets":[{"id":null,"name":"Bad","championId":"../Ahri","skinId":"103000","accountId":null}]}"#;
        assert!(parse_import(invalid).is_err());
    }
}
