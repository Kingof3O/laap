//! Read-only League client gameflow and Champ Select reference monitor.
//! When explicitly consented by the user, monitors League client gameflow (LCU) via
//! local loopback, detects the currently picked champion in Champion Select, and looks
//! up matching local presets or Mod Library packages purely as a read-only reference.
//!
//! Monitors League client gameflow/Champ Select via local loopback and can coordinate
//! user-configured external custom-mod adapters. Use at your own risk.

use super::storage;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::AppHandle;

pub(crate) const CONFIG_FILE: &str = "in_game_runner_config.json";
const MAX_LOG_EVENTS: usize = 50;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunnerPhase {
    Idle,
    Monitoring,
    ChampSelect,
    InMatch,
    Error,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerEvent {
    pub timestamp: String,
    pub event_type: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedLoadout {
    pub champion_id: u32,
    pub champion_name: String,
    pub skin_or_mod_name: String,
    pub source: String, // "ModLibrary", "Preset", "SkinSelection", "OfficialDefault", or "Default"
    pub mod_hash: Option<String>,
    pub file_count: usize,
    pub applied_in_game: bool,
    pub limitation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InGameRunnerConfig {
    pub monitor_enabled: bool,
    pub poll_interval_ms: u64,
    #[serde(default)]
    pub auto_apply_mods: bool,
}

impl Default for InGameRunnerConfig {
    fn default() -> Self {
        Self {
            monitor_enabled: false,
            poll_interval_ms: 2000,
            auto_apply_mods: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InGameRunnerStatus {
    pub enabled: bool,
    pub phase: RunnerPhase,
    pub client_connected: bool,
    pub gameflow_phase: Option<String>,
    pub detected_champion_id: Option<u32>,
    pub detected_champion_name: Option<String>,
    pub resolved_loadout: Option<ResolvedLoadout>,
    pub adapter_available: bool,
    pub adapter_status: String,
    pub adapter_state: super::game_adapter::AdapterLifecycleState,
    pub adapter_version: Option<String>,
    pub detected_game_build: Option<String>,
    pub match_apply_status: String,
    pub active_applied_mod_hash: Option<String>,
    pub auto_apply_mods: bool,
    pub consent_granted: bool,
    pub game_mode: Option<String>,
    pub warm_stage_status: String,
    pub recent_events: Vec<RunnerEvent>,
    pub error_message: Option<String>,
}

struct RunnerState {
    phase: RunnerPhase,
    client_connected: bool,
    gameflow_phase: Option<String>,
    game_mode: Option<String>,
    detected_champion_id: Option<u32>,
    detected_champion_name: Option<String>,
    resolved_loadout: Option<ResolvedLoadout>,
    recent_events: Vec<RunnerEvent>,
    error_message: Option<String>,
}

impl RunnerState {
    fn new() -> Self {
        Self {
            phase: RunnerPhase::Idle,
            client_connected: false,
            gameflow_phase: None,
            game_mode: None,
            detected_champion_id: None,
            detected_champion_name: None,
            resolved_loadout: None,
            recent_events: Vec::new(),
            error_message: None,
        }
    }

    fn reset_live_observation(&mut self) {
        self.client_connected = false;
        self.gameflow_phase = None;
        self.game_mode = None;
        self.detected_champion_id = None;
        self.detected_champion_name = None;
        self.resolved_loadout = None;
    }

    fn clear_champion_selection(&mut self) {
        self.detected_champion_id = None;
        self.detected_champion_name = None;
        self.resolved_loadout = None;
    }

    fn add_event(&mut self, event_type: &str, message: &str) {
        let event = RunnerEvent {
            timestamp: Utc::now().to_rfc3339(),
            event_type: event_type.to_string(),
            message: message.to_string(),
        };
        self.recent_events.insert(0, event);
        if self.recent_events.len() > MAX_LOG_EVENTS {
            self.recent_events.truncate(MAX_LOG_EVENTS);
        }
    }
}

static STATE: Mutex<Option<Arc<Mutex<RunnerState>>>> = Mutex::new(None);
static RUNNING_FLAG: AtomicBool = AtomicBool::new(false);
static POLL_GENERATION: AtomicU64 = AtomicU64::new(0);

fn get_state() -> Arc<Mutex<RunnerState>> {
    let mut guard = STATE.lock().unwrap();
    if let Some(state) = &*guard {
        state.clone()
    } else {
        let state = Arc::new(Mutex::new(RunnerState::new()));
        *guard = Some(state.clone());
        state
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(storage::root(app)?.join(CONFIG_FILE))
}

pub fn champion_name_from_id(id: u32) -> &'static str {
    match id {
        1 => "Annie",
        2 => "Olaf",
        3 => "Galio",
        4 => "Twisted Fate",
        5 => "Xin Zhao",
        6 => "Urgot",
        7 => "LeBlanc",
        8 => "Vladimir",
        9 => "Fiddlesticks",
        10 => "Kayle",
        11 => "Master Yi",
        12 => "Alistar",
        13 => "Ryze",
        14 => "Sion",
        15 => "Sivir",
        16 => "Soraka",
        17 => "Teemo",
        18 => "Tristana",
        19 => "Warwick",
        20 => "Nunu & Willump",
        21 => "Miss Fortune",
        22 => "Ashe",
        23 => "Tryndamere",
        24 => "Jax",
        25 => "Morgana",
        26 => "Zilean",
        27 => "Singed",
        28 => "Evelynn",
        29 => "Twitch",
        30 => "Karthus",
        31 => "Cho'Gath",
        32 => "Amumu",
        33 => "Rammus",
        34 => "Anivia",
        35 => "Shaco",
        36 => "Dr. Mundo",
        37 => "Sona",
        38 => "Kassadin",
        39 => "Irelia",
        40 => "Janna",
        41 => "Gangplank",
        42 => "Corki",
        43 => "Karma",
        44 => "Taric",
        45 => "Veigar",
        48 => "Trundle",
        50 => "Swain",
        51 => "Caitlyn",
        53 => "Blitzcrank",
        54 => "Malphite",
        55 => "Katarina",
        56 => "Nocturne",
        57 => "Maokai",
        58 => "Renekton",
        59 => "Jarvan IV",
        60 => "Elise",
        61 => "Orianna",
        62 => "Wukong",
        63 => "Brand",
        64 => "Lee Sin",
        67 => "Vayne",
        68 => "Rumble",
        69 => "Cassiopeia",
        72 => "Skarner",
        74 => "Heimerdinger",
        75 => "Nasus",
        76 => "Nidalee",
        77 => "Udyr",
        78 => "Poppy",
        79 => "Gragas",
        80 => "Pantheon",
        81 => "Ezreal",
        82 => "Mordekaiser",
        83 => "Yorick",
        84 => "Akali",
        85 => "Kennen",
        86 => "Garen",
        89 => "Leona",
        90 => "Malzahar",
        91 => "Talon",
        92 => "Riven",
        96 => "Kog'Maw",
        98 => "Shen",
        99 => "Lux",
        101 => "Xerath",
        102 => "Shyvana",
        103 => "Ahri",
        104 => "Graves",
        105 => "Fizz",
        106 => "Volibear",
        107 => "Rengar",
        110 => "Varus",
        111 => "Nautilus",
        112 => "Viktor",
        113 => "Sejuani",
        114 => "Fiora",
        115 => "Ziggs",
        117 => "Lulu",
        119 => "Draven",
        120 => "Hecarim",
        121 => "Kha'Zix",
        122 => "Darius",
        126 => "Jayce",
        127 => "Lissandra",
        131 => "Diana",
        133 => "Quinn",
        134 => "Syndra",
        136 => "Aurelion Sol",
        141 => "Kayn",
        142 => "Zoe",
        143 => "Zyra",
        145 => "Kai'Sa",
        147 => "Seraphine",
        150 => "Gnar",
        154 => "Zac",
        157 => "Yasuo",
        161 => "Vel'Koz",
        163 => "Taliyah",
        164 => "Camille",
        166 => "Akshan",
        200 => "Bel'Veth",
        201 => "Braum",
        202 => "Jhin",
        203 => "Kindred",
        221 => "Zeri",
        222 => "Jinx",
        223 => "Tahm Kench",
        233 => "Briar",
        234 => "Viego",
        235 => "Senna",
        236 => "Lucian",
        238 => "Zed",
        240 => "Kled",
        245 => "Ekko",
        246 => "Qiyana",
        254 => "Vi",
        266 => "Aatrox",
        267 => "Nami",
        268 => "Azir",
        350 => "Yuumi",
        360 => "Samira",
        412 => "Thresh",
        420 => "Illaoi",
        421 => "Rek'Sai",
        427 => "Ivern",
        429 => "Kalista",
        432 => "Bard",
        497 => "Rakan",
        498 => "Xayah",
        516 => "Ornn",
        517 => "Sylas",
        518 => "Neeko",
        523 => "Aphelios",
        526 => "Rell",
        555 => "Pyke",
        711 => "Vex",
        777 => "Yone",
        875 => "Sett",
        876 => "Lillia",
        887 => "Gwen",
        888 => "Renata Glasc",
        893 => "Aurora",
        895 => "Smolder",
        897 => "K'Sante",
        902 => "Milio",
        910 => "Hwei",
        950 => "Naafiri",
        _ => "Unknown Champion",
    }
}

/// Looks up the best matching Mod Library package or saved Preset for a champion.
/// Presets may map to a package hash; metadata-only presets stay reference-only.
fn find_game_final_dir_at(root: &std::path::Path) -> Option<PathBuf> {
    let info = super::game_path::resolve_game_install_info_at(&root.join("game_path.json"), None);
    let league_path = info.league_path?;
    let game_dir = super::game_adapter::resolve_modtools_game_dir(std::path::Path::new(&league_path)).ok()?;
    let final_dir = game_dir.join("DATA").join("FINAL");
    final_dir.is_dir().then_some(final_dir)
}

fn resolve_display_champion_name(root: Option<&std::path::Path>, champion_id: u32) -> String {
    if let Some(r) = root {
        if let Some((_, name, _)) = super::skin_catalog::champion_display_from_numeric_at(r, champion_id) {
            return name;
        }
    }
    champion_name_from_id(champion_id).to_string()
}

/// Core loadout resolver operating directly on a customization root directory.
/// Explicit skin selections take precedence so picking an official skin overrides
/// an idle custom mod, while clearing/selecting a custom mod restores ModLibrary priority.
pub(crate) fn resolve_loadout_for_champion_at(
    root: &std::path::Path,
    champion_id: u32,
    champ_name: &str,
) -> ResolvedLoadout {
    // 1. Explicit skin selection from the in-app or Pengu picker.
    if champion_id > 0 {
        if let Some(sel) = super::skin_catalog::read_skin_selection_at(root, champion_id) {
            let (champ_str_id, champ_display_name, champ_key, skin_num, skin_name_opt) =
                super::skin_catalog::resolve_skin_meta_at(
                    root,
                    champion_id,
                    sel.skin_id,
                    Some(champ_name),
                );
            let skin_label = skin_name_opt.unwrap_or_else(|| format!("Skin #{skin_num}"));

            if skin_num == 0 {
                return ResolvedLoadout {
                    champion_id,
                    champion_name: champ_display_name,
                    skin_or_mod_name: skin_label,
                    source: "OfficialDefault".to_string(),
                    mod_hash: None,
                    file_count: 0,
                    applied_in_game: false,
                    limitation: "Using official Riot default skin.".to_string(),
                };
            }

            if let Some(final_dir) = find_game_final_dir_at(root) {
                match super::skin_overlay::ensure_official_skin_mod_at(
                    root,
                    &final_dir,
                    &champ_str_id,
                    &champ_display_name,
                    champ_key.as_deref(),
                    skin_num,
                    sel.skin_id,
                ) {
                    Ok(sha) => {
                        return ResolvedLoadout {
                            champion_id,
                            champion_name: champ_display_name,
                            skin_or_mod_name: skin_label,
                            source: "SkinSelection".to_string(),
                            mod_hash: Some(sha),
                            file_count: 2,
                            applied_in_game: false,
                            limitation: "On-demand official skin overlay prepared from local game WAD."
                                .to_string(),
                        };
                    }
                    Err(err) => {
                        return ResolvedLoadout {
                            champion_id,
                            champion_name: champ_display_name,
                            skin_or_mod_name: skin_label,
                            source: "SkinSelection".to_string(),
                            mod_hash: None,
                            file_count: 0,
                            applied_in_game: false,
                            limitation: format!(
                                "Selected skin recorded (LCU best-effort); local overlay unavailable: {err}"
                            ),
                        };
                    }
                }
            } else {
                return ResolvedLoadout {
                    champion_id,
                    champion_name: champ_display_name,
                    skin_or_mod_name: skin_label,
                    source: "SkinSelection".to_string(),
                    mod_hash: None,
                    file_count: 0,
                    applied_in_game: false,
                    limitation: "Selected skin recorded (LCU best-effort); League DATA/FINAL directory not detected for overlay generation.".to_string(),
                };
            }
        }
    }

    // 2. Check Mod Library for the best enabled user custom package targeting this champion.
    if let Ok(installed) = super::library::list_installed_at(root) {
        if let Some(best) =
            super::resolver::resolve_best_mod(&installed, champion_id, champ_name)
        {
            let file_count = installed
                .iter()
                .find(|item| item.manifest.sha256 == best.sha256)
                .map(|item| item.manifest.files.len())
                .unwrap_or(0);
            return ResolvedLoadout {
                champion_id,
                champion_name: champ_name.to_string(),
                skin_or_mod_name: best.display_name,
                source: "ModLibrary".to_string(),
                mod_hash: Some(best.sha256),
                file_count,
                applied_in_game: false,
                limitation: "Cached in LAAP Mod Library; ready to activate via managed backend.".to_string(),
            };
        }
    }

    // 3. Check Presets for this champion
    let presets_path = root.join("presets.json");
    #[derive(Deserialize)]
    struct PresetStore {
        presets: Vec<super::presets::Preset>,
    }
    if let Ok(Some(store)) = storage::read::<PresetStore>(&presets_path, 1024 * 1024) {
        for preset in store.presets {
            let matches_id = preset.champion_id == champion_id.to_string();
            let matches_name = preset.champion_id.eq_ignore_ascii_case(champ_name);
            if matches_id || matches_name {
                let mod_hash = preset.mod_sha256.clone();
                return ResolvedLoadout {
                    champion_id,
                    champion_name: champ_name.to_string(),
                    skin_or_mod_name: preset.name,
                    source: "Preset".to_string(),
                    mod_hash,
                    file_count: 0,
                    applied_in_game: false,
                    limitation: "Preset selected. Mapped mod packages apply through the configured adapter; metadata-only presets remain references.".to_string(),
                };
            }
        }
    }

    // 4. No matching preset or mod
    ResolvedLoadout {
        champion_id,
        champion_name: champ_name.to_string(),
        skin_or_mod_name: format!("No saved preset or local mod for {champ_name}"),
        source: "Default".to_string(),
        mod_hash: None,
        file_count: 0,
        applied_in_game: false,
        limitation: "Using official Riot client skin selection.".to_string(),
    }
}

/// Looks up the best matching selection, Mod Library package, or saved Preset for a champion.
pub fn resolve_loadout_for_champion(
    app: &AppHandle,
    champion_id: u32,
    champ_name: &str,
) -> ResolvedLoadout {
    if let Ok(root) = storage::root(app) {
        return resolve_loadout_for_champion_at(&root, champion_id, champ_name);
    }
    ResolvedLoadout {
        champion_id,
        champion_name: champ_name.to_string(),
        skin_or_mod_name: format!("No saved preset or local mod for {champ_name}"),
        source: "Default".to_string(),
        mod_hash: None,
        file_count: 0,
        applied_in_game: false,
        limitation: "Customization storage unavailable.".to_string(),
    }
}

/// Best-effort LCU Champ Select skin slot selection. If `preferred_skin_id` is rejected
/// (e.g. unowned skin) and an overlay is active on `skin0`, falls back to base `champion_id * 1000`
/// so Riot does not load a different previously-equipped owned skin over `skin0`.
pub(crate) fn ensure_lcu_skin_slot_for_mod(
    preferred_skin_id: Option<u32>,
    champion_id: u32,
) -> (bool, Option<String>) {
    if champion_id == 0 {
        return match preferred_skin_id {
            Some(sid) if sid > 0 => match super::skin_catalog::try_select_skin_in_champ_select(sid) {
                Ok(()) => (true, None),
                Err(e) => (false, Some(e)),
            },
            _ => (false, None),
        };
    }
    let base_skin_id = champion_id.saturating_mul(1000);
    if let Some(sid) = preferred_skin_id {
        if sid > 0 {
            match super::skin_catalog::try_select_skin_in_champ_select(sid) {
                Ok(()) => return (true, None),
                Err(err) => {
                    if sid != base_skin_id {
                        let _ = super::skin_catalog::try_select_skin_in_champ_select(base_skin_id);
                    }
                    return (false, Some(err));
                }
            }
        }
    }
    match super::skin_catalog::try_select_skin_in_champ_select(base_skin_id) {
        Ok(()) => (true, None),
        Err(err) => (false, Some(err)),
    }
}

/// Unified handler for explicit skin selection from both the in-app picker (`skin_select`)
/// and the Pengu companion bridge (`select_skin`). Persists selection, updates LCU best-effort,
/// generates the official skin overlay on-demand, applies immediately if safe, and notifies UI/bridge.
pub(crate) fn apply_selected_skin_at(
    root: &std::path::Path,
    champion_id: u32,
    skin_id: u32,
    champion_name: Option<&str>,
) -> Result<serde_json::Value, String> {
    let eff_champ_id = if champion_id > 0 {
        champion_id
    } else {
        skin_id / 1000
    };
    let champ_display = champion_name
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "Unknown Champion")
        .map(str::to_string)
        .unwrap_or_else(|| resolve_display_champion_name(Some(root), eff_champ_id));

    if eff_champ_id > 0 {
        super::skin_catalog::save_skin_selection_at(
            root,
            eff_champ_id,
            skin_id,
            Some(&champ_display),
        )?;
    }

    let (lcu_ok, lcu_detail) = ensure_lcu_skin_slot_for_mod(Some(skin_id), eff_champ_id);

    let mut loadout = resolve_loadout_for_champion_at(root, eff_champ_id, &champ_display);
    let gf_phase = current_gameflow_phase();
    let tracker_hint = get_tracker()
        .lock()
        .ok()
        .and_then(|t| t.lcu_build_hint.clone());
    let mut opts = super::game_adapter::ProbeOptions {
        lcu_build_hint: tracker_hint,
        ..super::game_adapter::ProbeOptions::default()
    };
    opts.active_match_running = opts.active_match_running
        || !super::game_adapter::is_safe_gameflow_phase(gf_phase.as_deref());

    let (ev_type, ev_msg) = handle_champ_select_loadout_at(root, &mut loadout, true, &opts);

    let selection_updated_at = if eff_champ_id > 0 {
        super::skin_catalog::read_skin_selection_at(root, eff_champ_id).map(|s| s.updated_at)
    } else {
        None
    };

    if let Ok(mut tracker) = get_tracker().lock() {
        tracker.last_champion_id = (eff_champ_id > 0).then_some(eff_champ_id);
        tracker.last_champion_name = Some(champ_display.clone());
        tracker.last_skin_selection_updated_at = selection_updated_at;
    }

    if let Ok(mut state) = get_state().lock() {
        if eff_champ_id > 0 && state.detected_champion_id.is_none() {
            state.detected_champion_id = Some(eff_champ_id);
            state.detected_champion_name = Some(champ_display.clone());
        }
        state.resolved_loadout = Some(loadout.clone());
        state.add_event(ev_type, &ev_msg);
    }

    super::client_bridge::notify_state_changed();

    let deferred = ev_type == "MOD_DEFERRED";
    Ok(serde_json::json!({
        "ok": true,
        "championId": eff_champ_id,
        "skinId": skin_id,
        "lcuSelection": lcu_ok,
        "lcuDetail": lcu_detail,
        "appliedInGame": loadout.applied_in_game,
        "deferred": deferred,
        "modHash": loadout.mod_hash,
        "applyMessage": ev_msg,
        "loadout": loadout,
    }))
}

/// Inspects LCU Champ Select session to retrieve the selected champion ID.
fn inspect_champ_select_session(conn: &crate::lcu_read::LcuConnection) -> Result<Option<u32>, String> {
    let session = conn.get("/lol-champ-select/v1/session")?;
    let local_cell_id = session
        .get("localPlayerCellId")
        .and_then(|v| v.as_i64())
        .unwrap_or(-1);

    if local_cell_id < 0 {
        return Ok(None);
    }

    let my_team = session
        .get("myTeam")
        .and_then(|v| v.as_array())
        .ok_or("Invalid champ select myTeam array")?;

    for member in my_team {
        let cell_id = member.get("cellId").and_then(|v| v.as_i64()).unwrap_or(-2);
        if cell_id == local_cell_id {
            if let Some(champ_id) = member.get("championId").and_then(|v| v.as_u64()) {
                if champ_id > 0 {
                    return Ok(Some(champ_id as u32));
                }
            }
        }
    }

    Ok(None)
}

fn extract_lcu_build_version(client: &crate::lcu_read::LcuConnection) -> Option<String> {
    let val = client.get("/system/v1/builds").ok()?;
    val.get("version")
        .and_then(|v| v.as_str())
        .and_then(super::game_path::sanitize_build_string)
}

/// Best-effort game mode from the LCU gameflow session (e.g. CLASSIC, ARAM).
fn extract_lcu_game_mode(client: &crate::lcu_read::LcuConnection) -> Option<String> {
    let session = client.get("/lol-gameflow/v1/session").ok()?;
    let game_data = session.get("gameData")?;
    game_data
        .get("queue")
        .and_then(|queue| queue.get("gameMode"))
        .or_else(|| game_data.get("gameMode"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty() && value.len() <= 32)
}

/// Pre-stage the resolved champion package in the LAAP sandbox without activating it.
pub fn warm_stage_for_champion_at(
    customization_root: &std::path::Path,
    champion_id: u32,
    champion_name: &str,
) -> Result<usize, String> {
    let items = super::library::list_installed_at(customization_root)?;
    let Some(best) = super::resolver::resolve_best_mod(&items, champion_id, champion_name) else {
        return Ok(0);
    };
    super::library::prestage_hashes_at(customization_root, &[best.sha256])
}

pub(crate) fn handle_champ_select_loadout_at(
    customization_root: &std::path::Path,
    loadout: &mut ResolvedLoadout,
    auto_apply_mods: bool,
    opts: &super::game_adapter::ProbeOptions,
) -> (&'static str, String) {
    if loadout.source == "Preset" && loadout.mod_hash.is_none() {
        // Presets without a mapped mod package stay reference-only.
        if let Ok(mut w) = get_tracker().lock() {
            w.match_apply_status = "preset-reference".into();
        }
        return (
            "PRESET_REFERENCE",
            format!(
                "Champion detected: {} (ID {}). Selected preset '{}' (reference; no mapped mod package).",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            ),
        );
    }

    if loadout.source == "OfficialDefault" {
        if let Ok(tracker) = get_tracker().lock().map(|t| t.clone()) {
            if tracker.active_applied_mod_hash.is_some() {
                let _ = super::library::rollback_at(customization_root, opts);
                if let Ok(mut w) = get_tracker().lock() {
                    w.active_applied_mod_hash = None;
                    w.pending_restore_after_match = false;
                }
            }
        }
        if let Ok(mut w) = get_tracker().lock() {
            w.match_apply_status = "default-skin".into();
        }
        return (
            "CHAMP_DETECTED",
            format!(
                "Champion detected: {} (ID {}). Classic/Default skin active ({}).",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            ),
        );
    }

    if loadout.source != "ModLibrary" && loadout.source != "Preset" && loadout.source != "SkinSelection" {
        if let Ok(tracker) = get_tracker().lock().map(|t| t.clone()) {
            if tracker.active_applied_mod_hash.is_some() {
                let _ = super::library::rollback_at(customization_root, opts);
                if let Ok(mut w) = get_tracker().lock() {
                    w.active_applied_mod_hash = None;
                    w.pending_restore_after_match = false;
                }
            }
        }
        if let Ok(mut w) = get_tracker().lock() {
            w.match_apply_status = "no-mod".into();
        }
        return (
            "CHAMP_DETECTED",
            format!(
                "Champion detected: {} (ID {}). No matching local preset or mod.",
                loadout.champion_name, loadout.champion_id
            ),
        );
    }

    let Some(mod_hash) = loadout.mod_hash.clone() else {
        if let Ok(mut w) = get_tracker().lock() {
            w.match_apply_status = "no-mod".into();
        }
        let msg = if loadout.source == "SkinSelection" {
            format!(
                "Champion detected: {} (ID {}). Selected skin '{}' recorded; no prepared mod overlay/package available for in-game apply yet.",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            )
        } else {
            format!(
                "Champion detected: {} (ID {}). Matching mod '{}' has no package hash.",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            )
        };
        return ("MOD_REFERENCE", msg);
    };

    // If swapping away from a different previously activated champion mod, clean up first.
    let previous_applied = get_tracker()
        .lock()
        .ok()
        .and_then(|t| t.active_applied_mod_hash.clone());
    if let Some(prev) = previous_applied {
        if prev != mod_hash {
            let _ = super::library::rollback_at(customization_root, opts);
            if let Ok(mut w) = get_tracker().lock() {
                w.active_applied_mod_hash = None;
                w.pending_restore_after_match = false;
            }
        }
    }

    if !auto_apply_mods {
        let probe = super::game_adapter::probe_adapter_at(customization_root, opts);
        if let Ok(mut w) = get_tracker().lock() {
            w.match_apply_status = if probe.compatible && probe.consent_granted && probe.clearance_acknowledged {
                "ready".into()
            } else {
                "sandbox-only".into()
            };
        }
        return (
            "MOD_REFERENCE",
            format!(
                "Champion detected: {} (ID {}). Matching custom mod '{}' ({}). Enable opt-in ChampSelect auto-apply or click Apply Manually.",
                loadout.champion_name,
                loadout.champion_id,
                loadout.skin_or_mod_name,
                probe.state.as_summary()
            ),
        );
    }

    match super::library::stage_overlay_at(customization_root, Some(&[mod_hash.clone()]), opts) {
        Ok(report) => {
            let mod_kind = if loadout.source == "SkinSelection" {
                "official skin overlay"
            } else {
                "custom mod"
            };
            loadout.applied_in_game = report.applied_in_game;
            loadout.limitation = report.message.clone();
            if report.applied_in_game {
                if let Ok(mut w) = get_tracker().lock() {
                    w.active_applied_mod_hash = Some(mod_hash);
                    w.pending_restore_after_match = false;
                    w.match_apply_status = "applied".into();
                }
                (
                    "MOD_APPLIED",
                    format!(
                        "Champion detected: {} (ID {}). Activated {mod_kind} '{}': {}",
                        loadout.champion_name,
                        loadout.champion_id,
                        loadout.skin_or_mod_name,
                        report.message
                    ),
                )
            } else if report.deferred_reason.is_some() {
                if let Ok(mut w) = get_tracker().lock() {
                    w.match_apply_status = "deferred".into();
                }
                (
                    "MOD_DEFERRED",
                    format!(
                        "Champion detected: {} (ID {}). Deferred '{}': {}",
                        loadout.champion_name,
                        loadout.champion_id,
                        loadout.skin_or_mod_name,
                        report.message
                    ),
                )
            } else if report.adapter_state == super::game_adapter::AdapterLifecycleState::Failed {
                if let Ok(mut w) = get_tracker().lock() {
                    w.match_apply_status = "failed".into();
                }
                (
                    "MOD_APPLY_FAILED",
                    format!(
                        "Failed activating {mod_kind} '{}': {}",
                        loadout.skin_or_mod_name, report.message
                    ),
                )
            } else {
                if let Ok(mut w) = get_tracker().lock() {
                    w.match_apply_status = "staged-sandbox-only".into();
                }
                (
                    "MOD_STAGED_ONLY",
                    format!(
                        "Champion detected: {} (ID {}). Staged '{}' in sandbox only: {}",
                        loadout.champion_name,
                        loadout.champion_id,
                        loadout.skin_or_mod_name,
                        report.message
                    ),
                )
            }
        }
        Err(err) => {
            if let Ok(mut w) = get_tracker().lock() {
                w.match_apply_status = "failed".into();
            }
            (
                "MOD_APPLY_FAILED",
                format!(
                    "Failed activating '{}' for {}: {err}",
                    loadout.skin_or_mod_name, loadout.champion_name
                ),
            )
        }
    }
}

pub(crate) fn handle_post_match_cleanup_at(
    customization_root: &std::path::Path,
    phase_val: &str,
    opts: &super::game_adapter::ProbeOptions,
) -> Option<(&'static str, String)> {
    let should_restore = get_tracker()
        .lock()
        .ok()
        .map(|t| t.active_applied_mod_hash.is_some() || t.pending_restore_after_match)
        .unwrap_or(false);
    if !should_restore {
        return None;
    }

    let safe_phase = super::game_adapter::is_safe_gameflow_phase(Some(phase_val));
    if !safe_phase || opts.active_match_running {
        if let Ok(mut w) = get_tracker().lock() {
            w.pending_restore_after_match = true;
            w.match_apply_status = "deferred-restore".into();
        }
        return Some((
            "MOD_RESTORE_DEFERRED",
            format!(
                "Gameflow at {phase_val}; waiting for active League process to finish before restoring defaults."
            ),
        ));
    }

    match super::library::rollback_at(customization_root, opts) {
        Ok(report) => {
            if report.deferred_reason.is_some() {
                if let Ok(mut w) = get_tracker().lock() {
                    w.pending_restore_after_match = true;
                    w.match_apply_status = "deferred-restore".into();
                }
                return Some(("MOD_RESTORE_DEFERRED", report.message));
            }
            if let Ok(mut w) = get_tracker().lock() {
                w.active_applied_mod_hash = None;
                w.pending_restore_after_match = false;
                w.match_apply_status = if report.game_overlay_cleaned {
                    "restored".into()
                } else {
                    "idle".into()
                };
            }
            Some((
                "MOD_RESTORED",
                format!("Gameflow returned to {phase_val}. {}", report.message),
            ))
        }
        Err(err) => {
            if let Ok(mut w) = get_tracker().lock() {
                w.match_apply_status = "restore-failed".into();
            }
            Some((
                "MOD_RESTORE_FAILED",
                format!("Failed restoring defaults on {phase_val}: {err}"),
            ))
        }
    }
}

/// Core single-tick polling logic (network & adapter operations run outside `STATE` mutex).
pub fn poll_tick(app: &AppHandle) {
    let state_arc = get_state();
    let (previous_phase, previous_champ_id) = match state_arc.lock() {
        Ok(s) => (s.gameflow_phase.clone(), s.detected_champion_id),
        Err(_) => return,
    };

    let conn_res = crate::lcu_read::connection();
    let conn = match conn_res {
        Ok(c) => c,
        Err(e) => {
            if let Ok(mut state) = state_arc.lock() {
                state.reset_live_observation();
                state.phase = RunnerPhase::Error;
                state.error_message = Some(e);
            }
            return;
        }
    };

    let Some(client) = conn else {
        if let Ok(mut state) = state_arc.lock() {
            state.reset_live_observation();
            state.error_message = None;
            state.phase = RunnerPhase::Monitoring;
        }
        return;
    };

    let phase_val = match client.get("/lol-gameflow/v1/gameflow-phase") {
        Ok(v) => v.as_str().unwrap_or("Unknown").to_string(),
        Err(_) => "Unknown".to_string(),
    };

    let lcu_build_hint = extract_lcu_build_version(&client);
    if let Some(ref b) = lcu_build_hint {
        if let Ok(mut t) = get_tracker().lock() {
            t.lcu_build_hint = Some(b.clone());
        }
    }
    let game_mode_hint = extract_lcu_game_mode(&client);
    if let Ok(mut state) = state_arc.lock() {
        state.game_mode = game_mode_hint;
    }

    let root = super::storage::root(app).ok();

    // Warm staging: during lobby/matchmaking/ready-check, pre-stage the last known
    // champion's package into the sandbox so Champ Select apply is fast.
    if matches!(phase_val.as_str(), "Lobby" | "Matchmaking" | "ReadyCheck")
        && previous_phase.as_deref() != Some(phase_val.as_str())
    {
        let champion = get_tracker()
            .lock()
            .ok()
            .and_then(|t| t.last_champion_id.zip(t.last_champion_name.clone()));
        if let (Some(root_path), Some((champ_id, champ_name))) = (root.as_deref(), champion) {
            let status = match warm_stage_for_champion_at(root_path, champ_id, &champ_name) {
                Ok(0) => "no-matching-mod".to_string(),
                Ok(files) => format!("pre-staged {files} file(s) for {champ_name}"),
                Err(err) => format!("warm-stage-failed: {err}"),
            };
            if let Ok(mut tracker) = get_tracker().lock() {
                tracker.warm_stage_status = status;
            }
        }
    }
    let cfg = load_runner_cfg_at(root.as_deref());
    let tracker_hint = get_tracker()
        .lock()
        .ok()
        .and_then(|t| t.lcu_build_hint.clone());
    let mut probe_opts = super::game_adapter::ProbeOptions {
        lcu_build_hint: tracker_hint,
        ..super::game_adapter::ProbeOptions::default()
    };
    probe_opts.active_match_running = probe_opts.active_match_running
        || !super::game_adapter::is_safe_gameflow_phase(Some(phase_val.as_str()));

    match phase_val.as_str() {
        "ChampSelect" => {
            let picked_champ = inspect_champ_select_session(&client).ok().flatten();
            let mut new_selection: Option<(u32, String, ResolvedLoadout, (&'static str, String), Option<u64>)> =
                None;
            if let Some(champ_id) = picked_champ {
                // Auto-fetch DDragon skins in the background when not yet cached so Pengu & UI populate automatically.
                let need_catalog_fetch = root.as_deref().is_some_and(|r| {
                    super::skin_catalog::list_cached_skins_for_numeric_champion_at(r, champ_id)
                        .is_none()
                });
                if need_catalog_fetch {
                    let should_spawn = get_tracker()
                        .lock()
                        .map(|mut t| {
                            if t.last_ddragon_fetch_champ_id != Some(champ_id) {
                                t.last_ddragon_fetch_champ_id = Some(champ_id);
                                true
                            } else {
                                false
                            }
                        })
                        .unwrap_or(false);
                    if should_spawn {
                        let app_bg = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if super::skin_catalog::ensure_champion_detail_cached(&app_bg, champ_id)
                                .await
                                .is_some()
                            {
                                super::client_bridge::notify_state_changed();
                            }
                        });
                    }
                }

                let selection_obj = root
                    .as_deref()
                    .and_then(|r| super::skin_catalog::read_skin_selection_at(r, champ_id));
                let selection_ts = selection_obj.as_ref().map(|s| s.updated_at);
                let prev_selection_ts = get_tracker()
                    .lock()
                    .ok()
                    .and_then(|t| t.last_skin_selection_updated_at);

                if previous_champ_id != Some(champ_id) || selection_ts != prev_selection_ts {
                    let champ_name = resolve_display_champion_name(root.as_deref(), champ_id);
                    let mut loadout = resolve_loadout_for_champion(app, champ_id, &champ_name);

                    if cfg.auto_apply_mods && loadout.mod_hash.is_some() {
                        let preferred = selection_obj.as_ref().map(|s| s.skin_id);
                        let _ = ensure_lcu_skin_slot_for_mod(preferred, champ_id);
                    }

                    let ev = if let Some(ref r) = root {
                        handle_champ_select_loadout_at(r, &mut loadout, cfg.auto_apply_mods, &probe_opts)
                    } else {
                        (
                            "MOD_REFERENCE",
                            format!(
                                "Champion detected: {} (ID {}). Customization root unavailable.",
                                champ_name, champ_id
                            ),
                        )
                    };
                    new_selection = Some((champ_id, champ_name, loadout, ev, selection_ts));
                }
            }

            let notify_needed = new_selection.is_some() || previous_phase.as_deref() != Some("ChampSelect");
            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val);
                state.phase = RunnerPhase::ChampSelect;
                if let Some((champ_id, champ_name, loadout, (ev_type, ev_msg), sel_ts)) = new_selection {
                    state.detected_champion_id = Some(champ_id);
                    state.detected_champion_name = Some(champ_name.clone());
                    state.add_event(ev_type, &ev_msg);
                    state.resolved_loadout = Some(loadout);
                    if let Ok(mut tracker) = get_tracker().lock() {
                        tracker.last_champion_id = Some(champ_id);
                        tracker.last_champion_name = Some(champ_name);
                        tracker.last_skin_selection_updated_at = sel_ts;
                    }
                }
            }
            if notify_needed {
                super::client_bridge::notify_state_changed();
            }
        }
        "GameStart" | "InProgress" | "Reconnect" => {
            let had_active = get_tracker()
                .lock()
                .ok()
                .map(|t| t.active_applied_mod_hash.is_some())
                .unwrap_or(false);
            if let Ok(mut w) = get_tracker().lock() {
                if had_active {
                    w.pending_restore_after_match = true;
                    w.match_apply_status = "in-match-active".into();
                } else {
                    w.match_apply_status = "in-match".into();
                }
            }
            let phase_changed = previous_phase.as_deref() != Some(phase_val.as_str());
            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val.clone());
                state.phase = RunnerPhase::InMatch;
                if phase_changed {
                    let msg = if had_active {
                        "Match active in League with custom ModLibrary overlay prepared in ChampSelect. Adapter calls paused until EndOfGame/Lobby."
                    } else {
                        "Match active in League. No adapter operations run during live matches."
                    };
                    state.add_event("IN_MATCH", msg);
                }
            }
            if phase_changed {
                super::client_bridge::notify_state_changed();
            }
        }
        "EndOfGame" | "PreEndOfGame" | "WaitingForStats" | "Lobby" | "None" => {
            let cleanup_ev = root
                .as_deref()
                .and_then(|r| handle_post_match_cleanup_at(r, &phase_val, &probe_opts));
            let phase_changed = previous_phase.as_deref() != Some(phase_val.as_str());
            let should_notify = phase_changed || cleanup_ev.is_some();

            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val.clone());
                if phase_changed
                    && matches!(
                        previous_phase.as_deref(),
                        Some("ChampSelect" | "GameStart" | "InProgress" | "Reconnect")
                    )
                {
                    state.add_event(
                        "PHASE_CHANGED",
                        &format!("Gameflow returned to {phase_val}."),
                    );
                }
                if let Some((ev_type, ev_msg)) = cleanup_ev {
                    state.add_event(ev_type, &ev_msg);
                }
                if phase_val == "Lobby" || phase_val == "None" || phase_val == "EndOfGame" {
                    state.clear_champion_selection();
                }
                state.phase = RunnerPhase::Monitoring;
            }
            if should_notify {
                super::client_bridge::notify_state_changed();
            }
        }
        _ => {
            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val);
                state.phase = RunnerPhase::Monitoring;
            }
        }
    }
}

// =========================================================================
// TAURI COMMANDS
// =========================================================================

#[tauri::command]
pub fn in_game_runner_get_config(app: AppHandle) -> Result<InGameRunnerConfig, String> {
    let p = config_path(&app)?;
    Ok(storage::read::<InGameRunnerConfig>(&p, 64 * 1024)?.unwrap_or_default())
}

#[tauri::command]
pub fn in_game_runner_save_config(
    app: AppHandle,
    config: InGameRunnerConfig,
) -> Result<InGameRunnerConfig, String> {
    let sanitized = InGameRunnerConfig {
        monitor_enabled: config.monitor_enabled,
        poll_interval_ms: config.poll_interval_ms.clamp(1000, 30000),
        auto_apply_mods: config.auto_apply_mods,
    };
    let p = config_path(&app)?;
    storage::write(&p, &sanitized)?;
    Ok(sanitized)
}

#[derive(Clone, Debug)]
struct ApplyTrackerState {
    lcu_build_hint: Option<String>,
    match_apply_status: String,
    active_applied_mod_hash: Option<String>,
    pending_restore_after_match: bool,
    last_champion_id: Option<u32>,
    last_champion_name: Option<String>,
    last_skin_selection_updated_at: Option<u64>,
    last_ddragon_fetch_champ_id: Option<u32>,
    warm_stage_status: String,
}

impl Default for ApplyTrackerState {
    fn default() -> Self {
        Self {
            lcu_build_hint: None,
            match_apply_status: "idle".into(),
            active_applied_mod_hash: None,
            pending_restore_after_match: false,
            last_champion_id: None,
            last_champion_name: None,
            last_skin_selection_updated_at: None,
            last_ddragon_fetch_champ_id: None,
            warm_stage_status: "idle".into(),
        }
    }
}

fn get_tracker() -> &'static std::sync::Mutex<ApplyTrackerState> {
    static TRACKER: std::sync::OnceLock<std::sync::Mutex<ApplyTrackerState>> =
        std::sync::OnceLock::new();
    TRACKER.get_or_init(|| std::sync::Mutex::new(ApplyTrackerState::default()))
}

pub(crate) fn current_gameflow_phase() -> Option<String> {
    get_state()
        .try_lock()
        .ok()
        .and_then(|s| s.gameflow_phase.clone())
}

pub(crate) fn current_bridge_observation() -> (
    RunnerPhase,
    bool,
    Option<String>,
    Option<u32>,
    Option<String>,
    String,
    Option<String>,
) {
    let (phase, connected, gf, cid, cname) = get_state()
        .try_lock()
        .ok()
        .map(|s| {
            (
                s.phase.clone(),
                s.client_connected,
                s.gameflow_phase.clone(),
                s.detected_champion_id,
                s.detected_champion_name.clone(),
            )
        })
        .unwrap_or((RunnerPhase::Idle, false, None, None, None));
    let (apply_status, active_hash) = get_tracker()
        .try_lock()
        .ok()
        .map(|t| (t.match_apply_status.clone(), t.active_applied_mod_hash.clone()))
        .unwrap_or_else(|| ("idle".into(), None));
    (phase, connected, gf, cid, cname, apply_status, active_hash)
}

pub(crate) fn record_external_apply_outcome(mod_hash: &str, applied: bool, deferred: bool, fallback_state: &str) {
    if let Ok(mut tracker) = get_tracker().lock() {
        if applied {
            tracker.active_applied_mod_hash = Some(mod_hash.to_string());
            tracker.match_apply_status = "applied".into();
            tracker.pending_restore_after_match = false;
        } else if deferred {
            tracker.match_apply_status = "deferred".into();
        } else {
            tracker.match_apply_status = fallback_state.to_string();
        }
    }
}

pub(crate) fn record_external_restore_outcome(cleaned: bool, deferred: bool) {
    if let Ok(mut tracker) = get_tracker().lock() {
        if cleaned {
            tracker.active_applied_mod_hash = None;
            tracker.pending_restore_after_match = false;
            tracker.match_apply_status = "restored".into();
        } else if deferred {
            tracker.pending_restore_after_match = true;
            tracker.match_apply_status = "deferred-restore".into();
        }
    }
}

fn load_runner_cfg_at(root: Option<&std::path::Path>) -> InGameRunnerConfig {
    let Some(r) = root else {
        return InGameRunnerConfig {
            monitor_enabled: false,
            poll_interval_ms: 3000,
            auto_apply_mods: false,
        };
    };
    let p = r.join("in_game_runner_config.json");
    super::storage::read::<InGameRunnerConfig>(&p, 64 * 1024)
        .ok()
        .flatten()
        .unwrap_or(InGameRunnerConfig {
            monitor_enabled: false,
            poll_interval_ms: 3000,
            auto_apply_mods: false,
        })
}

pub(crate) fn build_status_snapshot_at(
    root: Option<&std::path::Path>,
    probe_override: Option<&super::game_adapter::ProbeOptions>,
) -> Result<InGameRunnerStatus, String> {
    let tracker = get_tracker()
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let cfg = load_runner_cfg_at(root);

    let probe = match (root, probe_override) {
        (Some(r), Some(opts)) => super::game_adapter::probe_adapter_at(r, opts),
        (Some(r), None) => super::game_adapter::probe_adapter_at(
            r,
            &super::game_adapter::ProbeOptions {
                lcu_build_hint: tracker.lcu_build_hint.clone(),
                ..super::game_adapter::ProbeOptions::default()
            },
        ),
        (None, _) => {
            let empty_dir = std::env::temp_dir().join("laap-no-root-probe");
            super::game_adapter::probe_adapter_at(
                &empty_dir,
                &super::game_adapter::ProbeOptions {
                    allow_path_discovery: false,
                    lcu_build_hint: tracker.lcu_build_hint.clone(),
                    ..super::game_adapter::ProbeOptions::default()
                },
            )
        }
    };

    let state_arc = get_state();
    let state = state_arc.lock().map_err(|e| e.to_string())?;
    let is_running = RUNNING_FLAG.load(Ordering::SeqCst);

    Ok(InGameRunnerStatus {
        enabled: is_running,
        phase: state.phase.clone(),
        client_connected: state.client_connected,
        gameflow_phase: state.gameflow_phase.clone(),
        detected_champion_id: state.detected_champion_id,
        detected_champion_name: state.detected_champion_name.clone(),
        resolved_loadout: state.resolved_loadout.clone(),
        adapter_available: probe.available,
        adapter_status: format!("{} ({})", probe.state.as_summary(), probe.detail),
        adapter_state: probe.state,
        adapter_version: probe.version,
        detected_game_build: probe.league_install.detected_build,
        match_apply_status: tracker.match_apply_status,
        active_applied_mod_hash: tracker.active_applied_mod_hash,
        auto_apply_mods: cfg.auto_apply_mods || probe.auto_apply_in_champ_select,
        consent_granted: probe.consent_granted && probe.clearance_acknowledged,
        game_mode: state.game_mode.clone(),
        warm_stage_status: tracker.warm_stage_status,
        recent_events: state.recent_events.clone(),
        error_message: state.error_message.clone(),
    })
}

#[tauri::command]
pub async fn in_game_runner_get_status(app: AppHandle) -> Result<InGameRunnerStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = super::storage::root(&app).ok();
        build_status_snapshot_at(root.as_deref(), None)
    })
    .await
    .map_err(|e| format!("In-game runner status probe failed: {e}"))?
}

#[tauri::command]
pub async fn in_game_runner_apply_matched_mod(
    app: AppHandle,
    consent: bool,
) -> Result<super::library::StagingReport, String> {
    require_consent(consent)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = super::storage::root(&app)?;
        let (phase_opt, loadout_opt) = {
            let state_arc = get_state();
            let s = state_arc.lock().map_err(|e| e.to_string())?;
            (s.gameflow_phase.clone(), s.resolved_loadout.clone())
        };
        let Some(loadout) = loadout_opt else {
            return Err("No champion loadout is currently resolved from ChampSelect.".into());
        };
        if !(loadout.source.eq_ignore_ascii_case("ModLibrary")
            || loadout.source.eq_ignore_ascii_case("SkinSelection")
            || (loadout.source.eq_ignore_ascii_case("Preset") && loadout.mod_hash.is_some()))
        {
            return Err(format!(
                "Matched entry ({}) has no applicable mod/skin overlay package to activate.",
                loadout.source
            ));
        }
        let target_hash = loadout
            .mod_hash
            .ok_or_else(|| "Matched loadout entry has no package SHA-256.".to_string())?;

        let tracker_hint = get_tracker()
            .lock()
            .ok()
            .and_then(|t| t.lcu_build_hint.clone());
        let mut opts = super::game_adapter::ProbeOptions {
            lcu_build_hint: tracker_hint,
            ..super::game_adapter::ProbeOptions::default()
        };
        opts.active_match_running = opts.active_match_running
            || !super::game_adapter::is_safe_gameflow_phase(phase_opt.as_deref());

        let report = super::library::stage_overlay_at(&root, Some(&[target_hash.clone()]), &opts)?;
        if let Ok(mut tracker) = get_tracker().lock() {
            if report.applied_in_game {
                tracker.active_applied_mod_hash = Some(target_hash);
                tracker.match_apply_status = "applied".into();
                tracker.pending_restore_after_match = false;
            } else if report.deferred_reason.is_some() {
                tracker.match_apply_status = "deferred".into();
            } else {
                tracker.match_apply_status = format!("{:?}", report.adapter_state).to_ascii_lowercase();
            }
        }
        Ok(report)
    })
    .await
    .map_err(|e| format!("Manual match apply task failed: {e}"))?
}

#[tauri::command]
pub async fn in_game_runner_restore_defaults(
    app: AppHandle,
) -> Result<super::library::RollbackReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = super::storage::root(&app)?;
        let phase_opt = current_gameflow_phase();
        let tracker_hint = get_tracker()
            .lock()
            .ok()
            .and_then(|t| t.lcu_build_hint.clone());
        let mut opts = super::game_adapter::ProbeOptions {
            lcu_build_hint: tracker_hint,
            ..super::game_adapter::ProbeOptions::default()
        };
        opts.active_match_running = opts.active_match_running
            || !super::game_adapter::is_safe_gameflow_phase(phase_opt.as_deref());

        let report = super::library::rollback_at(&root, &opts)?;
        if let Ok(mut tracker) = get_tracker().lock() {
            if report.game_overlay_cleaned {
                tracker.active_applied_mod_hash = None;
                tracker.pending_restore_after_match = false;
                tracker.match_apply_status = "restored".into();
            } else if report.deferred_reason.is_some() {
                tracker.pending_restore_after_match = true;
                tracker.match_apply_status = "deferred-restore".into();
            }
        }
        Ok(report)
    })
    .await
    .map_err(|e| format!("Restore defaults task failed: {e}"))?
}

fn require_consent(consent: bool) -> Result<(), String> {
    if !consent {
        return Err("Read-only League client access requires your explicit permission.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn in_game_runner_set_enabled(
    app: AppHandle,
    enabled: bool,
    consent: bool,
) -> Result<bool, String> {
    if enabled {
        require_consent(consent)?;
    }

    let mut config = in_game_runner_get_config(app.clone())?;
    let auto_apply = config.auto_apply_mods;
    config.monitor_enabled = enabled;
    in_game_runner_save_config(app.clone(), config)?;

    let state_arc = get_state();

    if enabled {
        if !RUNNING_FLAG.swap(true, Ordering::SeqCst) {
            let generation = POLL_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
            {
                let mut state = state_arc.lock().map_err(|e| e.to_string())?;
                state.phase = RunnerPhase::Monitoring;
                let msg = if auto_apply {
                    "Gameflow monitor started with opt-in ChampSelect auto-apply (uses verified external adapter for ModLibrary custom mods only)."
                } else {
                    "Read-only gameflow & reference monitor started (auto-apply off; manual apply available)."
                };
                state.add_event("STARTED", msg);
            }

            let app_clone = app.clone();
            thread::spawn(move || {
                while RUNNING_FLAG.load(Ordering::SeqCst)
                    && POLL_GENERATION.load(Ordering::SeqCst) == generation
                {
                    let cfg = in_game_runner_get_config(app_clone.clone()).unwrap_or_default();
                    poll_tick(&app_clone);
                    thread::sleep(Duration::from_millis(cfg.poll_interval_ms.clamp(1000, 30000)));
                }
            });
        }
    } else if RUNNING_FLAG.swap(false, Ordering::SeqCst) {
        POLL_GENERATION.fetch_add(1, Ordering::SeqCst);
        let mut state = state_arc.lock().map_err(|e| e.to_string())?;
        state.reset_live_observation();
        state.phase = RunnerPhase::Idle;
        state.add_event("STOPPED", "Gameflow monitor stopped.");
    }

    Ok(enabled)
}

#[tauri::command]
pub async fn in_game_runner_poll_now(
    app: AppHandle,
    consent: bool,
) -> Result<InGameRunnerStatus, String> {
    require_consent(consent)?;
    tauri::async_runtime::spawn_blocking(move || {
        poll_tick(&app);
        let root = super::storage::root(&app).ok();
        build_status_snapshot_at(root.as_deref(), None)
    })
    .await
    .map_err(|e| format!("Poll now failed: {e}"))?
}

#[tauri::command]
pub fn in_game_runner_clear_logs() -> Result<bool, String> {
    let state_arc = get_state();
    let mut state = state_arc.lock().map_err(|e| e.to_string())?;
    state.recent_events.clear();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_champion_name_mapping() {
        assert_eq!(champion_name_from_id(103), "Ahri");
        assert_eq!(champion_name_from_id(157), "Yasuo");
        assert_eq!(champion_name_from_id(99), "Lux");
        assert_eq!(champion_name_from_id(266), "Aatrox");
        assert_eq!(champion_name_from_id(12), "Alistar");
        assert_eq!(champion_name_from_id(999999), "Unknown Champion");
    }

    #[test]
    fn test_runner_state_event_capping() {
        let mut state = RunnerState::new();
        for i in 0..60 {
            state.add_event("INFO", &format!("Event {i}"));
        }
        assert_eq!(state.recent_events.len(), MAX_LOG_EVENTS);
        assert_eq!(state.recent_events[0].message, "Event 59");
    }

    #[test]
    fn test_config_defaults() {
        let config = InGameRunnerConfig::default();
        assert!(!config.monitor_enabled);
        assert_eq!(config.poll_interval_ms, 2000);
        assert!(!config.auto_apply_mods);
    }

    #[test]
    fn test_consent_and_live_probe_defaults_and_preset_reference() {
        let _serial = super::super::game_adapter::test_serial_guard();
        assert!(require_consent(false).is_err());
        assert!(require_consent(true).is_ok());

        let status = build_status_snapshot_at(None, None).unwrap();
        assert!(!status.adapter_available);
        assert!(!status.auto_apply_mods);
        assert!(!status.consent_granted);

        // Metadata-only Presets must NEVER invoke adapter activation.
        let temp = std::env::temp_dir().join("laap-runner-preset-test");
        let _ = std::fs::create_dir_all(&temp);
        let mut preset_loadout = ResolvedLoadout {
            champion_id: 103,
            champion_name: "Ahri".into(),
            skin_or_mod_name: "Spirit Blossom Ahri".into(),
            source: "Preset".into(),
            mod_hash: None,
            file_count: 0,
            applied_in_game: false,
            limitation: "Preview only".into(),
        };
        let opts = super::super::game_adapter::ProbeOptions {
            platform_supported: true,
            active_match_running: false,
            lcu_build_hint: None,
            allow_path_discovery: false,
        };
        let (ev_type, _) = handle_champ_select_loadout_at(&temp, &mut preset_loadout, true, &opts);
        assert_eq!(ev_type, "PRESET_REFERENCE");
        assert!(!preset_loadout.applied_in_game);
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn resolve_loadout_generates_official_skin_overlay_and_handles_base_skin() {
        let _serial = super::super::game_adapter::test_serial_guard();
        let temp = std::env::temp_dir().join(format!(
            "laap-runner-skin-sel-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        let root = temp.join("root");
        let game_dir = temp.join("League");
        let final_champs = game_dir.join("Game").join("DATA").join("FINAL").join("Champions");
        std::fs::create_dir_all(&final_champs).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(game_dir.join("Game").join("League of Legends.exe"), b"MZ").unwrap();

        // Point game_path.json to our synthetic League folder
        super::storage::write(
            &root.join("game_path.json"),
            &serde_json::json!({ "leaguePath": game_dir.to_string_lossy() }),
        )
        .unwrap();

        // Write minimal PROP skin0 & skin1 entries inside Ahri.wad.client
        fn minimal_skin_prop(champ_skin_name: &str) -> Vec<u8> {
            let mut body = Vec::new();
            // path_hash (arbitrary) + u16 field_count (1)
            body.extend_from_slice(&0x1234_5678u32.to_le_bytes());
            body.extend_from_slice(&1u16.to_le_bytes());
            body.extend_from_slice(&super::super::skin_overlay::fnv1a_lower("championSkinName").to_le_bytes());
            body.push(0x10); // String
            body.extend_from_slice(&(champ_skin_name.len() as u16).to_le_bytes());
            body.extend_from_slice(champ_skin_name.as_bytes());

            let mut out = Vec::new();
            out.extend_from_slice(b"PROP");
            out.extend_from_slice(&2u32.to_le_bytes());
            out.extend_from_slice(&0u32.to_le_bytes());
            out.extend_from_slice(&1u32.to_le_bytes());
            out.extend_from_slice(&super::super::skin_overlay::fnv1a_lower("SkinCharacterDataProperties").to_le_bytes());
            out.extend_from_slice(&(body.len() as u32).to_le_bytes());
            out.extend_from_slice(&body);
            out
        }
        let wad = super::super::wad_tool::create_wad_v3(&[
            ("data/characters/ahri/skins/skin0.bin".into(), minimal_skin_prop("AhriSkin00")),
            ("data/characters/ahri/skins/skin1.bin".into(), minimal_skin_prop("AhriSkin01")),
        ])
        .unwrap();
        std::fs::write(final_champs.join("Ahri.wad.client"), wad).unwrap();

        // Select skin 1 -> resolves SkinSelection with generated overlay mod_hash
        let resp = apply_selected_skin_at(&root, 103, 103001, Some("Ahri")).unwrap();
        assert_eq!(resp["ok"], true);
        let mod_hash = resp["modHash"].as_str().expect("official skin overlay generated");
        assert!(!mod_hash.is_empty());

        let loadout = resolve_loadout_for_champion_at(&root, 103, "Ahri");
        assert_eq!(loadout.source, "SkinSelection");
        assert_eq!(loadout.mod_hash.as_deref(), Some(mod_hash));

        // Select base skin 0 -> resolves OfficialDefault (no overlay)
        super::super::skin_catalog::save_skin_selection_at(&root, 103, 103000, Some("Ahri")).unwrap();
        let default_loadout = resolve_loadout_for_champion_at(&root, 103, "Ahri");
        assert_eq!(default_loadout.source, "OfficialDefault");
        assert!(default_loadout.mod_hash.is_none());

        let _ = std::fs::remove_dir_all(&temp);
    }
}
