//! Local loopback HTTP + WebSocket bridge and decoupled Pengu Loader companion plugin.
//! Runs strictly on 127.0.0.1 with per-install bearer authentication, strict Origin validation,
//! protocol version negotiation, and an explicit IPC command allowlist.
//!
//! Local loopback bridge for LAAP companion integration (user-accepted risk configuration supported).

use super::{client_surfaces, game_path, in_game_runner, library, sandbox, storage};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener as StdTcpListener},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::AppHandle;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{broadcast, watch},
};
use zip::{write::SimpleFileOptions, ZipWriter};

const CONFIG_FILE: &str = "client_bridge_config.json";
const PLUGIN_FOLDER_NAME: &str = "laap-companion";
const RECEIPT_FILE_NAME: &str = ".laap-companion-receipt.json";
const MAX_HTTP_HEAD_BYTES: usize = 16 * 1024;
const MAX_HTTP_BODY_BYTES: usize = 64 * 1024;
const MAX_WS_FRAME_BYTES: usize = 64 * 1024;
const MAX_CONFIG_BYTES: u64 = 256 * 1024;
pub const BRIDGE_PROTOCOL_VERSION: u32 = 1;
pub const COMPANION_PLUGIN_VERSION: &str = "1.0.0";

const ALLOWED_CAPABILITIES: [&str; 5] = [
    "surfaces_css",
    "gameflow_status",
    "custom_mod_select",
    "select_skin",
    "restore_defaults",
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompanionReceiptFile {
    pub relative_path: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompanionPluginReceipt {
    pub plugins_dir: String,
    pub plugin_dir: String,
    pub plugin_version: String,
    pub installed_at: String,
    pub files: Vec<CompanionReceiptFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientBridgeConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub preferred_port: u16,
    #[serde(default)]
    pub token: String,
    pub custom_plugins_dir: Option<String>,
    #[serde(default)]
    pub plugin_consent_granted: bool,
    pub receipt: Option<CompanionPluginReceipt>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PenguDetectionInfo {
    pub platform_supported: bool,
    pub pengu_detected: bool,
    pub detected_plugins_dir: Option<String>,
    pub effective_plugins_dir: Option<String>,
    pub detail: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeClientPeerInfo {
    pub client_name: String,
    pub plugin_version: String,
    pub connected_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientBridgeStatus {
    pub running: bool,
    pub enabled: bool,
    pub port: u16,
    pub bridge_url: Option<String>,
    pub ws_url: Option<String>,
    pub protocol_version: u32,
    pub token_preview: String,
    pub active_clients: usize,
    pub last_handshake: Option<BridgeClientPeerInfo>,
    pub plugin_installed: bool,
    pub plugin_verified: bool,
    pub plugin_dir: Option<String>,
    pub custom_plugins_dir: Option<String>,
    pub plugin_consent_granted: bool,
    pub pengu: PenguDetectionInfo,
    pub capabilities: Vec<String>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatusSummary {
    pub running: bool,
    pub port: u16,
    pub active_clients: usize,
    pub plugin_installed: bool,
    pub plugin_dir: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCustomModSummary {
    pub sha256: String,
    pub display_name: String,
    pub author: String,
    pub version: String,
    pub format: String,
    pub matches_champion: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSkinOption {
    pub id: String,
    pub num: u32,
    pub name: String,
    pub chromas: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStateSnapshot {
    pub protocol_version: u32,
    pub capabilities: Vec<String>,
    pub global_surfaces_enabled: bool,
    pub active_surfaces_count: usize,
    pub surfaces_css: String,
    pub gameflow_phase: Option<String>,
    pub client_connected: bool,
    pub detected_champion_id: Option<u32>,
    pub detected_champion_name: Option<String>,
    pub match_apply_status: String,
    pub active_applied_mod_hash: Option<String>,
    pub adapter_available: bool,
    pub adapter_state: super::game_adapter::AdapterLifecycleState,
    pub available_custom_mods: Vec<BridgeCustomModSummary>,
    /// All known skins for the currently detected champion (from cached catalog).
    #[serde(default)]
    pub available_skins: Vec<BridgeSkinOption>,
    /// Currently selected official skin ID for the detected champion, if any.
    #[serde(default)]
    pub selected_skin_id: Option<u32>,
}

struct BridgeRuntime {
    shutdown: watch::Sender<bool>,
    notify: broadcast::Sender<String>,
    root: PathBuf,
    port: u16,
    connected_clients: Arc<AtomicUsize>,
    last_handshake: Arc<Mutex<Option<BridgeClientPeerInfo>>>,
    worker: Option<std::thread::JoinHandle<()>>,
}

static RUNTIME: OnceLock<Mutex<Option<BridgeRuntime>>> = OnceLock::new();
static CONFIG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn runtime_slot() -> &'static Mutex<Option<BridgeRuntime>> {
    RUNTIME.get_or_init(|| Mutex::new(None))
}

fn config_lock() -> &'static Mutex<()> {
    CONFIG_LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
pub(crate) fn test_serial_guard() -> std::sync::MutexGuard<'static, ()> {
    static TEST_SERIAL: Mutex<()> = Mutex::new(());
    TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn generate_token_hex() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("Failed generating bridge token: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let max_len = a.len().max(b.len());
    let mut diff = a.len() ^ b.len();
    for i in 0..max_len {
        let ab = *a.get(i).unwrap_or(&0);
        let bb = *b.get(i).unwrap_or(&0);
        diff |= (ab ^ bb) as usize;
    }
    diff == 0
}

fn token_preview(token: &str) -> String {
    if token.len() < 12 {
        return "unset".into();
    }
    format!("{}...{}", &token[..6], &token[token.len() - 4..])
}

/// FIPS 180-4 SHA-1 used exclusively for RFC 6455 Sec-WebSocket-Accept handshakes.
fn sha1_digest(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut padded = data.to_vec();
    padded.push(0x80);
    while (padded.len() % 64) != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in padded.chunks_exact(64) {
        let mut w = [0u32; 80];
        for (i, word) in chunk.chunks_exact(4).take(16).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let [mut a, mut b, mut c, mut d, mut e] = h;
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

pub fn compute_websocket_accept(key: &str) -> String {
    const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    let mut input = key.trim().as_bytes().to_vec();
    input.extend_from_slice(WS_GUID.as_bytes());
    STANDARD.encode(sha1_digest(&input))
}

pub fn is_allowed_origin(origin: Option<&str>) -> bool {
    let Some(raw) = origin else {
        return true;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.contains('@')
        || trimmed.chars().any(char::is_whitespace)
        || trimmed.eq_ignore_ascii_case("null")
    {
        return false;
    }
    let Some((scheme, rest)) = trimmed.split_once("://") else {
        return false;
    };
    let scheme_lower = scheme.to_ascii_lowercase();
    let authority = rest.split('/').next().unwrap_or("");
    if authority.is_empty() {
        return false;
    }
    let host = if authority.starts_with('[') {
        let Some(end) = authority.find(']') else {
            return false;
        };
        let suffix = &authority[end + 1..];
        if !suffix.is_empty()
            && !suffix
                .strip_prefix(':')
                .is_some_and(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
        {
            return false;
        }
        &authority[..=end]
    } else if let Some((h, port_str)) = authority.rsplit_once(':') {
        if port_str.is_empty() || !port_str.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        h
    } else {
        authority
    };
    let host_lower = host.to_ascii_lowercase();
    match scheme_lower.as_str() {
        "http" | "https" => matches!(host_lower.as_str(), "127.0.0.1" | "localhost" | "[::1]" | "riot"),
        "pengu" | "tauri" | "app" => matches!(host_lower.as_str(), "localhost" | "127.0.0.1" | "riot" | "laap"),
        _ => false,
    }
}

pub(crate) fn load_or_init_config_at(root: &Path) -> Result<ClientBridgeConfig, String> {
    let _guard = config_lock().lock().map_err(|_| "Bridge config lock failed.")?;
    let path = root.join(CONFIG_FILE);
    let mut cfg = storage::read::<ClientBridgeConfig>(&path, MAX_CONFIG_BYTES)?.unwrap_or_default();
    if cfg.token.len() != 64 || !cfg.token.bytes().all(|b| b.is_ascii_hexdigit()) {
        cfg.token = generate_token_hex()?;
        storage::write(&path, &cfg)?;
    }
    Ok(cfg)
}

pub(crate) fn save_config_at(root: &Path, cfg: &ClientBridgeConfig) -> Result<(), String> {
    let _guard = config_lock().lock().map_err(|_| "Bridge config lock failed.")?;
    storage::write(&root.join(CONFIG_FILE), cfg)
}

pub fn notify_state_changed() {
    let guard = match runtime_slot().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(rt) = &*guard {
        if let Ok(snapshot) = build_bridge_state_at(&rt.root) {
            if let Ok(payload) = serde_json::to_string(&serde_json::json!({
                "type": "state_update",
                "state": snapshot,
            })) {
                let _ = rt.notify.send(payload);
            }
        }
    }
}

fn sanitize_mods_for_bridge(
    root: &Path,
    detected_champion_name: Option<&str>,
) -> Vec<BridgeCustomModSummary> {
    let Ok(items) = library::list_installed_at(root) else {
        return Vec::new();
    };
    let champ_norm = detected_champion_name
        .unwrap_or("")
        .to_ascii_lowercase()
        .replace([' ', '\'', '.'], "");

    items
        .into_iter()
        .filter(|m| m.enabled && !m.manifest.mod_id.starts_with("official_"))
        .map(|m| {
            let name_lower = m.manifest.display_name.to_ascii_lowercase();
            let id_lower = m.manifest.mod_id.to_ascii_lowercase();
            let matches_champion = !champ_norm.is_empty()
                && (name_lower.contains(&champ_norm) || id_lower.contains(&champ_norm));
            BridgeCustomModSummary {
                sha256: m.manifest.sha256,
                display_name: m.manifest.display_name,
                author: m.manifest.author,
                version: m.manifest.version,
                format: m.format,
                matches_champion,
            }
        })
        .collect()
}

pub(crate) fn build_bridge_state_at(root: &Path) -> Result<BridgeStateSnapshot, String> {
    let surfaces_cfg = client_surfaces::load_config_at(root)?;
    let active_surfaces_count = surfaces_cfg.surfaces.iter().filter(|s| s.enabled).count();
    let surfaces_css = client_surfaces::render_surfaces_css(&surfaces_cfg);

    let (
        _phase,
        client_connected,
        gameflow_phase,
        detected_champion_id,
        detected_champion_name,
        match_apply_status,
        active_applied_mod_hash,
    ) = in_game_runner::current_bridge_observation();

    let probe = super::game_adapter::probe_adapter_at(
        root,
        &super::game_adapter::ProbeOptions {
            active_match_running: !super::game_adapter::is_safe_gameflow_phase(
                gameflow_phase.as_deref(),
            ),
            ..super::game_adapter::ProbeOptions::default()
        },
    );

    let available_custom_mods = sanitize_mods_for_bridge(root, detected_champion_name.as_deref());
    let available_skins = detected_champion_id
        .and_then(|id| super::skin_catalog::list_cached_skins_for_numeric_champion_at(root, id))
        .map(|info| {
            info.skins
                .into_iter()
                .map(|s| BridgeSkinOption {
                    id: s.id,
                    num: s.num,
                    name: s.name,
                    chromas: s.chromas,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let selected_skin_id = detected_champion_id
        .and_then(|id| super::skin_catalog::read_skin_selection_at(root, id))
        .map(|sel| sel.skin_id);

    Ok(BridgeStateSnapshot {
        protocol_version: BRIDGE_PROTOCOL_VERSION,
        capabilities: ALLOWED_CAPABILITIES.iter().map(|s| (*s).to_string()).collect(),
        global_surfaces_enabled: surfaces_cfg.global_enabled,
        active_surfaces_count,
        surfaces_css,
        gameflow_phase,
        client_connected,
        detected_champion_id,
        detected_champion_name,
        match_apply_status,
        active_applied_mod_hash,
        adapter_available: probe.available,
        adapter_state: probe.state,
        available_custom_mods,
        available_skins,
        selected_skin_id,
    })
}

fn dispatch_rpc_at(
    root: &Path,
    handshake_slot: &Arc<Mutex<Option<BridgeClientPeerInfo>>>,
    req_value: &serde_json::Value,
) -> (serde_json::Value, bool) {
    let Some(cmd) = req_value.get("command").and_then(|v| v.as_str()) else {
        return (
            serde_json::json!({ "ok": false, "error": "Missing command field." }),
            false,
        );
    };
    let req_id = req_value.get("requestId").cloned();

    let wrap_response = |mut body: serde_json::Value| {
        if let Some(id) = req_id.clone() {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("requestId".into(), id);
            }
        }
        body
    };

    match cmd {
        "hello" => {
            let client_ver = req_value
                .get("protocolVersion")
                .and_then(|v| v.as_u64())
                .unwrap_or(1) as u32;
            if client_ver != BRIDGE_PROTOCOL_VERSION {
                return (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "hello",
                        "error": format!("Unsupported protocolVersion {client_ver}; expected {BRIDGE_PROTOCOL_VERSION}.")
                    })),
                    false,
                );
            }
            let client_name = req_value
                .get("clientName")
                .and_then(|v| v.as_str())
                .unwrap_or("pengu-companion")
                .chars()
                .filter(|c| !c.is_control())
                .take(64)
                .collect::<String>();
            let plugin_version = req_value
                .get("pluginVersion")
                .and_then(|v| v.as_str())
                .unwrap_or(COMPANION_PLUGIN_VERSION)
                .chars()
                .filter(|c| !c.is_control())
                .take(32)
                .collect::<String>();

            if let Ok(mut slot) = handshake_slot.lock() {
                *slot = Some(BridgeClientPeerInfo {
                    client_name,
                    plugin_version,
                    connected_at: Utc::now().to_rfc3339(),
                });
            }

            match build_bridge_state_at(root) {
                Ok(state) => (
                    wrap_response(serde_json::json!({
                        "ok": true,
                        "command": "hello",
                        "protocolVersion": BRIDGE_PROTOCOL_VERSION,
                        "capabilities": ALLOWED_CAPABILITIES,
                        "state": state,
                    })),
                    false,
                ),
                Err(e) => (
                    wrap_response(serde_json::json!({ "ok": false, "command": "hello", "error": e })),
                    false,
                ),
            }
        }
        "get_state" => match build_bridge_state_at(root) {
            Ok(state) => (
                wrap_response(serde_json::json!({
                    "ok": true,
                    "command": "get_state",
                    "state": state,
                })),
                false,
            ),
            Err(e) => (
                wrap_response(serde_json::json!({ "ok": false, "command": "get_state", "error": e })),
                false,
            ),
        },
        "select_custom_mod" => {
            let Some(mod_sha256) = req_value.get("modSha256").and_then(|v| v.as_str()) else {
                return (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_custom_mod",
                        "error": "Missing modSha256."
                    })),
                    false,
                );
            };
            if !library::is_hash(mod_sha256) {
                return (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_custom_mod",
                        "error": "Invalid mod SHA-256."
                    })),
                    false,
                );
            }
            let items = match library::list_installed_at(root) {
                Ok(list) => list,
                Err(e) => {
                    return (
                        wrap_response(serde_json::json!({
                            "ok": false,
                            "command": "select_custom_mod",
                            "error": e
                        })),
                        false,
                    );
                }
            };
            if !items.iter().any(|m| m.manifest.sha256 == mod_sha256) {
                return (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_custom_mod",
                        "error": "Requested custom mod does not exist in Mod Library."
                    })),
                    false,
                );
            }
            // Policy restriction removed per user request (own risk).

            let gf_phase = in_game_runner::current_gameflow_phase();
            let mut opts = super::game_adapter::ProbeOptions::default();
            opts.active_match_running = opts.active_match_running
                || !super::game_adapter::is_safe_gameflow_phase(gf_phase.as_deref());

            match library::stage_overlay_at(root, Some(&[mod_sha256.to_string()]), &opts) {
                Ok(report) => {
                    if let Some(cid) = in_game_runner::current_bridge_observation().3 {
                        let _ = super::skin_catalog::clear_skin_selection_at(root, cid);
                        if report.applied_in_game {
                            let _ = in_game_runner::ensure_lcu_skin_slot_for_mod(None, cid);
                        }
                    }
                    let state_str = format!("{:?}", report.adapter_state).to_ascii_lowercase();
                    in_game_runner::record_external_apply_outcome(
                        mod_sha256,
                        report.applied_in_game,
                        report.deferred_reason.is_some(),
                        &state_str,
                    );
                    let updated_state = build_bridge_state_at(root).ok();
                    (
                        wrap_response(serde_json::json!({
                            "ok": report.applied_in_game || report.deferred_reason.is_some(),
                            "command": "select_custom_mod",
                            "appliedInGame": report.applied_in_game,
                            "deferredReason": report.deferred_reason,
                            "message": report.message,
                            "state": updated_state,
                        })),
                        true,
                    )
                }
                Err(e) => (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_custom_mod",
                        "error": e
                    })),
                    false,
                ),
            }
        }
        "select_skin" => {
            let skin_id = req_value
                .get("skinId")
                .or_else(|| req_value.get("skin_id"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let champion_id = req_value
                .get("championId")
                .or_else(|| req_value.get("champion_id"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let champion_name = req_value
                .get("championName")
                .or_else(|| req_value.get("champion_name"))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            if skin_id == 0 {
                return (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_skin",
                        "error": "Missing or invalid skinId."
                    })),
                    false,
                );
            }

            match in_game_runner::apply_selected_skin_at(
                root,
                champion_id,
                skin_id,
                champion_name.as_deref(),
            ) {
                Ok(mut result) => {
                    let updated_state = build_bridge_state_at(root).ok();
                    if let Some(obj) = result.as_object_mut() {
                        obj.insert("command".into(), serde_json::json!("select_skin"));
                        obj.insert("state".into(), serde_json::json!(updated_state));
                    }
                    (wrap_response(result), true)
                }
                Err(e) => (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "select_skin",
                        "error": e
                    })),
                    false,
                ),
            }
        }
        "restore_defaults" => {
            let gf_phase = in_game_runner::current_gameflow_phase();
            let mut opts = super::game_adapter::ProbeOptions::default();
            opts.active_match_running = opts.active_match_running
                || !super::game_adapter::is_safe_gameflow_phase(gf_phase.as_deref());

            match library::rollback_at(root, &opts) {
                Ok(report) => {
                    if let Some(cid) = in_game_runner::current_bridge_observation().3 {
                        let _ = super::skin_catalog::clear_skin_selection_at(root, cid);
                    }
                    in_game_runner::record_external_restore_outcome(
                        report.game_overlay_cleaned,
                        report.deferred_reason.is_some(),
                    );
                    let updated_state = build_bridge_state_at(root).ok();
                    (
                        wrap_response(serde_json::json!({
                            "ok": true,
                            "command": "restore_defaults",
                            "gameOverlayCleaned": report.game_overlay_cleaned,
                            "deferredReason": report.deferred_reason,
                            "message": report.message,
                            "state": updated_state,
                        })),
                        true,
                    )
                }
                Err(e) => (
                    wrap_response(serde_json::json!({
                        "ok": false,
                        "command": "restore_defaults",
                        "error": e
                    })),
                    false,
                ),
            }
        }
        other => (
            wrap_response(serde_json::json!({
                "ok": false,
                "command": other,
                "error": format!("Unsupported IPC command '{other}'.")
            })),
            false,
        ),
    }
}

async fn write_http_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    allowed_origin: Option<&str>,
) {
    let mut headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n",
        body.len()
    );
    if let Some(origin) = allowed_origin {
        headers.push_str(&format!(
            "Access-Control-Allow-Origin: {origin}\r\nVary: Origin\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, X-LAAP-Token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        ));
    }
    headers.push_str("\r\n");
    let _ = stream.write_all(headers.as_bytes()).await;
    let _ = stream.write_all(body).await;
    let _ = stream.flush().await;
}

async fn write_ws_frame(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> std::io::Result<()> {
    let mut frame = Vec::with_capacity(payload.len() + 10);
    frame.push(0x80 | (opcode & 0x0F));
    if payload.len() < 126 {
        frame.push(payload.len() as u8);
    } else if payload.len() <= u16::MAX as usize {
        frame.push(126);
        frame.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }
    frame.extend_from_slice(payload);
    stream.write_all(&frame).await?;
    stream.flush().await
}

async fn read_ws_frame(stream: &mut TcpStream) -> Result<Option<(u8, Vec<u8>)>, String> {
    let mut head = [0u8; 2];
    match stream.read_exact(&mut head).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.to_string()),
    }
    let fin = (head[0] & 0x80) != 0;
    let opcode = head[0] & 0x0F;
    let masked = (head[1] & 0x80) != 0;
    if !fin || !masked {
        return Err("WebSocket client frames must be unfragmented and masked.".into());
    }
    let mut len = (head[1] & 0x7F) as u64;
    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext).await.map_err(|e| e.to_string())?;
        len = u16::from_be_bytes(ext) as u64;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext).await.map_err(|e| e.to_string())?;
        len = u64::from_be_bytes(ext);
    }
    if len as usize > MAX_WS_FRAME_BYTES {
        return Err("WebSocket frame exceeds 64 KiB safety limit.".into());
    }
    let mut mask = [0u8; 4];
    stream.read_exact(&mut mask).await.map_err(|e| e.to_string())?;
    let mut payload = vec![0u8; len as usize];
    if len > 0 {
        stream
            .read_exact(&mut payload)
            .await
            .map_err(|e| e.to_string())?;
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
    }
    Ok(Some((opcode, payload)))
}

fn extract_bearer_or_query_token<'a>(
    target: &'a str,
    headers: &'a [(String, String)],
) -> Option<&'a str> {
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("authorization") {
            if let Some(rest) = v.trim().strip_prefix("Bearer ").or_else(|| v.trim().strip_prefix("bearer ")) {
                return Some(rest.trim());
            }
        }
        if k.eq_ignore_ascii_case("x-laap-token") {
            return Some(v.trim());
        }
    }
    if let Some((_, query)) = target.split_once('?') {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "token" {
                    return Some(v);
                }
            }
        }
    }
    None
}

async fn handle_connection(
    mut stream: TcpStream,
    root: PathBuf,
    expected_token: String,
    connected_clients: Arc<AtomicUsize>,
    handshake_slot: Arc<Mutex<Option<BridgeClientPeerInfo>>>,
    notify_tx: broadcast::Sender<String>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let mut buf = Vec::with_capacity(2048);
    let mut tmp = [0u8; 1024];
    let head_end = loop {
        if buf.len() >= MAX_HTTP_HEAD_BYTES {
            write_http_response(&mut stream, "431 Request Header Fields Too Large", "text/plain", b"Headers too large", None).await;
            return;
        }
        let read_res = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut tmp)).await;
        let Ok(Ok(n)) = read_res else {
            return;
        };
        if n == 0 {
            return;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos;
        }
    };

    let head_str = String::from_utf8_lossy(&buf[..head_end]);
    let mut lines = head_str.split("\r\n");
    let Some(req_line) = lines.next() else {
        return;
    };
    let mut parts = req_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");
    let path_only = target.split('?').next().unwrap_or("");

    let mut headers: Vec<(String, String)> = Vec::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }

    let origin_opt = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("origin"))
        .map(|(_, v)| v.as_str());
    if !is_allowed_origin(origin_opt) {
        write_http_response(
            &mut stream,
            "403 Forbidden",
            "application/json",
            br#"{"ok":false,"error":"Untrusted Origin header rejected."}"#,
            None,
        )
        .await;
        return;
    }

    if method.eq_ignore_ascii_case("OPTIONS") {
        write_http_response(&mut stream, "204 No Content", "text/plain", b"", origin_opt).await;
        return;
    }

    if method.eq_ignore_ascii_case("GET") && path_only == "/v1/health" {
        let body = serde_json::json!({
            "service": "laap-client-bridge",
            "protocolVersion": BRIDGE_PROTOCOL_VERSION,
            "running": true
        })
        .to_string();
        write_http_response(&mut stream, "200 OK", "application/json", body.as_bytes(), origin_opt).await;
        return;
    }

    let presented = extract_bearer_or_query_token(target, &headers).unwrap_or("");
    if !constant_time_eq(presented.as_bytes(), expected_token.as_bytes()) {
        write_http_response(
            &mut stream,
            "401 Unauthorized",
            "application/json",
            br#"{"ok":false,"error":"Missing or invalid LAAP bridge bearer token."}"#,
            origin_opt,
        )
        .await;
        return;
    }

    let is_ws = headers
        .iter()
        .any(|(k, v)| k.eq_ignore_ascii_case("upgrade") && v.eq_ignore_ascii_case("websocket"));

    if path_only == "/v1/ws" && is_ws {
        let Some(ws_key) = headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("sec-websocket-key"))
            .map(|(_, v)| v.as_str())
        else {
            write_http_response(&mut stream, "400 Bad Request", "text/plain", b"Missing Sec-WebSocket-Key", origin_opt).await;
            return;
        };
        let accept = compute_websocket_accept(ws_key);
        let handshake = format!(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
        );
        if stream.write_all(handshake.as_bytes()).await.is_err() {
            return;
        }
        let _ = stream.flush().await;

        connected_clients.fetch_add(1, Ordering::SeqCst);
        let mut notify_rx = notify_tx.subscribe();

        if let Ok(state) = build_bridge_state_at(&root) {
            let welcome = serde_json::json!({
                "type": "welcome",
                "protocolVersion": BRIDGE_PROTOCOL_VERSION,
                "capabilities": ALLOWED_CAPABILITIES,
                "state": state,
            })
            .to_string();
            if write_ws_frame(&mut stream, 0x1, welcome.as_bytes()).await.is_err() {
                connected_clients.fetch_sub(1, Ordering::SeqCst);
                return;
            }
        }

        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        let _ = write_ws_frame(&mut stream, 0x8, &[]).await;
                        break;
                    }
                }
                msg = notify_rx.recv() => {
                    if let Ok(text) = msg {
                        if write_ws_frame(&mut stream, 0x1, text.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                }
                frame_res = read_ws_frame(&mut stream) => {
                    match frame_res {
                        Ok(Some((0x1, payload))) => {
                            let resp_json = match serde_json::from_slice::<serde_json::Value>(&payload) {
                                Ok(req) => {
                                    let (resp, changed) = dispatch_rpc_at(&root, &handshake_slot, &req);
                                    if changed {
                                        if let Ok(snapshot) = build_bridge_state_at(&root) {
                                            let _ = notify_tx.send(serde_json::json!({
                                                "type": "state_update",
                                                "state": snapshot,
                                            }).to_string());
                                        }
                                    }
                                    resp
                                }
                                Err(e) => serde_json::json!({ "ok": false, "error": format!("Invalid JSON frame: {e}") }),
                            };
                            let text = resp_json.to_string();
                            if write_ws_frame(&mut stream, 0x1, text.as_bytes()).await.is_err() {
                                break;
                            }
                        }
                        Ok(Some((0x9, payload))) => {
                            if write_ws_frame(&mut stream, 0xA, &payload).await.is_err() {
                                break;
                            }
                        }
                        Ok(Some((0x8, _))) | Ok(None) | Err(_) => {
                            let _ = write_ws_frame(&mut stream, 0x8, &[]).await;
                            break;
                        }
                        Ok(Some(_)) => {}
                    }
                }
            }
        }

        connected_clients.fetch_sub(1, Ordering::SeqCst);
        return;
    }

    if method.eq_ignore_ascii_case("GET") && path_only == "/v1/state" {
        match build_bridge_state_at(&root) {
            Ok(state) => {
                let body = serde_json::to_string(&state).unwrap_or_else(|_| "{}".into());
                write_http_response(&mut stream, "200 OK", "application/json", body.as_bytes(), origin_opt).await;
            }
            Err(e) => {
                let body = serde_json::json!({ "ok": false, "error": e }).to_string();
                write_http_response(&mut stream, "500 Internal Server Error", "application/json", body.as_bytes(), origin_opt).await;
            }
        }
        return;
    }

    if method.eq_ignore_ascii_case("GET") && path_only == "/v1/surfaces.css" {
        match client_surfaces::load_config_at(&root) {
            Ok(cfg) => {
                let css = client_surfaces::render_surfaces_css(&cfg);
                write_http_response(&mut stream, "200 OK", "text/css; charset=utf-8", css.as_bytes(), origin_opt).await;
            }
            Err(e) => {
                write_http_response(&mut stream, "500 Internal Server Error", "text/plain", e.as_bytes(), origin_opt).await;
            }
        }
        return;
    }

    if method.eq_ignore_ascii_case("POST") && path_only == "/v1/rpc" {
        let content_len = headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
            .and_then(|(_, v)| v.parse::<usize>().ok())
            .unwrap_or(0);
        if content_len > MAX_HTTP_BODY_BYTES {
            write_http_response(&mut stream, "413 Payload Too Large", "application/json", br#"{"ok":false,"error":"RPC body too large."}"#, origin_opt).await;
            return;
        }
        let mut body = buf[head_end + 4..].to_vec();
        while body.len() < content_len {
            let mut chunk = vec![0u8; content_len - body.len()];
            match tokio::time::timeout(Duration::from_secs(5), stream.read_exact(&mut chunk)).await {
                Ok(Ok(_)) => body.extend_from_slice(&chunk),
                _ => {
                    write_http_response(&mut stream, "400 Bad Request", "application/json", br#"{"ok":false,"error":"Truncated RPC body."}"#, origin_opt).await;
                    return;
                }
            }
        }
        body.truncate(content_len);
        let (resp, changed) = match serde_json::from_slice::<serde_json::Value>(&body) {
            Ok(req) => dispatch_rpc_at(&root, &handshake_slot, &req),
            Err(e) => (
                serde_json::json!({ "ok": false, "error": format!("Invalid JSON body: {e}") }),
                false,
            ),
        };
        if changed {
            if let Ok(snapshot) = build_bridge_state_at(&root) {
                let _ = notify_tx.send(
                    serde_json::json!({ "type": "state_update", "state": snapshot }).to_string(),
                );
            }
        }
        let out = resp.to_string();
        write_http_response(&mut stream, "200 OK", "application/json", out.as_bytes(), origin_opt).await;
        return;
    }

    write_http_response(
        &mut stream,
        "404 Not Found",
        "application/json",
        br#"{"ok":false,"error":"Unknown LAAP bridge route."}"#,
        origin_opt,
    )
    .await;
}

fn spawn_bridge_worker(
    listener: StdTcpListener,
    root: PathBuf,
    token: String,
    port: u16,
) -> Result<BridgeRuntime, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed configuring loopback listener: {e}"))?;
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
    let (notify_tx, _) = broadcast::channel::<String>(32);
    let connected_clients = Arc::new(AtomicUsize::new(0));
    let last_handshake = Arc::new(Mutex::new(None));

    let clients_clone = connected_clients.clone();
    let hs_clone = last_handshake.clone();
    let notify_clone = notify_tx.clone();
    let root_clone = root.clone();

    let worker = std::thread::Builder::new()
        .name("laap-client-bridge".into())
        .spawn(move || {
            let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            else {
                return;
            };
            rt.block_on(async move {
                let Ok(async_listener) = TcpListener::from_std(listener) else {
                    return;
                };
                loop {
                    tokio::select! {
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                break;
                            }
                        }
                        accepted = async_listener.accept() => {
                            if let Ok((stream, _peer)) = accepted {
                                let root_c = root_clone.clone();
                                let token_c = token.clone();
                                let clients_c = clients_clone.clone();
                                let hs_c = hs_clone.clone();
                                let notify_c = notify_clone.clone();
                                let shutdown_c = shutdown_rx.clone();
                                tokio::spawn(async move {
                                    handle_connection(stream, root_c, token_c, clients_c, hs_c, notify_c, shutdown_c).await;
                                });
                            }
                        }
                    }
                }
            });
        })
        .map_err(|e| format!("Failed spawning loopback bridge thread: {e}"))?;

    Ok(BridgeRuntime {
        shutdown: shutdown_tx,
        notify: notify_tx,
        root,
        port,
        connected_clients,
        last_handshake,
        worker: Some(worker),
    })
}

pub fn start_bridge_at(root: &Path) -> Result<ClientBridgeStatus, String> {
    let mut cfg = load_or_init_config_at(root)?;
    {
        let mut guard = runtime_slot().lock().map_err(|_| "Bridge runtime lock failed.")?;
        if let Some(rt) = &*guard {
            if rt.worker.as_ref().is_some_and(|w| !w.is_finished()) && rt.root == root {
                return Ok(build_status_from_parts(root, &cfg, Some(rt)));
            }
        }
        if let Some(mut old) = guard.take() {
            let _ = old.shutdown.send(true);
            if let Some(w) = old.worker.take() {
                let _ = w.join();
            }
        }

        let bind_port = cfg.preferred_port;
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, bind_port);
        let listener = StdTcpListener::bind(addr).map_err(|e| {
            format!("Could not bind loopback bridge at 127.0.0.1:{bind_port}: {e}")
        })?;
        let actual_port = listener
            .local_addr()
            .map_err(|e| e.to_string())?
            .port();

        let runtime = spawn_bridge_worker(listener, root.to_path_buf(), cfg.token.clone(), actual_port)?;
        cfg.enabled = true;
        cfg.preferred_port = actual_port;
        save_config_at(root, &cfg)?;
        let _ = sync_installed_plugin_config_if_present(root, &mut cfg, actual_port);
        let status = build_status_from_parts(root, &cfg, Some(&runtime));
        *guard = Some(runtime);
        Ok(status)
    }
}

pub fn stop_bridge_at(root: &Path) -> Result<ClientBridgeStatus, String> {
    let mut cfg = load_or_init_config_at(root)?;
    cfg.enabled = false;
    save_config_at(root, &cfg)?;
    let mut guard = runtime_slot().lock().map_err(|_| "Bridge runtime lock failed.")?;
    if let Some(mut old) = guard.take() {
        let _ = old.shutdown.send(true);
        if let Some(w) = old.worker.take() {
            let _ = w.join();
        }
    }
    Ok(build_status_from_parts(root, &cfg, None))
}

pub fn detect_pengu_loader_at(custom_plugins_dir: Option<&str>) -> PenguDetectionInfo {
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(custom) = custom_plugins_dir.filter(|s| !s.trim().is_empty()) {
            let p = PathBuf::from(custom.trim());
            if game_path::ensure_safe_existing_entry(&p, true).is_ok() {
                return PenguDetectionInfo {
                    platform_supported: true,
                    pengu_detected: true,
                    detected_plugins_dir: Some(p.to_string_lossy().into_owned()),
                    effective_plugins_dir: Some(p.to_string_lossy().into_owned()),
                    detail: "Using user-configured Pengu Loader plugins directory; verify your platform Pengu Loader build.".into(),
                };
            }
        }
        return PenguDetectionInfo {
            platform_supported: false,
            pengu_detected: false,
            detected_plugins_dir: None,
            effective_plugins_dir: None,
            detail: "Pengu Loader Windows auto-detection applies on Windows; configure a compatible plugins folder or export the companion bundle ZIP.".into(),
        };
    }

    #[cfg(target_os = "windows")]
    {
        let mut detected: Option<PathBuf> = None;
        let mut candidates: Vec<PathBuf> = Vec::new();
        for env_key in ["LOCALAPPDATA", "APPDATA", "PROGRAMFILES"] {
            if let Ok(base) = std::env::var(env_key) {
                let pengu_dir = PathBuf::from(&base).join("Pengu Loader");
                candidates.push(pengu_dir.join("plugins"));
            }
        }
        for c in candidates {
            if game_path::ensure_safe_existing_entry(&c, true).is_ok() {
                detected = Some(c);
                break;
            }
        }

        let effective = custom_plugins_dir
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .filter(|p| game_path::ensure_safe_existing_entry(p, true).is_ok())
            .or_else(|| detected.clone());

        let pengu_detected = effective.is_some() || detected.is_some();
        let detail = if let Some(ref eff) = effective {
            format!("Pengu Loader plugins directory ready at {}.", eff.display())
        } else {
            "No local Pengu Loader plugins directory detected yet. Pick your Pengu Loader plugins folder or export the standalone companion plugin ZIP.".into()
        };

        PenguDetectionInfo {
            platform_supported: true,
            pengu_detected,
            detected_plugins_dir: detected.map(|p| p.to_string_lossy().into_owned()),
            effective_plugins_dir: effective.map(|p| p.to_string_lossy().into_owned()),
            detail,
        }
    }
}

pub fn render_companion_plugin_js() -> &'static str {
    r#"// LAAP Decoupled Companion Plugin for Pengu Loader (Open-Source, Loopback-Only)
// Connects ONLY to LAAP's authenticated local loopback WebSocket bridge (127.0.0.1).
// Applies LAAP client CSS surfaces and exposes an in-client selector for user-verified custom mods.

const STYLE_ELEMENT_ID = 'laap-client-surfaces-style';
const DRAWER_ELEMENT_ID = 'laap-champ-select-drawer';

let config = null;
let socket = null;
let reconnectTimer = null;
let reconnectDelayMs = 1500;
let latestState = null;

async function loadPluginConfig() {
  const res = await fetch(new URL('./laap-config.json', import.meta.url));
  if (!res.ok) throw new Error('Unable to read laap-config.json');
  return res.json();
}

function applySurfacesCss(state) {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID);
  if (!state || !state.globalSurfacesEnabled || !state.surfacesCss) {
    if (styleEl) styleEl.textContent = '';
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = state.surfacesCss;
}

function sendBridgeCommand(command, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    command,
    requestId: `${command}-${Date.now()}`,
    ...payload,
  }));
}

let skinSearchQuery = '';
let lastActionFeedback = '';

function renderChampSelectDrawer(state) {
  let drawer = document.getElementById(DRAWER_ELEMENT_ID);
  if (!state || state.gameflowPhase !== 'ChampSelect') {
    if (drawer) drawer.remove();
    return;
  }
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = DRAWER_ELEMENT_ID;
    drawer.style.cssText = 'position:fixed;right:18px;bottom:84px;z-index:99999;background:rgba(18,13,26,0.95);color:#f3e8ff;border:1px solid rgba(179,136,255,0.45);border-radius:10px;padding:10px 12px;width:308px;max-height:72vh;overflow:auto;font-family:sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.45);backdrop-filter:blur(8px);';
    document.body.appendChild(drawer);
  }

  const champ = state.detectedChampionName ? String(state.detectedChampionName) : 'Champion';
  const skins = Array.isArray(state.availableSkins) ? state.availableSkins : [];
  const mods = Array.isArray(state.availableCustomMods) ? state.availableCustomMods : [];
  const prioritizedMods = [...mods].sort((a, b) => Number(b.matchesChampion) - Number(a.matchesChampion)).slice(0, 6);
  const selectedSkinId = Number(state.selectedSkinId || 0) || null;

  drawer.replaceChildren();
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;font-weight:700;';
  header.textContent = 'LAAP Skins · ' + champ;
  drawer.appendChild(header);

  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:11px;color:#c3b5d2;margin-bottom:8px;line-height:1.35;';
  meta.textContent = lastActionFeedback
    ? lastActionFeedback
    : 'Status: ' + (state.matchApplyStatus || 'ready') + (state.activeAppliedModHash ? ' · overlay active' : '');
  drawer.appendChild(meta);

  const sectionTitle = (text) => {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:11px;font-weight:700;color:#ddd6fe;margin:8px 0 4px;';
    el.textContent = text;
    return el;
  };

  drawer.appendChild(sectionTitle('All skins'));
  if (skins.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;color:#a78bfa;margin-bottom:6px;';
    empty.textContent = 'Fetching champion skins automatically...';
    drawer.appendChild(empty);
  } else {
    if (skins.length > 6) {
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search skins...';
      search.value = skinSearchQuery;
      search.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:6px;padding:4px 8px;border-radius:6px;border:1px solid rgba(179,136,255,0.35);background:rgba(0,0,0,0.35);color:#fff;font-size:11px;outline:none;';
      search.oninput = (ev) => {
        skinSearchQuery = ev.target.value || '';
        renderChampSelectDrawer(latestState);
        const refocus = drawer.querySelector('input[type="text"]');
        if (refocus) {
          refocus.focus();
          refocus.setSelectionRange(skinSearchQuery.length, skinSearchQuery.length);
        }
      };
      drawer.appendChild(search);
    }
    const q = skinSearchQuery.trim().toLowerCase();
    const filteredSkins = q
      ? skins.filter((s) => String(s.name || '').toLowerCase().includes(q))
      : skins;
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'max-height:240px;overflow-y:auto;padding-right:2px;';
    for (const skin of filteredSkins) {
      const btn = document.createElement('button');
      const fullId = Number(skin.id) || (Number(state.detectedChampionId || 0) * 1000 + Number(skin.num || 0));
      const isSelected = selectedSkinId === fullId;
      btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:4px;padding:5px 8px;border-radius:6px;border:1px solid ' + (isSelected ? '#a855f7' : 'rgba(255,255,255,0.12)') + ';background:' + (isSelected ? 'rgba(168,85,247,0.28)' : 'rgba(255,255,255,0.06)') + ';color:#fff;cursor:pointer;font-size:11px;';
      const suffix = skin.chromas ? ' [chromas]' : '';
      btn.textContent = (isSelected ? '* ' : '') + (skin.num === 0 ? 'Default: ' : '') + String(skin.name || ('Skin ' + skin.num)) + suffix;
      btn.onclick = () => {
        lastActionFeedback = 'Applying ' + String(skin.name || ('Skin ' + skin.num)) + '...';
        renderChampSelectDrawer(latestState);
        sendBridgeCommand('select_skin', {
          skinId: fullId,
          championId: state.detectedChampionId || 0,
          championName: state.detectedChampionName || null,
        });
      };
      listWrap.appendChild(btn);
    }
    drawer.appendChild(listWrap);
  }

  drawer.appendChild(sectionTitle('Custom mods'));
  if (prioritizedMods.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;color:#a78bfa;';
    empty.textContent = 'No matching custom mods installed.';
    drawer.appendChild(empty);
  } else {
    for (const mod of prioritizedMods) {
      const btn = document.createElement('button');
      const active = state.activeAppliedModHash === mod.sha256;
      btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:4px;padding:5px 8px;border-radius:6px;border:1px solid ' + (active ? '#22c55e' : 'rgba(255,255,255,0.12)') + ';background:' + (active ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)') + ';color:#fff;cursor:pointer;font-size:11px;';
      btn.textContent = (active ? '* ' : '') + String(mod.displayName) + ' (' + String(mod.format) + ')';
      btn.onclick = () => sendBridgeCommand('select_custom_mod', { modSha256: mod.sha256 });
      drawer.appendChild(btn);
    }
  }

  const restoreBtn = document.createElement('button');
  restoreBtn.style.cssText = 'margin-top:6px;width:100%;padding:5px 8px;border-radius:6px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.15);color:#fecaca;cursor:pointer;font-size:11px;';
  restoreBtn.textContent = 'Restore Default / Clear Custom Mod';
  restoreBtn.onclick = () => sendBridgeCommand('restore_defaults');
  drawer.appendChild(restoreBtn);
}

function handleBridgeMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (typeof msg.error === 'string' && msg.error) {
    lastActionFeedback = 'Error: ' + msg.error;
  } else if (typeof msg.applyMessage === 'string' && msg.applyMessage) {
    lastActionFeedback = msg.applyMessage;
  } else if (typeof msg.message === 'string' && msg.message && msg.command) {
    lastActionFeedback = msg.message;
  }
  if (msg.state) {
    latestState = msg.state;
    applySurfacesCss(latestState);
    renderChampSelectDrawer(latestState);
  } else if (lastActionFeedback && latestState) {
    renderChampSelectDrawer(latestState);
  }
}

function connectSocket() {
  if (!config || !config.wsUrl || !config.token) return;
  try {
    const url = `${config.wsUrl}?token=${encodeURIComponent(config.token)}`;
    socket = new WebSocket(url);
    socket.onopen = () => {
      reconnectDelayMs = 1500;
      sendBridgeCommand('hello', {
        protocolVersion: config.protocolVersion || 1,
        clientName: 'pengu-loader',
        pluginVersion: config.pluginVersion || '1.0.0',
      });
    };
    socket.onmessage = (event) => handleBridgeMessage(event.data);
    socket.onclose = () => {
      reconnectTimer = setTimeout(connectSocket, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
    };
  } catch {
    reconnectTimer = setTimeout(connectSocket, reconnectDelayMs);
  }
}

export async function init() {
  try {
    config = await loadPluginConfig();
    connectSocket();
  } catch (err) {
    console.warn('[LAAP Companion] initialization skipped:', err);
  }
}
"#
}

fn render_plugin_config_json(port: u16, token: &str, protocol_version: u32) -> String {
    let bind_port = if port == 0 { 47620 } else { port };
    serde_json::to_string_pretty(&serde_json::json!({
        "protocolVersion": protocol_version,
        "pluginVersion": COMPANION_PLUGIN_VERSION,
        "bridgeUrl": format!("http://127.0.0.1:{bind_port}"),
        "wsUrl": format!("ws://127.0.0.1:{bind_port}/v1/ws"),
        "token": token,
    }))
    .unwrap_or_else(|_| "{}".into())
}

fn verify_installed_plugin(cfg: &ClientBridgeConfig) -> (bool, bool, Option<String>) {
    let Some(ref receipt) = cfg.receipt else {
        return (false, false, None);
    };
    let dir = Path::new(&receipt.plugin_dir);
    if game_path::ensure_safe_existing_entry(dir, true).is_err() {
        return (false, false, Some(receipt.plugin_dir.clone()));
    }
    let mut verified = !receipt.files.is_empty();
    for entry in &receipt.files {
        let p = dir.join(&entry.relative_path);
        match fs::read(&p) {
            Ok(bytes) => {
                if sha256_hex(&bytes) != entry.sha256 {
                    verified = false;
                }
            }
            Err(_) => {
                return (false, false, Some(receipt.plugin_dir.clone()));
            }
        }
    }
    (true, verified, Some(receipt.plugin_dir.clone()))
}

fn sync_installed_plugin_config_if_present(
    root: &Path,
    cfg: &mut ClientBridgeConfig,
    port: u16,
) -> Result<(), String> {
    let Some(ref receipt) = cfg.receipt.clone() else {
        return Ok(());
    };
    let plugin_dir = PathBuf::from(&receipt.plugin_dir);
    if game_path::ensure_safe_existing_entry(&plugin_dir, true).is_err() {
        return Ok(());
    }
    let cfg_bytes = render_plugin_config_json(port, &cfg.token, BRIDGE_PROTOCOL_VERSION).into_bytes();
    let cfg_path = plugin_dir.join("laap-config.json");
    sandbox::check_chain(&plugin_dir, false)?;
    storage::write_bytes(&cfg_path, &cfg_bytes)?;

    let mut updated_files = Vec::new();
    for file in &receipt.files {
        if file.relative_path == "laap-config.json" {
            updated_files.push(CompanionReceiptFile {
                relative_path: "laap-config.json".into(),
                sha256: sha256_hex(&cfg_bytes),
            });
        } else {
            updated_files.push(file.clone());
        }
    }
    let new_receipt = CompanionPluginReceipt {
        plugins_dir: receipt.plugins_dir.clone(),
        plugin_dir: receipt.plugin_dir.clone(),
        plugin_version: COMPANION_PLUGIN_VERSION.into(),
        installed_at: Utc::now().to_rfc3339(),
        files: updated_files,
    };
    let receipt_bytes = serde_json::to_vec_pretty(&new_receipt).map_err(|e| e.to_string())?;
    storage::write_bytes(&plugin_dir.join(RECEIPT_FILE_NAME), &receipt_bytes)?;
    cfg.receipt = Some(new_receipt);
    save_config_at(root, cfg)?;
    Ok(())
}

pub fn install_companion_plugin_at(
    root: &Path,
    explicit_plugins_dir: Option<&str>,
) -> Result<ClientBridgeStatus, String> {
    let mut cfg = load_or_init_config_at(root)?;
    if !cfg.plugin_consent_granted {
        return Err("Grant explicit companion plugin installation consent before writing files to the Pengu Loader plugins directory.".into());
    }

    let detection = detect_pengu_loader_at(
        explicit_plugins_dir.or(cfg.custom_plugins_dir.as_deref()),
    );
    let target_plugins_str = explicit_plugins_dir
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or(detection.effective_plugins_dir.clone())
        .ok_or_else(|| "Select a valid Pengu Loader plugins directory first.".to_string())?;

    let plugins_dir = PathBuf::from(&target_plugins_str);
    game_path::ensure_safe_existing_entry(&plugins_dir, true)?;
    sandbox::check_chain(&plugins_dir, false)?;

    let plugin_dir = plugins_dir.join(PLUGIN_FOLDER_NAME);
    if !plugin_dir.exists() {
        fs::create_dir(&plugin_dir).map_err(|e| format!("Failed creating plugin folder: {e}"))?;
    }
    game_path::ensure_safe_existing_entry(&plugin_dir, true)?;

    let active_port = {
        let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
        guard
            .as_ref()
            .filter(|rt| rt.root == root)
            .map(|rt| rt.port)
            .unwrap_or(cfg.preferred_port)
    };

    let js_bytes = render_companion_plugin_js().as_bytes().to_vec();
    let cfg_bytes = render_plugin_config_json(active_port, &cfg.token, BRIDGE_PROTOCOL_VERSION).into_bytes();

    storage::write_bytes(&plugin_dir.join("index.js"), &js_bytes)?;
    storage::write_bytes(&plugin_dir.join("laap-config.json"), &cfg_bytes)?;

    let receipt = CompanionPluginReceipt {
        plugins_dir: plugins_dir.to_string_lossy().into_owned(),
        plugin_dir: plugin_dir.to_string_lossy().into_owned(),
        plugin_version: COMPANION_PLUGIN_VERSION.into(),
        installed_at: Utc::now().to_rfc3339(),
        files: vec![
            CompanionReceiptFile {
                relative_path: "index.js".into(),
                sha256: sha256_hex(&js_bytes),
            },
            CompanionReceiptFile {
                relative_path: "laap-config.json".into(),
                sha256: sha256_hex(&cfg_bytes),
            },
        ],
    };
    let receipt_bytes = serde_json::to_vec_pretty(&receipt).map_err(|e| e.to_string())?;
    storage::write_bytes(&plugin_dir.join(RECEIPT_FILE_NAME), &receipt_bytes)?;

    cfg.custom_plugins_dir = Some(plugins_dir.to_string_lossy().into_owned());
    cfg.receipt = Some(receipt);
    save_config_at(root, &cfg)?;

    let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
    Ok(build_status_from_parts(root, &cfg, guard.as_ref()))
}

pub fn uninstall_companion_plugin_at(root: &Path) -> Result<ClientBridgeStatus, String> {
    let mut cfg = load_or_init_config_at(root)?;
    if let Some(receipt) = cfg.receipt.take() {
        let plugin_dir = PathBuf::from(&receipt.plugin_dir);
        if plugin_dir.exists() {
            game_path::ensure_safe_existing_entry(&plugin_dir, true)?;
            let disk_receipt_path = plugin_dir.join(RECEIPT_FILE_NAME);
            let verified_receipt = storage::read::<CompanionPluginReceipt>(&disk_receipt_path, 64 * 1024)?
                .unwrap_or(receipt.clone());

            for entry in &verified_receipt.files {
                if !library::safe_name(&entry.relative_path) {
                    continue;
                }
                let p = plugin_dir.join(&entry.relative_path);
                if p.is_file() && game_path::ensure_safe_existing_entry(&p, false).is_ok() {
                    let _ = fs::remove_file(&p);
                }
            }
            if disk_receipt_path.is_file() {
                let _ = fs::remove_file(&disk_receipt_path);
            }
            // Only removes empty laap-companion directory; retains unknown user files safely.
            let _ = fs::remove_dir(&plugin_dir);
        }
    }
    save_config_at(root, &cfg)?;
    let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
    Ok(build_status_from_parts(root, &cfg, guard.as_ref()))
}

pub fn export_companion_bundle_zip_at(root: &Path) -> Result<String, String> {
    let cfg = load_or_init_config_at(root)?;
    let active_port = {
        let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
        guard
            .as_ref()
            .filter(|rt| rt.root == root)
            .map(|rt| rt.port)
            .unwrap_or(cfg.preferred_port)
    };
    let readme = format!(
        "LAAP Companion Plugin (Decoupled Pengu Loader Extension)\n\n\
        1. Extract the 'laap-companion' folder into your Pengu Loader 'plugins' directory.\n\
        2. Enable the LAAP Loopback Bridge in LAAP Studio -> Client Surfaces.\n\
        3. Restart League Client UX if Pengu Loader does not hot-reload automatically.\n\n\
        Bridge Protocol: v{BRIDGE_PROTOCOL_VERSION}\n\
        Loopback Endpoint: http://127.0.0.1:{}\n",
        if active_port == 0 { 47620 } else { active_port }
    );

    let mut out = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut out);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("laap-companion/index.js", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(render_companion_plugin_js().as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("laap-companion/laap-config.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        render_plugin_config_json(active_port, &cfg.token, BRIDGE_PROTOCOL_VERSION).as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.start_file("laap-companion/README.txt", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(readme.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(out.into_inner()))
}

fn build_status_from_parts(
    root: &Path,
    cfg: &ClientBridgeConfig,
    runtime: Option<&BridgeRuntime>,
) -> ClientBridgeStatus {
    let rt = runtime.filter(|r| {
        r.root == root && r.worker.as_ref().is_some_and(|w| !w.is_finished())
    });
    let running = rt.is_some();
    let port = rt.map(|r| r.port).unwrap_or(cfg.preferred_port);
    let active_clients = rt
        .map(|r| r.connected_clients.load(Ordering::SeqCst))
        .unwrap_or(0);
    let last_handshake = rt.and_then(|r| {
        r.last_handshake
            .lock()
            .ok()
            .and_then(|g| g.clone())
    });

    let (plugin_installed, plugin_verified, plugin_dir) = verify_installed_plugin(cfg);
    let pengu = detect_pengu_loader_at(cfg.custom_plugins_dir.as_deref());

    let message = if running && active_clients > 0 {
        format!(
            "Loopback WebSocket bridge active on 127.0.0.1:{port} with {active_clients} connected client(s)."
        )
    } else if running && plugin_installed {
        format!(
            "Bridge running on 127.0.0.1:{port}; companion plugin installed. Waiting for League Client CEF connection."
        )
    } else if running {
        format!(
            "Bridge running on 127.0.0.1:{port}; install or export the companion Pengu plugin to connect from League Client."
        )
    } else if plugin_installed {
        "Companion plugin installed; start the loopback bridge to sync styles and custom mod selection.".into()
    } else {
        "In-client companion bridge is stopped.".into()
    };

    ClientBridgeStatus {
        running,
        enabled: cfg.enabled,
        port,
        bridge_url: running.then(|| format!("http://127.0.0.1:{port}")),
        ws_url: running.then(|| format!("ws://127.0.0.1:{port}/v1/ws")),
        protocol_version: BRIDGE_PROTOCOL_VERSION,
        token_preview: token_preview(&cfg.token),
        active_clients,
        last_handshake,
        plugin_installed,
        plugin_verified,
        plugin_dir,
        custom_plugins_dir: cfg.custom_plugins_dir.clone(),
        plugin_consent_granted: cfg.plugin_consent_granted,
        pengu,
        capabilities: ALLOWED_CAPABILITIES.iter().map(|s| (*s).to_string()).collect(),
        message,
    }
}

pub fn bridge_status_summary(root: &Path) -> BridgeStatusSummary {
    let Ok(cfg) = load_or_init_config_at(root) else {
        return BridgeStatusSummary {
            running: false,
            port: 0,
            active_clients: 0,
            plugin_installed: false,
            plugin_dir: None,
        };
    };
    let guard = runtime_slot().lock().ok();
    let rt = guard
        .as_ref()
        .and_then(|g| g.as_ref())
        .filter(|r| r.root == root && r.worker.as_ref().is_some_and(|w| !w.is_finished()));
    let (plugin_installed, _, plugin_dir) = verify_installed_plugin(&cfg);
    BridgeStatusSummary {
        running: rt.is_some(),
        port: rt.map(|r| r.port).unwrap_or(0),
        active_clients: rt
            .map(|r| r.connected_clients.load(Ordering::SeqCst))
            .unwrap_or(0),
        plugin_installed,
        plugin_dir,
    }
}

pub(crate) fn doctor_check_summary(root: &Path) -> (bool, String) {
    let Ok(cfg) = load_or_init_config_at(root) else {
        return (true, "In-client companion bridge is off (optional).".into());
    };
    let summary = bridge_status_summary(root);
    let _ = cfg;
    if summary.running && summary.active_clients > 0 {
        (
            true,
            format!(
                "Loopback companion bridge active at 127.0.0.1:{} ({} connected peer(s)).",
                summary.port, summary.active_clients
            ),
        )
    } else if summary.running && summary.plugin_installed {
        (
            true,
            format!(
                "Loopback companion bridge listening on 127.0.0.1:{}; Pengu companion plugin installed.",
                summary.port
            ),
        )
    } else {
        (
            true,
            "In-client Pengu companion bridge is idle (enable in Client Surfaces when needed).".into(),
        )
    }
}

#[tauri::command]
pub fn client_bridge_get_status(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    let cfg = load_or_init_config_at(&root)?;
    let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
    Ok(build_status_from_parts(&root, &cfg, guard.as_ref()))
}

#[tauri::command]
pub fn client_bridge_start(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    start_bridge_at(&root)
}

#[tauri::command]
pub fn client_bridge_stop(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    stop_bridge_at(&root)
}

#[tauri::command]
pub fn client_bridge_rotate_token(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    let was_running = {
        let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
        guard
            .as_ref()
            .is_some_and(|rt| rt.root == root && rt.worker.as_ref().is_some_and(|w| !w.is_finished()))
    };
    if was_running {
        stop_bridge_at(&root)?;
    }
    let mut cfg = load_or_init_config_at(&root)?;
    cfg.token = generate_token_hex()?;
    save_config_at(&root, &cfg)?;
    let port = cfg.preferred_port;
    let _ = sync_installed_plugin_config_if_present(&root, &mut cfg, port);
    if was_running {
        start_bridge_at(&root)
    } else {
        let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
        Ok(build_status_from_parts(&root, &cfg, guard.as_ref()))
    }
}

#[tauri::command]
pub fn client_bridge_set_plugins_dir(
    app: AppHandle,
    plugins_dir: Option<String>,
) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    let mut cfg = load_or_init_config_at(&root)?;
    if let Some(ref raw) = plugins_dir {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            game_path::ensure_safe_existing_entry(&p, true)?;
            cfg.custom_plugins_dir = Some(p.to_string_lossy().into_owned());
        } else {
            cfg.custom_plugins_dir = None;
        }
    } else {
        cfg.custom_plugins_dir = None;
    }
    save_config_at(&root, &cfg)?;
    let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
    Ok(build_status_from_parts(&root, &cfg, guard.as_ref()))
}

#[tauri::command]
pub fn client_bridge_pick_plugins_dir(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Select Pengu Loader plugins directory")
        .blocking_pick_folder()
    else {
        return client_bridge_get_status(app);
    };
    let path = picked
        .into_path()
        .map_err(|_| "Selected folder is not a local filesystem path.".to_string())?;
    client_bridge_set_plugins_dir(app, Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn client_bridge_set_consent(
    app: AppHandle,
    granted: bool,
) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    let mut cfg = load_or_init_config_at(&root)?;
    cfg.plugin_consent_granted = granted;
    save_config_at(&root, &cfg)?;
    let guard = runtime_slot().lock().map_err(|_| "Runtime lock failed.")?;
    Ok(build_status_from_parts(&root, &cfg, guard.as_ref()))
}

#[tauri::command]
pub fn client_bridge_install_plugin(
    app: AppHandle,
    plugins_dir: Option<String>,
) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    install_companion_plugin_at(&root, plugins_dir.as_deref())
}

#[tauri::command]
pub fn client_bridge_uninstall_plugin(app: AppHandle) -> Result<ClientBridgeStatus, String> {
    let root = storage::root(&app)?;
    uninstall_companion_plugin_at(&root)
}

#[tauri::command]
pub fn client_bridge_export_plugin_zip(app: AppHandle) -> Result<String, String> {
    let root = storage::root(&app)?;
    export_companion_bundle_zip_at(&root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn temp_root(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("laap-bridge-{tag}-{}", rand::random::<u64>()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn websocket_accept_matches_rfc6455_vector() {
        assert_eq!(
            compute_websocket_accept("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    #[test]
    fn origin_validation_blocks_untrusted_web_origins() {
        assert!(is_allowed_origin(None));
        assert!(is_allowed_origin(Some("http://127.0.0.1:1420")));
        assert!(is_allowed_origin(Some("https://riot:2999")));
        assert!(is_allowed_origin(Some("pengu://localhost")));
        assert!(!is_allowed_origin(Some("https://evil.example")));
        assert!(!is_allowed_origin(Some("http://127.0.0.1.evil.example")));
        assert!(!is_allowed_origin(Some("https://user@127.0.0.1:3000")));
        assert!(!is_allowed_origin(Some("null")));
    }

    fn send_http(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = Vec::new();
        let _ = s.read_to_end(&mut out);
        String::from_utf8_lossy(&out).into_owned()
    }

    #[test]
    fn loopback_bridge_enforces_origin_token_and_websocket_rpc() {
        let _serial = test_serial_guard();
        let root = temp_root("ws-rpc");
        let mut cfg = load_or_init_config_at(&root).unwrap();
        cfg.preferred_port = 0;
        save_config_at(&root, &cfg).unwrap();

        let status = start_bridge_at(&root).unwrap();
        assert!(status.running);
        assert!(status.port > 0);
        let token = load_or_init_config_at(&root).unwrap().token;

        // 1. Health check works without token
        let health = send_http(
            status.port,
            "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(health.starts_with("HTTP/1.1 200 OK"));
        assert!(!health.contains(&token));

        // 2. Untrusted origin rejected with 403
        let evil = send_http(
            status.port,
            "GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example\r\n\r\n",
        );
        assert!(evil.starts_with("HTTP/1.1 403 Forbidden"));

        // 3. Missing/wrong bearer token rejected with 401
        let unauth = send_http(
            status.port,
            "GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer wrong\r\n\r\n",
        );
        assert!(unauth.starts_with("HTTP/1.1 401 Unauthorized"));

        // 4. WebSocket handshake + masked hello/get_state RPC
        let mut ws = TcpStream::connect(("127.0.0.1", status.port)).unwrap();
        ws.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let upgrade_req = format!(
            "GET /v1/ws?token={token} HTTP/1.1\r\n\
             Host: 127.0.0.1\r\n\
             Origin: https://riot:2999\r\n\
             Upgrade: websocket\r\n\
             Connection: Upgrade\r\n\
             Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\
             Sec-WebSocket-Version: 13\r\n\r\n"
        );
        ws.write_all(upgrade_req.as_bytes()).unwrap();
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        let hdr_end = loop {
            if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                break pos + 4;
            }
            let n = ws.read(&mut chunk).unwrap();
            assert!(n > 0, "unexpected EOF waiting for HTTP 101");
            buf.extend_from_slice(&chunk[..n]);
        };
        let resp_str = String::from_utf8_lossy(&buf[..hdr_end]).into_owned();
        assert!(resp_str.contains("101 Switching Protocols"));
        assert!(resp_str.contains("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="));

        let mut leftover = buf.split_off(hdr_end);
        fn read_ws_frame_text(ws: &mut TcpStream, leftover: &mut Vec<u8>) -> String {
            let mut chunk = [0u8; 4096];
            loop {
                if leftover.len() >= 2 {
                    let b1 = leftover[1] & 0x7F;
                    let (hdr_len, payload_len) = if b1 == 126 {
                        if leftover.len() < 4 {
                            let n = ws.read(&mut chunk).unwrap();
                            assert!(n > 0);
                            leftover.extend_from_slice(&chunk[..n]);
                            continue;
                        }
                        (4usize, u16::from_be_bytes([leftover[2], leftover[3]]) as usize)
                    } else if b1 == 127 {
                        if leftover.len() < 10 {
                            let n = ws.read(&mut chunk).unwrap();
                            assert!(n > 0);
                            leftover.extend_from_slice(&chunk[..n]);
                            continue;
                        }
                        let mut len_bytes = [0u8; 8];
                        len_bytes.copy_from_slice(&leftover[2..10]);
                        (10usize, u64::from_be_bytes(len_bytes) as usize)
                    } else {
                        (2usize, b1 as usize)
                    };
                    if leftover.len() >= hdr_len + payload_len {
                        let rest = leftover.split_off(hdr_len + payload_len);
                        let frame_bytes = std::mem::replace(leftover, rest);
                        return String::from_utf8_lossy(&frame_bytes[hdr_len..hdr_len + payload_len])
                            .into_owned();
                    }
                }
                let n = ws.read(&mut chunk).unwrap();
                assert!(n > 0, "unexpected EOF waiting for WS frame");
                leftover.extend_from_slice(&chunk[..n]);
            }
        }

        let welcome_text = read_ws_frame_text(&mut ws, &mut leftover);
        assert!(welcome_text.contains("\"type\":\"welcome\""));

        // Send masked text frame: {"command":"hello","protocolVersion":1,"clientName":"test"}
        let payload = br#"{"command":"hello","protocolVersion":1,"clientName":"test"}"#;
        let mask = [0x11, 0x22, 0x33, 0x44];
        let mut frame = vec![0x81, 0x80 | (payload.len() as u8)];
        frame.extend_from_slice(&mask);
        for (i, b) in payload.iter().enumerate() {
            frame.push(b ^ mask[i % 4]);
        }
        ws.write_all(&frame).unwrap();
        let reply_text = read_ws_frame_text(&mut ws, &mut leftover);
        assert!(reply_text.contains("\"ok\":true"));
        assert!(reply_text.contains("\"command\":\"hello\""));

        drop(ws);
        stop_bridge_at(&root).unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn companion_plugin_install_and_uninstall_preserve_unrelated_user_files() {
        let _serial = test_serial_guard();
        let root = temp_root("plugin");
        let plugins_dir = temp_root("pengu-plugins");

        let mut cfg = load_or_init_config_at(&root).unwrap();
        assert!(install_companion_plugin_at(&root, Some(plugins_dir.to_str().unwrap())).is_err());

        cfg.plugin_consent_granted = true;
        save_config_at(&root, &cfg).unwrap();

        let status = install_companion_plugin_at(&root, Some(plugins_dir.to_str().unwrap())).unwrap();
        assert!(status.plugin_installed);
        assert!(status.plugin_verified);

        let plugin_folder = plugins_dir.join(PLUGIN_FOLDER_NAME);
        assert!(plugin_folder.join("index.js").is_file());
        assert!(plugin_folder.join("laap-config.json").is_file());
        assert!(plugin_folder.join(RECEIPT_FILE_NAME).is_file());

        // Add unrelated user file inside folder to confirm rollback never deletes user files
        let user_note = plugin_folder.join("user-custom-note.txt");
        fs::write(&user_note, b"keep me").unwrap();

        let after_uninstall = uninstall_companion_plugin_at(&root).unwrap();
        assert!(!after_uninstall.plugin_installed);
        assert!(!plugin_folder.join("index.js").exists());
        assert!(!plugin_folder.join("laap-config.json").exists());
        assert!(user_note.is_file());

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&plugins_dir);
    }

    #[test]
    fn rpc_rejects_invalid_hash_and_unknown_commands() {
        let _serial = test_serial_guard();
        let root = temp_root("policy");
        let hs = Arc::new(Mutex::new(None));
        let (resp, _) = dispatch_rpc_at(
            &root,
            &hs,
            &serde_json::json!({
                "command": "select_custom_mod",
                "modSha256": "invalid"
            }),
        );
        assert_eq!(resp["ok"], false);
        let (unknown, _) = dispatch_rpc_at(&root, &hs, &serde_json::json!({ "command": "hack_memory" }));
        assert_eq!(unknown["ok"], false);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rpc_select_skin_persists_selection_and_updates_snapshot() {
        let _serial = test_serial_guard();
        let root = temp_root("select-skin");
        let hs = Arc::new(Mutex::new(None));

        let (bad, _) = dispatch_rpc_at(
            &root,
            &hs,
            &serde_json::json!({ "command": "select_skin", "skinId": 0 }),
        );
        assert_eq!(bad["ok"], false);

        let (ok_resp, changed) = dispatch_rpc_at(
            &root,
            &hs,
            &serde_json::json!({
                "command": "select_skin",
                "championId": 103,
                "skinId": 103007,
                "championName": "Ahri"
            }),
        );
        assert!(changed);
        assert_eq!(ok_resp["ok"], true);
        assert_eq!(ok_resp["command"], "select_skin");
        assert_eq!(ok_resp["skinId"], 103007);
        assert_eq!(ok_resp["championId"], 103);

        let saved = super::super::skin_catalog::read_skin_selection_at(&root, 103).expect("skin selection saved");
        assert_eq!(saved.skin_id, 103007);

        let _ = fs::remove_dir_all(&root);
    }
}
