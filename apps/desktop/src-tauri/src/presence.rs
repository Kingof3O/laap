//! Built-in LAAP Presence. No external program, injected code, or chat contact.
use crate::{
    launcher_settings::{self, LauncherSettings, PresenceMode},
    presence_proxy::{self, Proxy},
};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
const CERTIFICATE_URL: &str = "https://mln.cx/deceive/localhost.pfx";
static ACTIVE: Mutex<Option<Arc<Proxy>>> = Mutex::new(None);
fn certificate_path() -> PathBuf {
    crate::local_store::LocalAccountStorage::default_storage_dir()
        .join("presence")
        .join("localhost.pfx")
}
fn certificate_bytes() -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(certificate_path())
        .map_err(|_| "Prepare presence controls in Settings before enabling them.".to_string())?;
    if bytes.len() > 512 * 1024 {
        return Err(
            "The cached presence certificate is invalid. Prepare presence controls again.".into(),
        );
    }
    Ok(bytes)
}
pub fn current_proxy() -> Option<Arc<Proxy>> {
    ACTIVE.lock().unwrap_or_else(|e| e.into_inner()).clone()
}
pub fn active() -> bool {
    current_proxy().is_some()
}
pub fn stop_proxy() -> Result<(), String> {
    let old = ACTIVE.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(proxy) = old {
        proxy.stop();
    }
    Ok(())
}
pub fn keep_open() -> bool {
    current_proxy().is_some_and(|proxy| proxy.alive())
        && (crate::riot::process::is_riot_running() || crate::riot::operation::launch_cooldown())
}
pub fn explain_close() {
    if let Some(proxy) = current_proxy() {
        proxy.set_notice("Keep LAAP open while presence controls are running. You can minimize it. Use Stop Riot before quitting.");
    }
}
#[derive(Serialize)]
pub struct SettingsView {
    pub settings: LauncherSettings,
    pub windows: bool,
    pub detected_client: Option<crate::riot::install::ClientLocation>,
    pub detection_error: Option<String>,
    pub presence_ready: bool,
    pub presence_supported: bool,
}
fn settings_view() -> Result<SettingsView, String> {
    let mut settings = launcher_settings::load()?;
    if !cfg!(target_os = "windows") {
        settings.presence_enabled = false;
    }
    let location = crate::riot::install::discover();
    let unverified_app = location
        .as_ref()
        .is_ok_and(|client| client.source == "macOS Launch Services");
    Ok(SettingsView {
        settings,
        windows: cfg!(target_os = "windows"),
        detected_client: if unverified_app {
            None
        } else {
            location.as_ref().ok().cloned()
        },
        detection_error: if unverified_app {
            Some("Riot's app bundle was not found in known folders. macOS will try to locate it when launching.".into())
        } else {
            location.err()
        },
        presence_ready: cfg!(target_os = "windows")
            && certificate_bytes()
                .ok()
                .is_some_and(|bytes| native_tls::Identity::from_pkcs12(&bytes, "").is_ok()),
        presence_supported: cfg!(target_os = "windows"),
    })
}
#[tauri::command]
pub async fn get_launcher_settings() -> Result<SettingsView, String> {
    tauri::async_runtime::spawn_blocking(settings_view)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_launcher_settings(
    riot_client_path: Option<String>,
    presence_enabled: bool,
) -> Result<SettingsView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = crate::riot::operation::acquire()?;
        let validated = crate::riot::install::validate_override(riot_client_path.as_deref().unwrap_or_default())?;
        if presence_enabled {
            if !cfg!(target_os = "windows") { return Err("LAAP Presence is available on Windows.".into()); }
            presence_proxy::validate_identity(&certificate_bytes()?)?;
            presence_proxy::check_local_dns()?;
        } else if keep_open() {
            return Err("Use Online to show normal presence now. Use Stop Riot before disabling presence controls for future logins.".into());
        }
        launcher_settings::update(|s| { s.riot_client_path = validated; s.presence_enabled = presence_enabled; Ok(()) })?;
        settings_view()
    }).await.map_err(|e| e.to_string())?
}
fn download_certificate() -> Result<Vec<u8>, String> {
    use std::io::Read;
    let build = |address: Option<std::net::IpAddr>| -> Result<reqwest::blocking::Client, String> {
        let mut client = reqwest::blocking::Client::builder()
            .user_agent("LAAP-presence-setup")
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && attempt.url().scheme() == "https" {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }));
        if let Some(address) = address {
            client = client.resolve("mln.cx", std::net::SocketAddr::new(address, 443));
        }
        client.build().map_err(|e| e.to_string())
    };
    let fetch = |client: &reqwest::blocking::Client| -> Result<Vec<u8>, String> {
        let response = client
            .get(CERTIFICATE_URL)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|_| "Unable to reach the presence certificate service".to_string())?;
        let mut bytes = Vec::new();
        response
            .take(512 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Unable to read the presence certificate".to_string())?;
        if bytes.len() > 512 * 1024 {
            return Err("Presence certificate exceeded its size limit".into());
        }
        Ok(bytes)
    };
    let client = build(None)?;
    if let Ok(bytes) = fetch(&client) {
        return Ok(bytes);
    }
    // Retry a failed system-DNS route with a fixed public DNS-over-HTTPS query.
    // TLS still validates mln.cx normally; no account data enters this request.
    let dns = client
        .get("https://dns.google/resolve?name=mln.cx&type=A")
        .send()
        .and_then(|r| r.error_for_status());
    if let Ok(dns) = dns {
        let mut bytes = Vec::new();
        if dns.take(16 * 1024 + 1).read_to_end(&mut bytes).is_ok() && bytes.len() <= 16 * 1024 {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(records) = json.get("Answer").and_then(|v| v.as_array()) {
                    for record in records
                        .iter()
                        .filter(|record| record.get("type").and_then(|v| v.as_u64()) == Some(1))
                        .take(2)
                    {
                        if record.get("type").and_then(|v| v.as_u64()) != Some(1) {
                            continue;
                        }
                        let Some(ip) = record
                            .get("data")
                            .and_then(|v| v.as_str())
                            .and_then(|v| v.parse::<std::net::Ipv4Addr>().ok())
                        else {
                            continue;
                        };
                        if ip.is_private()
                            || ip.is_loopback()
                            || ip.is_link_local()
                            || ip.is_unspecified()
                            || ip.is_multicast()
                            || ip.is_broadcast()
                        {
                            continue;
                        }
                        if let Ok(bytes) = fetch(&build(Some(std::net::IpAddr::V4(ip)))?) {
                            return Ok(bytes);
                        }
                    }
                }
            }
        }
    }
    Err("Unable to download the presence certificate. Check the connection and retry; normal Riot launch is available with presence controls disabled.".into())
}
#[tauri::command]
pub async fn prepare_presence_support() -> Result<SettingsView, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _operation = crate::riot::operation::acquire()?;
        if !cfg!(target_os = "windows") {
            return Err("LAAP Presence is available on Windows.".into());
        }
        let bytes = download_certificate()?;
        presence_proxy::validate_identity(&bytes)?;
        launcher_settings::atomic_write(&certificate_path(), &bytes)?;
        settings_view()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct PresenceStatus {
    pub enabled: bool,
    pub desired_mode: PresenceMode,
    pub applied_mode: Option<PresenceMode>,
    pub state: &'static str,
    pub message: String,
}
pub fn status() -> Result<PresenceStatus, String> {
    let settings = launcher_settings::load()?;
    let mut result = PresenceStatus {
        enabled: settings.presence_enabled,
        desired_mode: settings.presence_mode,
        applied_mode: None,
        state: "disabled",
        message: "LAAP Presence is disabled.".into(),
    };
    if !cfg!(target_os = "windows") {
        result.enabled = false;
        return Ok(result);
    }
    if !settings.presence_enabled {
        return Ok(result);
    }
    let running = crate::riot::process::is_riot_running();
    if !running && !crate::riot::operation::launch_cooldown() {
        stop_proxy()?;
        result.state = "next_launch";
        result.message = format!("Appear {} on next login.", settings.presence_mode.command());
        return Ok(result);
    }
    let Some(proxy) = current_proxy() else {
        result.state = if running {
            "restart_required"
        } else {
            "next_launch"
        };
        result.message = if running {
            "Restart Riot once to enable LAAP Presence for this session.".into()
        } else {
            format!("Appear {} on next login.", settings.presence_mode.command())
        };
        return Ok(result);
    };
    if !proxy.alive() {
        result.state = "restart_required";
        result.message =
            "The presence service stopped. Restart Riot through LAAP to reconnect chat.".into();
        return Ok(result);
    }
    let progress = proxy.progress();
    result.applied_mode = progress.applied;
    if let Some(error) = progress.error {
        result.state = "error";
        result.message = error;
    } else if proxy.connected() && progress.applied == Some(settings.presence_mode) {
        result.state = "active";
        result.message = match settings.presence_mode {
            PresenceMode::Online => "LAAP Presence: normal online presence is active.".into(),
            PresenceMode::Offline => "LAAP Presence: offline filter is active.".into(),
        };
    } else {
        result.state = "waiting";
        result.message = if progress.routed {
            "Waiting for Riot chat to connect and send presence…".into()
        } else {
            "Waiting for Riot's chat configuration…".into()
        };
    }
    if let Some(notice) = progress.notice {
        result.message.push(' ');
        result.message.push_str(&notice);
    }
    Ok(result)
}
#[tauri::command]
pub async fn get_presence_status() -> Result<PresenceStatus, String> {
    tauri::async_runtime::spawn_blocking(status)
        .await
        .map_err(|e| e.to_string())?
}
fn apply_mode(mode: Option<PresenceMode>) -> Result<PresenceStatus, String> {
    if !cfg!(target_os = "windows") {
        return Err("LAAP Presence is available on Windows.".into());
    }
    let settings = if let Some(mode) = mode {
        launcher_settings::update(|s| {
            s.presence_mode = mode;
            Ok(())
        })?
    } else {
        launcher_settings::load()?
    };
    if settings.presence_enabled {
        if let Some(proxy) = current_proxy() {
            proxy.change_mode(settings.presence_mode);
            if proxy.connected() {
                let deadline = Instant::now() + Duration::from_secs(3);
                while proxy.progress().applied != Some(settings.presence_mode)
                    && proxy.progress().error.is_none()
                    && Instant::now() < deadline
                {
                    std::thread::sleep(Duration::from_millis(40));
                }
            }
        }
    }
    status()
}
#[tauri::command]
pub async fn set_presence_mode(mode: PresenceMode) -> Result<PresenceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || apply_mode(Some(mode)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn retry_presence() -> Result<PresenceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || apply_mode(None))
        .await
        .map_err(|e| e.to_string())?
}
pub struct LaunchPlan {
    client: crate::riot::install::ClientLocation,
    identity: Option<native_tls::Identity>,
}
impl LaunchPlan {
    pub fn prepare() -> Result<Self, String> {
        let client = crate::riot::install::discover()?;
        let settings = launcher_settings::load()?;
        let identity = if cfg!(target_os = "windows") && settings.presence_enabled {
            let identity = presence_proxy::validate_identity(&certificate_bytes()?)?;
            presence_proxy::check_local_dns()?;
            Some(identity)
        } else {
            None
        };
        Ok(Self { client, identity })
    }
    pub fn launch(self) -> Result<(), String> {
        if crate::riot::process::is_riot_running() && (self.identity.is_some() || active()) {
            return Err(
                "Use Switch Account or Stop Riot before starting a presence-enabled client.".into(),
            );
        }
        stop_proxy()?;
        let mut args: Vec<String> = crate::commands::session::LEAGUE_LAUNCH_ARGS
            .iter()
            .map(|arg| (*arg).into())
            .collect();
        if let Some(identity) = self.identity {
            let settings = launcher_settings::load()?;
            let proxy = presence_proxy::start(identity, settings.presence_mode)?;
            args.push(format!(
                "--client-config-url=http://127.0.0.1:{}",
                proxy.config_port
            ));
            crate::riot::operation::mark_launch();
            *ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = Some(proxy);
        }
        let result = spawn_client(&self.client.path, &args);
        if result.is_err() {
            stop_proxy()?;
        } else {
            crate::riot::operation::mark_launch();
        }
        result
    }
}
fn spawn_client(path: &str, args: &[String]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let path = std::path::Path::new(path);
        std::process::Command::new(path)
            .args(args)
            .current_dir(path.parent().ok_or("Riot Client folder missing")?)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Unable to open Riot Client at {}: {e}", path.display()))
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-a", path, "--args"])
            .args(args)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("Riot Client could not be opened. Verify it is installed and launch it once manually.".into())
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (path, args);
        Err("This desktop build supports Windows and macOS".into())
    }
}

#[cfg(all(test, target_os = "windows"))]
mod contract_tests {
    use super::*;
    #[test]
    #[ignore = "Explicit public presence certificate and loopback TLS check; no Riot login or user files are accessed"]
    fn presence_public_certificate_contract() {
        let bytes = download_certificate().unwrap();
        let identity = presence_proxy::validate_identity(&bytes).unwrap();
        presence_proxy::check_local_dns().unwrap();
        let proxy = presence_proxy::start(identity, PresenceMode::Online).unwrap();
        assert!(proxy.alive());
        assert!(proxy.config_port > 0);
        proxy.stop();
        assert!(!proxy.alive());
    }
}
