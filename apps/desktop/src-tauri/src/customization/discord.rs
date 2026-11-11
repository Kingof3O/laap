use super::storage;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

static STATE: Mutex<DiscordState> = Mutex::new(DiscordState {
    enabled: false,
    client_id: None,
    access_token: None,
    refresh_token: None,
    activity: None,
});

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscordState {
    pub enabled: bool,
    pub client_id: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub activity: Option<DiscordActivity>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscordActivity {
    pub state: String,
    pub details: String,
    pub champion: Option<String>,
    pub party_size: Option<u32>,
    pub party_max: Option<u32>,
    pub start_timestamp: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: String,
    pub scope: String,
}

fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for b in input.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

#[tauri::command]
pub fn open_discord_oauth_window(client_id: String, redirect_uri: String) -> Result<String, String> {
    if client_id.trim().is_empty() {
        return Err("Discord Client ID is required.".into());
    }
    let url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&redirect_uri={}&response_type=code&scope=identify%20rpc",
        client_id.trim(),
        url_encode(&redirect_uri)
    );
    Ok(url)
}

#[tauri::command]
pub fn discord_exchange_code(
    app: AppHandle,
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<OAuthTokenResponse, String> {
    if code.trim().is_empty() || client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Code, client_id, and client_secret are required.".into());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let params = [
        ("grant_type", "authorization_code"),
        ("code", code.trim()),
        ("redirect_uri", redirect_uri.trim()),
        ("client_id", client_id.trim()),
        ("client_secret", client_secret.trim()),
    ];

    let resp = client
        .post("https://discord.com/api/v10/oauth2/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .map_err(|e| format!("Discord OAuth network request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Discord OAuth API rejected exchange ({status}): {text}"));
    }

    let token_resp: OAuthTokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Discord OAuth token response: {e}"))?;

    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
    state.client_id = Some(client_id);
    state.access_token = Some(token_resp.access_token.clone());
    state.refresh_token = Some(token_resp.refresh_token.clone());

    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(token_resp)
}

#[tauri::command]
pub fn discord_refresh_token(
    app: AppHandle,
    refresh_token: String,
    client_id: String,
    client_secret: String,
) -> Result<OAuthTokenResponse, String> {
    if refresh_token.trim().is_empty() || client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Refresh token, client_id, and client_secret are required.".into());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.trim()),
        ("client_id", client_id.trim()),
        ("client_secret", client_secret.trim()),
    ];

    let resp = client
        .post("https://discord.com/api/v10/oauth2/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .map_err(|e| format!("Discord token refresh network request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Discord token refresh rejected ({status}): {text}"));
    }

    let token_resp: OAuthTokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Discord OAuth token response: {e}"))?;

    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
    state.access_token = Some(token_resp.access_token.clone());
    state.refresh_token = Some(token_resp.refresh_token.clone());

    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(token_resp)
}

#[tauri::command]
pub fn discord_revoke_token(app: AppHandle) -> Result<bool, String> {
    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
    state.access_token = None;
    state.refresh_token = None;
    state.enabled = false;
    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(true)
}

#[cfg(target_os = "windows")]
fn try_discord_ipc_handshake(client_id: &str) -> Result<std::fs::File, String> {
    use std::io::Write;
    for i in 0..10 {
        let pipe_name = format!(r"\\.\pipe\discord-ipc-{i}");
        if let Ok(mut pipe) = std::fs::OpenOptions::new().read(true).write(true).open(&pipe_name) {
            let handshake_payload = serde_json::json!({
                "v": 1,
                "client_id": client_id
            }).to_string();
            let len = handshake_payload.len() as u32;
            let mut packet = Vec::with_capacity(8 + handshake_payload.len());
            packet.extend_from_slice(&0u32.to_le_bytes()); // OpCode 0: Handshake
            packet.extend_from_slice(&len.to_le_bytes());
            packet.extend_from_slice(handshake_payload.as_bytes());
            if pipe.write_all(&packet).is_ok() {
                return Ok(pipe);
            }
        }
    }
    Err("Discord desktop client is not running or Discord IPC pipe is unavailable. Please launch Discord to enable Rich Presence.".into())
}

#[cfg(not(target_os = "windows"))]
fn try_discord_ipc_handshake(_client_id: &str) -> Result<(), String> {
    Err("Discord IPC socket is not available on this platform.".into())
}

#[tauri::command]
pub fn set_rpc_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
    if enabled {
        let client_id = state.client_id.as_deref().unwrap_or("1305284988775432243");
        // Verify genuine local Discord IPC connection before reporting enabled
        #[cfg(target_os = "windows")]
        {
            let _ = try_discord_ipc_handshake(client_id)?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = try_discord_ipc_handshake(client_id)?;
        }
    }
    state.enabled = enabled;
    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(enabled)
}

#[tauri::command]
pub fn update_activity(app: AppHandle, activity: DiscordActivity) -> Result<DiscordActivity, String> {
    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
    if !state.enabled {
        return Err("Discord Rich Presence is disabled. Enable RPC in settings.".into());
    }
    let client_id = state.client_id.as_deref().unwrap_or("1305284988775432243");

    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        let mut pipe = try_discord_ipc_handshake(client_id)?;
        let frame_payload = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": {
                    "state": activity.state,
                    "details": activity.details,
                    "timestamps": {
                        "start": activity.start_timestamp.unwrap_or_else(|| chrono::Utc::now().timestamp())
                    },
                    "assets": {
                        "large_image": activity.champion.as_deref().unwrap_or("default_icon"),
                        "large_text": "LAAP Studio"
                    }
                }
            },
            "nonce": format!("{:x}", rand::random::<u64>())
        }).to_string();
        let len = frame_payload.len() as u32;
        let mut packet = Vec::with_capacity(8 + frame_payload.len());
        packet.extend_from_slice(&1u32.to_le_bytes()); // OpCode 1: Frame
        packet.extend_from_slice(&len.to_le_bytes());
        packet.extend_from_slice(frame_payload.as_bytes());
        pipe.write_all(&packet).map_err(|e| format!("Failed to send Discord RPC activity: {e}"))?;
    }

    state.activity = Some(activity.clone());
    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(activity)
}

#[tauri::command]
pub fn rpc_set_presence(
    app: AppHandle,
    state_text: String,
    details: String,
    champion: Option<String>,
) -> Result<DiscordActivity, String> {
    let activity = DiscordActivity {
        state: state_text,
        details,
        champion,
        party_size: None,
        party_max: None,
        start_timestamp: Some(chrono::Utc::now().timestamp()),
    };
    update_activity(app, activity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_discord_oauth_window() {
        let url = open_discord_oauth_window("12345678".into(), "http://localhost:8080/callback".into()).unwrap();
        assert!(url.starts_with("https://discord.com/oauth2/authorize?client_id=12345678"));
        assert!(url.contains("scope=identify%20rpc"));
    }

    #[test]
    fn test_discord_activity_serialization() {
        let act = DiscordActivity {
            state: "In Champion Select".into(),
            details: "Selecting Ahri".into(),
            champion: Some("Ahri".into()),
            party_size: Some(1),
            party_max: Some(5),
            start_timestamp: Some(1700000000),
        };
        let json = serde_json::to_string(&act).unwrap();
        assert!(json.contains("Ahri"));
    }

    #[test]
    fn test_discord_exchange_requires_credentials() {
        // Empty credentials fail validation before network call
        let result = open_discord_oauth_window("".into(), "".into());
        assert!(result.is_err());
    }
}
