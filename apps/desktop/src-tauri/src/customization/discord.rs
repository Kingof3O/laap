//! Presence-only IPC: no OAuth tokens or client secrets are accepted or persisted.
use super::storage;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;
trait Ipc: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Ipc for T {}
static CONNECTION: Mutex<Option<Box<dyn Ipc>>> = Mutex::const_new(None);
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    client_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscordActivity {
    pub state: String,
    pub details: String,
    pub champion: Option<String>,
    pub party_size: Option<u32>,
    pub party_max: Option<u32>,
    pub start_timestamp: Option<i64>,
}
fn valid_client(id: &str) -> bool {
    (8..=24).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}
fn load(app: &AppHandle) -> Result<Config, String> {
    let path = storage::root(app)?.join("discord_state.json");
    let cfg = storage::read::<Config>(&path, 64 * 1024)?.unwrap_or_default();
    // Non-secret config replaces the legacy JSON, removing old access/refresh token fields.
    storage::write(&path, &cfg)?;
    Ok(cfg)
}
pub(crate) fn scrub_legacy_config(app: &AppHandle) -> Result<(), String> {
    load(app).map(|_| ())
}
#[tauri::command]
pub async fn discord_configure(app: AppHandle, client_id: String) -> Result<(), String> {
    if !valid_client(&client_id) {
        return Err("A numeric Discord application ID is required.".into());
    }
    *CONNECTION.lock().await = None;
    storage::write(
        &storage::root(&app)?.join("discord_state.json"),
        &Config {
            client_id: Some(client_id),
        },
    )
}
async fn write_frame(stream: &mut dyn Ipc, op: u32, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    stream.write_u32_le(op).await.map_err(|e| e.to_string())?;
    stream
        .write_u32_le(bytes.len() as u32)
        .await
        .map_err(|e| e.to_string())?;
    stream.write_all(&bytes).await.map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}
async fn read_frame(stream: &mut dyn Ipc) -> Result<Value, String> {
    for _ in 0..8 {
        let op = stream
            .read_u32_le()
            .await
            .map_err(|_| "Discord IPC disconnected")?;
        let size = stream
            .read_u32_le()
            .await
            .map_err(|_| "Invalid Discord IPC frame")?;
        if size > 64 * 1024 {
            return Err("Discord IPC frame exceeds limit".into());
        }
        let mut bytes = vec![0; size as usize];
        stream
            .read_exact(&mut bytes)
            .await
            .map_err(|_| "Truncated Discord IPC frame")?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid Discord IPC JSON")?;
        if op == 3 {
            write_frame(stream, 4, &value).await?;
            continue;
        }
        if op != 1 || value["evt"] == "ERROR" {
            return Err("Discord rejected the presence command".into());
        }
        return Ok(value);
    }
    Err("Discord IPC did not acknowledge".into())
}
async fn handshake(stream: &mut dyn Ipc, client_id: &str) -> Result<(), String> {
    write_frame(stream, 0, &json!({"v":1,"client_id":client_id})).await?;
    if read_frame(stream).await?["evt"] != "READY" {
        return Err("Discord READY acknowledgement missing".into());
    }
    Ok(())
}
async fn connect(id: &str) -> Result<Box<dyn Ipc>, String> {
    for i in 0..10 {
        #[cfg(windows)]
        if let Ok(mut pipe) = tokio::net::windows::named_pipe::ClientOptions::new()
            .open(format!(r"\\?\pipe\discord-ipc-{i}"))
        {
            if tokio::time::timeout(Duration::from_secs(2), handshake(&mut pipe, id))
                .await
                .map_err(|_| "Discord handshake timed out")?
                .is_ok()
            {
                return Ok(Box::new(pipe));
            }
        }
        #[cfg(unix)]
        for root in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
            .iter()
            .filter_map(|n| std::env::var(n).ok())
            .chain(std::iter::once("/tmp".into()))
        {
            if let Ok(mut pipe) = tokio::net::UnixStream::connect(
                std::path::Path::new(&root).join(format!("discord-ipc-{i}")),
            )
            .await
            {
                if tokio::time::timeout(Duration::from_secs(2), handshake(&mut pipe, id))
                    .await
                    .map_err(|_| "Discord handshake timed out")?
                    .is_ok()
                {
                    return Ok(Box::new(pipe));
                }
            }
        }
    }
    Err("Discord desktop IPC is unavailable. Start Discord and retry.".into())
}
#[tauri::command]
pub async fn set_rpc_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let cfg = load(&app)?;
    let mut connection = CONNECTION.lock().await;
    if !enabled {
        *connection = None;
        return Ok(false);
    }
    let id = cfg
        .client_id
        .filter(|v| valid_client(v))
        .ok_or("Configure your Discord application ID first")?;
    *connection = Some(connect(&id).await?);
    Ok(true)
}
#[tauri::command]
pub async fn discord_revoke_token(app: AppHandle) -> Result<bool, String> {
    *CONNECTION.lock().await = None;
    storage::write(
        &storage::root(&app)?.join("discord_state.json"),
        &Config::default(),
    )?;
    Ok(true)
}
async fn send_activity(
    stream: &mut dyn Ipc,
    activity: Option<&DiscordActivity>,
) -> Result<(), String> {
    let nonce = format!("{:016x}", rand::random::<u64>());
    let act = activity.map(
        |a| json!({"state":a.state,"details":a.details,"timestamps":{"start":a.start_timestamp}}),
    );
    write_frame(stream,1,&json!({"cmd":"SET_ACTIVITY","nonce":nonce,"args":{"pid":std::process::id(),"activity":act}})).await?;
    for _ in 0..8 {
        let value = read_frame(stream).await?;
        if value["nonce"] == nonce && value["cmd"] == "SET_ACTIVITY" {
            return Ok(());
        }
    }
    Err("Discord activity acknowledgement missing".into())
}
#[tauri::command]
pub async fn update_activity(activity: DiscordActivity) -> Result<DiscordActivity, String> {
    if activity.state.len() > 128
        || activity.details.len() > 128
        || activity
            .state
            .chars()
            .chain(activity.details.chars())
            .any(char::is_control)
    {
        return Err("Invalid activity text".into());
    }
    let mut guard = CONNECTION.lock().await;
    let stream = guard.as_mut().ok_or("Discord Rich Presence is disabled")?;
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        send_activity(stream.as_mut(), Some(&activity)),
    )
    .await
    .map_err(|_| "Discord activity acknowledgement timed out".to_string())
    .and_then(|v| v);
    if result.is_err() {
        *guard = None;
    }
    result?;
    Ok(activity)
}
#[tauri::command]
pub async fn rpc_set_presence(
    state_text: String,
    details: String,
    champion: Option<String>,
) -> Result<DiscordActivity, String> {
    update_activity(DiscordActivity {
        state: state_text,
        details,
        champion,
        party_size: None,
        party_max: None,
        start_timestamp: Some(chrono::Utc::now().timestamp()),
    })
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_application_ids() {
        for id in ["", "not-an-id", "123&scope=admin"] {
            assert!(!valid_client(id))
        }
        assert!(valid_client("123456789012345678"));
    }
    #[test]
    fn legacy_tokens_are_never_serialized() {
        let cfg: Config = serde_json::from_value(
            json!({"clientId":"12345678","accessToken":"sensitive","refreshToken":"sensitive"}),
        )
        .unwrap();
        let s = serde_json::to_string(&cfg).unwrap();
        assert!(!s.contains("sensitive"));
    }
    #[tokio::test]
    async fn handshake_requires_ready_and_activity_requires_matching_ack() {
        let (mut client, mut server) = tokio::io::duplex(4096);
        let peer = tokio::spawn(async move {
            let op = server.read_u32_le().await.unwrap();
            assert_eq!(op, 0);
            let n = server.read_u32_le().await.unwrap();
            let mut b = vec![0; n as usize];
            server.read_exact(&mut b).await.unwrap();
            write_frame(&mut server, 1, &json!({"evt":"READY"}))
                .await
                .unwrap();
            let op = server.read_u32_le().await.unwrap();
            assert_eq!(op, 1);
            let n = server.read_u32_le().await.unwrap();
            let mut b = vec![0; n as usize];
            server.read_exact(&mut b).await.unwrap();
            let v: Value = serde_json::from_slice(&b).unwrap();
            write_frame(
                &mut server,
                1,
                &json!({"cmd":"SET_ACTIVITY","nonce":v["nonce"]}),
            )
            .await
            .unwrap();
        });
        handshake(&mut client, "12345678").await.unwrap();
        send_activity(&mut client, None).await.unwrap();
        peer.await.unwrap();
        let (mut client, mut server) = tokio::io::duplex(4096);
        write_frame(&mut server, 1, &json!({"evt":"ERROR"}))
            .await
            .unwrap();
        assert!(read_frame(&mut client).await.is_err());
    }
}
