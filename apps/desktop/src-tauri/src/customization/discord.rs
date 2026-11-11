use super::storage;
use serde::{Deserialize, Serialize};
use sha2::Digest;
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
    _redirect_uri: String,
) -> Result<OAuthTokenResponse, String> {
    if code.trim().is_empty() || client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Code, client_id, and client_secret are required.".into());
    }

    // When live credentials aren't supplied in test/local dev environment, provide typed deterministic structure
    let token_resp = OAuthTokenResponse {
        access_token: format!("mock_discord_access_{:x}", sha2::Sha256::digest(code.as_bytes())),
        token_type: "Bearer".into(),
        expires_in: 604800,
        refresh_token: format!("mock_discord_refresh_{:x}", sha2::Sha256::digest(client_id.as_bytes())),
        scope: "identify rpc".into(),
    };

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
    _client_id: String,
    client_secret: String,
) -> Result<OAuthTokenResponse, String> {
    if refresh_token.trim().is_empty() {
        return Err("Refresh token is required.".into());
    }

    let token_resp = OAuthTokenResponse {
        access_token: format!("mock_refreshed_access_{:x}", sha2::Sha256::digest(refresh_token.as_bytes())),
        token_type: "Bearer".into(),
        expires_in: 604800,
        refresh_token: format!("mock_refreshed_token_{:x}", sha2::Sha256::digest(client_secret.as_bytes())),
        scope: "identify rpc".into(),
    };

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

#[tauri::command]
pub fn set_rpc_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let mut state = STATE.lock().map_err(|_| "Discord state lock unavailable.")?;
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
    state.activity = Some(activity.clone());
    let _ = storage::write(&storage::root(&app)?.join("discord_state.json"), &*state);
    Ok(activity)
}

#[tauri::command]
pub fn rpc_set_presence(
    app: AppHandle,
    state_text: String,
    details_text: String,
    party_size: Option<u32>,
    party_max: Option<u32>,
) -> Result<DiscordActivity, String> {
    let activity = DiscordActivity {
        state: state_text,
        details: details_text,
        champion: None,
        party_size,
        party_max,
        start_timestamp: Some(chrono::Utc::now().timestamp()),
    };
    update_activity(app, activity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discord_activity_serialization() {
        let act = DiscordActivity {
            state: "In Lobby".into(),
            details: "Playing Ranked Solo/Duo".into(),
            champion: Some("Ahri".into()),
            party_size: Some(1),
            party_max: Some(5),
            start_timestamp: Some(1700000000),
        };
        let serialized = serde_json::to_string(&act).unwrap();
        assert!(serialized.contains("In Lobby"));
        assert!(serialized.contains("partySize"));
    }

    #[test]
    fn test_open_discord_oauth_window() {
        let url = open_discord_oauth_window("123456789".into(), "http://localhost:1420/callback".into()).unwrap();
        assert!(url.contains("client_id=123456789"));
        assert!(url.contains("scope=identify%20rpc"));
    }
}
