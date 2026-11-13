use super::storage;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::AppHandle;

const MAX_BYTES: u64 = 1024 * 1024;
const LIMIT: usize = 500;
const TRASH_LIMIT: usize = 20;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preset {
    pub id: Option<String>,
    pub name: String,
    pub champion_id: String,
    pub skin_id: String,
    #[serde(default)]
    pub chroma_id: Option<String>,
    #[serde(default)]
    pub variant_id: Option<String>,
    /// Optional Mod Library package hash this preset maps to for direct application.
    #[serde(default)]
    pub mod_sha256: Option<String>,
    pub account_id: Option<String>,
    #[serde(default)]
    pub queue_mode: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub priority: i16,
    #[serde(default)]
    pub revision: u32,
}

#[derive(Deserialize, Serialize)]
struct Store {
    version: u32,
    presets: Vec<Preset>,
    #[serde(default)]
    trash: Vec<Preset>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PresetConflict {
    pub champion_id: String,
    pub account_id: Option<String>,
    pub queue_mode: Option<String>,
    pub preset_names: Vec<String>,
    pub skin_ids: Vec<String>,
}

fn read(path: &Path) -> Result<Store, String> {
    let state = storage::read::<Store>(path, MAX_BYTES)?.unwrap_or(Store {
        version: 1,
        presets: vec![],
        trash: vec![],
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
    if let Some(chroma) = &preset.chroma_id {
        if chroma.is_empty() || chroma.len() > 16 || !chroma.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Invalid chroma identifier.".into());
        }
    }
    if let Some(variant) = &preset.variant_id {
        if variant.is_empty()
            || variant.len() > 64
            || !variant
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err("Invalid variant identifier.".into());
        }
    }
    if let Some(hash) = &preset.mod_sha256 {
        let normalized = hash.trim().to_ascii_lowercase();
        if normalized.len() != 64 || !normalized.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Invalid mod package SHA-256.".into());
        }
        preset.mod_sha256 = Some(normalized);
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

fn generate_id() -> Result<String, String> {
    let mut random = [0; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    Ok(format!("{:032x}", u128::from_be_bytes(random)))
}

fn unlink_orphaned_accounts(store: &mut Store, ids: &[String]) -> bool {
    let mut changed = false;
    for preset in &mut store.presets {
        if preset
            .account_id
            .as_ref()
            .is_some_and(|id| !ids.contains(id))
        {
            preset.account_id = None;
            preset.revision = preset.revision.saturating_add(1);
            changed = true;
        }
    }
    changed
}
#[tauri::command]
pub async fn customization_preset_list(app: AppHandle) -> Result<Vec<Preset>, String> {
    let path = path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "Preset store unavailable")?;
        #[allow(unused_mut)] // Studio never opens the local account vault.
        let mut store = read(&path)?;
        #[cfg(not(feature = "studio"))]
        {
            let ids = crate::local_store::LocalStore::new()?
                .list_summaries()?
                .into_iter()
                .map(|a| a.id)
                .collect::<Vec<_>>();
            if unlink_orphaned_accounts(&mut store, &ids) {
                write_store(&path, &store)?;
            }
        }
        Ok(store.presets)
    })
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
        preset.id = Some(generate_id()?);
        preset.revision = 1;
        store.presets.push(preset.clone());
    }
    write_store(&path, &store)?;
    Ok(preset)
}

#[tauri::command]
pub fn customization_preset_duplicate(app: AppHandle, id: String) -> Result<Preset, String> {
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    let mut store = read(&path)?;
    if store.presets.len() >= LIMIT {
        return Err("The preset library is full.".into());
    }
    let original = store
        .presets
        .iter()
        .find(|p| p.id.as_ref() == Some(&id))
        .ok_or("Preset no longer exists.")?
        .clone();

    let mut copy = original;
    copy.id = Some(generate_id()?);
    let mut name = format!("{} (Copy)", copy.name);
    if name.chars().count() > 80 {
        name = name.chars().take(80).collect();
    }
    copy.name = name;
    copy.revision = 1;
    store.presets.push(copy.clone());
    write_store(&path, &store)?;
    Ok(copy)
}

#[tauri::command]
pub fn customization_preset_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    let mut store = read(&path)?;
    if let Some(pos) = store
        .presets
        .iter()
        .position(|p| p.id.as_ref() == Some(&id))
    {
        let removed = store.presets.remove(pos);
        if store.trash.len() >= TRASH_LIMIT {
            store.trash.remove(0);
        }
        store.trash.push(removed);
        write_store(&path, &store)?;
    }
    Ok(())
}

#[tauri::command]
pub fn customization_preset_restore(app: AppHandle) -> Result<Preset, String> {
    let path = path(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Preset store is unavailable.")?;
    let mut store = read(&path)?;
    let mut restored = store.trash.pop().ok_or("No deleted presets to restore.")?;
    if store.presets.len() >= LIMIT {
        return Err("The preset library is full.".into());
    }
    // Ensure the restored preset has a unique ID
    let current_ids: Vec<String> = store.presets.iter().filter_map(|p| p.id.clone()).collect();
    if restored
        .id
        .as_ref()
        .map_or(true, |id| current_ids.contains(id))
    {
        restored.id = Some(generate_id()?);
    }
    store.presets.push(restored.clone());
    write_store(&path, &store)?;
    Ok(restored)
}

#[tauri::command]
pub fn customization_preset_conflicts(app: AppHandle) -> Result<Vec<PresetConflict>, String> {
    let path = path(&app)?;
    let store = read(&path)?;
    let mut groups: BTreeMap<(String, Option<String>, Option<String>), Vec<&Preset>> =
        BTreeMap::new();
    for preset in &store.presets {
        let key = (
            preset.champion_id.clone(),
            preset.account_id.clone(),
            preset.queue_mode.clone(),
        );
        groups.entry(key).or_default().push(preset);
    }

    let mut conflicts = Vec::new();
    for ((champion_id, account_id, queue_mode), presets) in groups {
        if presets.len() > 1 {
            let unique_skins: std::collections::BTreeSet<&str> =
                presets.iter().map(|p| p.skin_id.as_str()).collect();
            if unique_skins.len() > 1 {
                conflicts.push(PresetConflict {
                    champion_id,
                    account_id,
                    queue_mode,
                    preset_names: presets.iter().map(|p| p.name.clone()).collect(),
                    skin_ids: presets.iter().map(|p| p.skin_id.clone()).collect(),
                });
            }
        }
    }
    Ok(conflicts)
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
        preset.id = Some(generate_id()?);
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

    #[test]
    fn preset_validation_checks_bounds_and_mode() {
        let mut valid = Preset {
            id: None,
            name: "ARAM Build".into(),
            champion_id: "Lux".into(),
            skin_id: "99001".into(),
            chroma_id: Some("99002".into()),
            variant_id: Some("form_light".into()),
            mod_sha256: None,
            account_id: None,
            queue_mode: Some("aram".into()),
            notes: "Test notes".into(),
            favorite: true,
            priority: 10,
            revision: 0,
        };
        assert!(validate(&mut valid).is_ok());

        let mut invalid_queue = valid.clone();
        invalid_queue.queue_mode = Some("unknown_queue".into());
        assert!(validate(&mut invalid_queue).is_err());

        let mut invalid_priority = valid.clone();
        invalid_priority.priority = 101;
        assert!(validate(&mut invalid_priority).is_err());

        let mut invalid_champ = valid.clone();
        invalid_champ.champion_id = "../../malicious".into();
        assert!(validate(&mut invalid_champ).is_err());

        let mut invalid_skin = valid.clone();
        invalid_skin.skin_id = "abc".into();
        assert!(validate(&mut invalid_skin).is_err());

        let mut invalid_chroma = valid.clone();
        invalid_chroma.chroma_id = Some("non-digit".into());
        assert!(validate(&mut invalid_chroma).is_err());

        let mut mapped = valid.clone();
        mapped.mod_sha256 = Some("A".repeat(64));
        assert!(validate(&mut mapped).is_ok());
        assert_eq!(mapped.mod_sha256, Some("a".repeat(64)));

        let mut invalid_hash = valid.clone();
        invalid_hash.mod_sha256 = Some("not-a-hash".into());
        assert!(validate(&mut invalid_hash).is_err());
    }

    #[test]
    fn resolution_sorting_orders_by_account_queue_priority_and_favorite() {
        let p1 = Preset {
            id: Some("p1".into()),
            name: "Generic".into(),
            champion_id: "Ahri".into(),
            skin_id: "103000".into(),
            chroma_id: None,
            variant_id: None,
            mod_sha256: None,
            account_id: None,
            queue_mode: None,
            notes: String::new(),
            favorite: false,
            priority: 0,
            revision: 1,
        };
        let mut p2 = p1.clone();
        p2.id = Some("p2".into());
        p2.name = "ARAM High Priority".into();
        p2.queue_mode = Some("aram".into());
        p2.priority = 50;

        let mut p3 = p1.clone();
        p3.id = Some("p3".into());
        p3.name = "Account Bound".into();
        p3.account_id = Some("acc-123".into());
        p3.priority = 10;

        let mut rows = vec![p1, p2, p3];
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

        // Account-bound preset comes first
        assert_eq!(rows[0].id.as_deref(), Some("p3"));
        // Queue-mode specific comes next
        assert_eq!(rows[1].id.as_deref(), Some("p2"));
        // Generic comes last
        assert_eq!(rows[2].id.as_deref(), Some("p1"));
    }

    #[test]
    fn preset_conflict_detection_identifies_competing_skins() {
        let p1 = Preset {
            id: Some("p1".into()),
            name: "Ahri Classic".into(),
            champion_id: "Ahri".into(),
            skin_id: "103000".into(),
            chroma_id: None,
            variant_id: None,
            mod_sha256: None,
            account_id: Some("acc-1".into()),
            queue_mode: Some("classic".into()),
            notes: String::new(),
            favorite: false,
            priority: 0,
            revision: 1,
        };
        let mut p2 = p1.clone();
        p2.id = Some("p2".into());
        p2.name = "Ahri Dynasty".into();
        p2.skin_id = "103001".into();

        let store = Store {
            version: 1,
            presets: vec![p1, p2],
            trash: vec![],
        };

        let mut groups: BTreeMap<(String, Option<String>, Option<String>), Vec<&Preset>> =
            BTreeMap::new();
        for preset in &store.presets {
            let key = (
                preset.champion_id.clone(),
                preset.account_id.clone(),
                preset.queue_mode.clone(),
            );
            groups.entry(key).or_default().push(preset);
        }

        let mut conflicts = Vec::new();
        for ((champion_id, account_id, queue_mode), presets) in groups {
            if presets.len() > 1 {
                let unique_skins: std::collections::BTreeSet<&str> =
                    presets.iter().map(|p| p.skin_id.as_str()).collect();
                if unique_skins.len() > 1 {
                    conflicts.push(PresetConflict {
                        champion_id,
                        account_id,
                        queue_mode,
                        preset_names: presets.iter().map(|p| p.name.clone()).collect(),
                        skin_ids: presets.iter().map(|p| p.skin_id.clone()).collect(),
                    });
                }
            }
        }
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].champion_id, "Ahri");
        assert_eq!(conflicts[0].preset_names.len(), 2);
    }
    #[test]
    fn three_account_links_survive_rename_and_unlink_only_deleted_profile() {
        let make = |id: &str| Preset {
            id: Some(format!("preset-{id}")),
            name: format!("Preset {id}"),
            champion_id: "Ahri".into(),
            skin_id: "103000".into(),
            chroma_id: None,
            variant_id: None,
            mod_sha256: None,
            account_id: Some(id.into()),
            queue_mode: Some("classic".into()),
            notes: String::new(),
            favorite: false,
            priority: 0,
            revision: 1,
        };
        let mut store = Store {
            version: 1,
            presets: vec![make("a"), make("b"), make("c")],
            trash: vec![],
        };
        assert!(!unlink_orphaned_accounts(
            &mut store,
            &["a".into(), "b".into(), "c".into()]
        ));
        assert!(unlink_orphaned_accounts(
            &mut store,
            &["a".into(), "c".into()]
        ));
        assert_eq!(store.presets[0].account_id.as_deref(), Some("a"));
        assert_eq!(store.presets[1].account_id, None);
        assert_eq!(store.presets[1].revision, 2);
        assert_eq!(store.presets[2].account_id.as_deref(), Some("c"));
        assert_eq!(store.presets.len(), 3);
    }
}
