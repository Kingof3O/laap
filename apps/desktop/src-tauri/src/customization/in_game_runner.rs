//! Read-only League client gameflow and Champ Select reference monitor.
//! When explicitly consented by the user, monitors League client gameflow (LCU) via
//! local loopback, detects the currently picked champion in Champion Select, and looks
//! up matching local presets or Mod Library packages purely as a read-only reference.
//!
//! LAAP never hooks game memory, bypasses skin/validator checks, unlocks unowned Riot
//! skins, or spawns unapproved game patchers.

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

const CONFIG_FILE: &str = "in_game_runner_config.json";
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
    pub source: String, // "ModLibrary", "Preset", or "Default"
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
    pub recent_events: Vec<RunnerEvent>,
    pub error_message: Option<String>,
}

struct RunnerState {
    phase: RunnerPhase,
    client_connected: bool,
    gameflow_phase: Option<String>,
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

/// Looks up any saved Mod Library package or Preset for a champion purely for read-only reference.
/// Never applies skins or mods in League of Legends.
pub fn resolve_loadout_for_champion(
    app: &AppHandle,
    champion_id: u32,
    champ_name: &str,
) -> ResolvedLoadout {
    // 1. Check Mod Library for enabled local packages targeting this champion
    if let Ok(installed) = super::library::mod_list(app.clone()) {
        let champ_lower = champ_name.to_lowercase().replace([' ', '\'', '.'], "");
        for item in installed {
            if !item.enabled {
                continue;
            }
            let targets_id = item.manifest.champion_ids.contains(&champion_id);
            let name_lower = item.manifest.display_name.to_lowercase();
            let mod_id_lower = item.manifest.mod_id.to_lowercase();
            let targets_name =
                !champ_lower.is_empty() && (name_lower.contains(&champ_lower) || mod_id_lower.contains(&champ_lower));

            if targets_id || targets_name {
                return ResolvedLoadout {
                    champion_id,
                    champion_name: champ_name.to_string(),
                    skin_or_mod_name: item.manifest.display_name,
                    source: "ModLibrary".to_string(),
                    mod_hash: Some(item.manifest.sha256),
                    file_count: item.manifest.files.len(),
                    applied_in_game: false,
                    limitation: "Cached in LAAP Mod Library only; no approved live League overlay adapter is active.".to_string(),
                };
            }
        }
    }

    // 2. Check Presets for this champion (metadata preference only)
    if let Ok(root) = storage::root(app) {
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
                    return ResolvedLoadout {
                        champion_id,
                        champion_name: champ_name.to_string(),
                        skin_or_mod_name: preset.name,
                        source: "Preset".to_string(),
                        mod_hash: None,
                        file_count: 0,
                        applied_in_game: false,
                        limitation: "Catalog preset metadata only; contains no 3D/texture files and LAAP cannot unlock or inject official Riot skins in-game.".to_string(),
                    };
                }
            }
        }
    }

    // 3. No matching preset or mod
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

pub(crate) fn handle_champ_select_loadout_at(
    customization_root: &std::path::Path,
    loadout: &mut ResolvedLoadout,
    auto_apply_mods: bool,
    opts: &super::game_adapter::ProbeOptions,
) -> (&'static str, String) {
    if loadout.source == "Preset" {
        // Policy invariant: metadata presets must NEVER invoke external game adapters.
        if let Ok(tracker) = get_tracker().lock().map(|t| t.clone()) {
            if tracker.active_applied_mod_hash.is_some() {
                let _ = super::library::rollback_at(customization_root, opts);
                if let Ok(mut w) = get_tracker().lock() {
                    w.active_applied_mod_hash = None;
                    w.pending_restore_after_match = false;
                    w.match_apply_status = "preset-excluded".into();
                }
            } else if let Ok(mut w) = get_tracker().lock() {
                w.match_apply_status = "preset-excluded".into();
            }
        }
        return (
            "PRESET_REFERENCE",
            format!(
                "Champion detected: {} (ID {}). Saved preset '{}' is preview metadata only (not applied in League).",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            ),
        );
    }

    if loadout.source != "ModLibrary" {
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
        return (
            "MOD_REFERENCE",
            format!(
                "Champion detected: {} (ID {}). Matching mod '{}' has no package hash.",
                loadout.champion_name, loadout.champion_id, loadout.skin_or_mod_name
            ),
        );
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
                        "Champion detected: {} (ID {}). Activated custom mod '{}': {}",
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
                        "Custom mod '{}' could not be activated: {}",
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
                    "Failed activating custom mod '{}' for {}: {err}",
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

    let root = super::storage::root(app).ok();
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
            let mut new_selection: Option<(u32, String, ResolvedLoadout, (&'static str, String))> =
                None;
            if let Some(champ_id) = picked_champ {
                if previous_champ_id != Some(champ_id) {
                    let champ_name = champion_name_from_id(champ_id);
                    let mut loadout = resolve_loadout_for_champion(app, champ_id, champ_name);
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
                    new_selection = Some((champ_id, champ_name.to_string(), loadout, ev));
                }
            }

            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val);
                state.phase = RunnerPhase::ChampSelect;
                if let Some((champ_id, champ_name, loadout, (ev_type, ev_msg))) = new_selection {
                    state.detected_champion_id = Some(champ_id);
                    state.detected_champion_name = Some(champ_name);
                    state.add_event(ev_type, &ev_msg);
                    state.resolved_loadout = Some(loadout);
                }
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
            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val.clone());
                state.phase = RunnerPhase::InMatch;
                if previous_phase.as_deref() != Some(phase_val.as_str()) {
                    let msg = if had_active {
                        "Match active in League with custom ModLibrary overlay prepared in ChampSelect. Adapter calls paused until EndOfGame/Lobby."
                    } else {
                        "Match active in League. No adapter operations run during live matches."
                    };
                    state.add_event("IN_MATCH", msg);
                }
            }
        }
        "EndOfGame" | "PreEndOfGame" | "WaitingForStats" | "Lobby" | "None" => {
            let cleanup_ev = root
                .as_deref()
                .and_then(|r| handle_post_match_cleanup_at(r, &phase_val, &probe_opts));

            if let Ok(mut state) = state_arc.lock() {
                state.client_connected = true;
                state.error_message = None;
                state.gameflow_phase = Some(phase_val.clone());
                if previous_phase.as_deref() != Some(phase_val.as_str())
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
}

impl Default for ApplyTrackerState {
    fn default() -> Self {
        Self {
            lcu_build_hint: None,
            match_apply_status: "idle".into(),
            active_applied_mod_hash: None,
            pending_restore_after_match: false,
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
        if !loadout.source.eq_ignore_ascii_case("ModLibrary") {
            return Err(
                "Matched entry is Preset metadata only. Policy permits activating verified custom .fantome/.modpkg ModLibrary packages only."
                    .into(),
            );
        }
        let target_hash = loadout
            .mod_hash
            .ok_or_else(|| "Matched ModLibrary entry has no package SHA-256.".to_string())?;

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
    fn test_consent_and_live_probe_defaults_and_preset_exclusion() {
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
}
