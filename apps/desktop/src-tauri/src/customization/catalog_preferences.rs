use super::storage;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub favorites: Vec<String>,
    pub recent: Vec<Selection>,
}

impl Preferences {
    pub fn favorites(&self) -> &[String] {
        &self.favorites
    }

    #[allow(dead_code)]
    pub fn recent(&self) -> &[Selection] {
        &self.recent
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Selection {
    pub champion_id: String,
    pub skin_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "action", deny_unknown_fields)]
pub enum Change {
    Favorite { id: String, enabled: bool },
    Remember { selection: Selection },
    ClearHistory,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

#[tauri::command]
pub fn catalog_preferences(app: AppHandle, change: Option<Change>) -> Result<Preferences, String> {
    let path = storage::root(&app)?.join("catalog-preferences.json");
    let _guard = LOCK
        .lock()
        .map_err(|_| "Catalog preferences are unavailable.")?;
    let mut state = storage::read::<Preferences>(&path, 64 * 1024)?.unwrap_or_default();
    if let Some(change) = change {
        match change {
            Change::Favorite { id, enabled } => {
                if !valid_id(&id) {
                    return Err("Invalid champion identifier.".into());
                }
                state.favorites.retain(|favorite| favorite != &id);
                if enabled {
                    if state.favorites.len() >= 300 {
                        return Err("The favorite list is full.".into());
                    }
                    state.favorites.push(id);
                }
            }
            Change::Remember { selection } => {
                if !valid_id(&selection.champion_id)
                    || selection.skin_id.is_empty()
                    || selection.skin_id.len() > 16
                    || !selection.skin_id.bytes().all(|byte| byte.is_ascii_digit())
                {
                    return Err("Invalid cosmetic reference.".into());
                }
                state.recent.retain(|previous| {
                    previous.champion_id != selection.champion_id
                        || previous.skin_id != selection.skin_id
                });
                state.recent.insert(0, selection);
                state.recent.truncate(20);
            }
            Change::ClearHistory => state.recent.clear(),
        }
        storage::write(&path, &state)?;
    }
    Ok(state)
}
