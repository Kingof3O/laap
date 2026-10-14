use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
pub static QUIT_ALLOWED: AtomicBool = AtomicBool::new(false);
static READY: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TrayIntent {
    Open,
    SelectPresence {
        mode: crate::launcher_settings::PresenceMode,
    },
    SwitchAccount {
        id: String,
    },
    StopRiot,
    RetrySetup,
    Quit,
}
#[derive(Deserialize)]
pub struct TrayAccount {
    id: String,
    name: String,
    region: String,
    has_session: bool,
}
#[derive(Deserialize)]
pub struct TraySnapshot {
    accounts: Vec<TrayAccount>,
    active_id: Option<String>,
    presence: String,
    mode: crate::launcher_settings::PresenceMode,
    busy: bool,
    running: bool,
    setup_failed: bool,
}
fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
pub fn available(app: &AppHandle) -> bool {
    app.tray_by_id("laap").is_some()
}
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn menu(app: &AppHandle, snapshot: &TraySnapshot) -> Result<Menu<tauri::Wry>, String> {
    let menu = Menu::new(app).map_err(error)?;
    let current = snapshot
        .active_id
        .as_ref()
        .and_then(|id| snapshot.accounts.iter().find(|account| &account.id == id));
    menu.append(
        &MenuItem::with_id(
            app,
            "current",
            current
                .map(|a| format!("Account: {}", a.name))
                .unwrap_or_else(|| "LAAP • No managed account".into()),
            false,
            None::<&str>,
        )
        .map_err(error)?,
    )
    .map_err(error)?;
    menu.append(
        &MenuItem::with_id(app, "status", &snapshot.presence, false, None::<&str>)
            .map_err(error)?,
    )
    .map_err(error)?;
    menu.append(&PredefinedMenuItem::separator(app).map_err(error)?)
        .map_err(error)?;
    for (id, label, mode) in [
        (
            "online",
            "Online",
            crate::launcher_settings::PresenceMode::Online,
        ),
        (
            "offline",
            "Appear offline",
            crate::launcher_settings::PresenceMode::Offline,
        ),
    ] {
        menu.append(
            &CheckMenuItem::with_id(
                app,
                id,
                label,
                !snapshot.busy && READY.load(Ordering::SeqCst),
                snapshot.mode == mode,
                None::<&str>,
            )
            .map_err(error)?,
        )
        .map_err(error)?;
    }
    let accounts = Submenu::new(
        app,
        "Switch account",
        !snapshot.busy && READY.load(Ordering::SeqCst),
    )
    .map_err(error)?;
    if snapshot.accounts.is_empty() {
        accounts
            .append(
                &MenuItem::with_id(app, "empty", "No saved profiles", false, None::<&str>)
                    .map_err(error)?,
            )
            .map_err(error)?;
    }
    for account in &snapshot.accounts {
        let label = format!(
            "{} · {}{}",
            account.name.replace('&', "&&"),
            account.region,
            if account.has_session {
                ""
            } else {
                " · Sign in required"
            }
        );
        accounts
            .append(
                &CheckMenuItem::with_id(
                    app,
                    format!("account:{}", account.id),
                    label,
                    !snapshot.busy && snapshot.active_id.as_ref() != Some(&account.id),
                    snapshot.active_id.as_ref() == Some(&account.id),
                    None::<&str>,
                )
                .map_err(error)?,
            )
            .map_err(error)?;
    }
    menu.append(&accounts).map_err(error)?;
    if snapshot.setup_failed {
        menu.append(
            &MenuItem::with_id(
                app,
                "retry",
                "Retry presence setup",
                !snapshot.busy,
                None::<&str>,
            )
            .map_err(error)?,
        )
        .map_err(error)?;
    }
    menu.append(&PredefinedMenuItem::separator(app).map_err(error)?)
        .map_err(error)?;
    for (id, label, enabled) in [
        ("open", "Open LAAP", true),
        ("stop", "Stop Riot", snapshot.running && !snapshot.busy),
        (
            "quit",
            "Quit LAAP",
            !snapshot.busy && READY.load(Ordering::SeqCst),
        ),
    ] {
        menu.append(&MenuItem::with_id(app, id, label, enabled, None::<&str>).map_err(error)?)
            .map_err(error)?;
    }
    Ok(menu)
}
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let snapshot = TraySnapshot {
        accounts: vec![],
        active_id: None,
        presence: "Starting LAAP…".into(),
        mode: crate::launcher_settings::PresenceMode::Online,
        busy: true,
        running: false,
        setup_failed: false,
    };
    let icon = if cfg!(target_os = "macos") {
        include_bytes!("../icons/tray-template.png").as_slice()
    } else {
        include_bytes!("../icons/32x32.png").as_slice()
    };
    let icon = image::load_from_memory(icon).map_err(error)?.into_rgba8();
    let width = icon.width();
    let height = icon.height();
    TrayIconBuilder::with_id("laap")
        .icon(tauri::image::Image::new_owned(
            icon.into_raw(),
            width,
            height,
        ))
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("LAAP • Account launcher")
        .menu(&menu(app, &snapshot)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let intent = match id {
                "open" => Some(TrayIntent::Open),
                "online" => Some(TrayIntent::SelectPresence {
                    mode: crate::launcher_settings::PresenceMode::Online,
                }),
                "offline" => Some(TrayIntent::SelectPresence {
                    mode: crate::launcher_settings::PresenceMode::Offline,
                }),
                "stop" => Some(TrayIntent::StopRiot),
                "retry" => Some(TrayIntent::RetrySetup),
                "quit" => Some(TrayIntent::Quit),
                _ => id
                    .strip_prefix("account:")
                    .map(|id| TrayIntent::SwitchAccount { id: id.into() }),
            };
            if let Some(intent) = intent {
                if matches!(intent, TrayIntent::Open) {
                    show(app);
                } else if !READY.load(Ordering::SeqCst) {
                    show(app);
                    return;
                }
                let _ = app.emit("laap:tray-intent", intent);
            }
        })
        .build(app)
        .map_err(error)?;
    Ok(())
}
#[tauri::command]
pub fn active_local_profile() -> Option<String> {
    let path = crate::riot::detect_riot_data_dir().join(".laap-session-owner");
    let owner = std::fs::read_to_string(path).ok()?;
    owner
        .strip_prefix("local:")
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
}
#[tauri::command]
pub fn tray_available(app: AppHandle) -> bool {
    available(&app)
}
#[tauri::command]
pub fn tray_client_ready(app: AppHandle) -> bool {
    READY.store(true, Ordering::SeqCst);
    available(&app)
}
#[tauri::command]
pub fn show_launcher(app: AppHandle) {
    show(&app);
}
#[tauri::command]
pub fn update_tray(app: AppHandle, snapshot: TraySnapshot) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("laap") {
        tray.set_menu(Some(menu(&app, &snapshot)?)).map_err(error)?;
    }
    Ok(())
}
#[tauri::command]
pub async fn prepare_quit(confirmed: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if crate::commands::session::owns_provisioning() {
            crate::commands::session::cancel_provisioning_session_sync(None, Some(confirmed))?;
        }
        crate::commands::session::cleanup_account_session_sync(Some(confirmed), None)?;
        crate::riot::process::stop_riot(confirmed)?;
        Ok(())
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn finish_quit(app: AppHandle) -> Result<(), String> {
    if crate::riot::process::is_riot_running()
        || crate::presence::active()
        || crate::commands::session::owns_provisioning()
    {
        return Err("Riot is still running. Stop the client before quitting.".into());
    }
    QUIT_ALLOWED.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}
