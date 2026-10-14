use crate::riot::{RiotProvisioner, RiotSessionManager};
use std::process::Command;
use std::sync::Mutex;

pub const LEAGUE_LAUNCH_ARGS: [&str; 2] = [
    "--launch-product=league_of_legends",
    "--launch-patchline=live",
];

pub(super) struct ProvisioningSession {
    pub id: String,
    pub worker: RiotProvisioner,
    pub _lease: std::fs::File,
}
pub(super) static PROVISIONER: Mutex<Option<ProvisioningSession>> = Mutex::new(None);
pub fn owns_provisioning() -> bool {
    match PROVISIONER.try_lock() {
        Ok(state) => state.is_some(),
        Err(std::sync::TryLockError::Poisoned(error)) => {
            PROVISIONER.clear_poison();
            error.into_inner().is_some()
        }
        Err(std::sync::TryLockError::WouldBlock) => false,
    }
}
fn provisioner_lock() -> Result<std::sync::MutexGuard<'static, Option<ProvisioningSession>>, String>
{
    Ok(match PROVISIONER.lock() {
        Ok(guard) => guard,
        Err(error) => {
            PROVISIONER.clear_poison();
            error.into_inner()
        }
    })
}
fn check_ticket(session: &ProvisioningSession, ticket: Option<&str>) -> Result<(), String> {
    if ticket.is_some_and(|ticket| ticket != session.id) {
        return Err("This sign-in session was cancelled or replaced.".into());
    }
    Ok(())
}
fn idle() -> Result<(), String> {
    if provisioner_lock()?.is_some() {
        Err("Finish or cancel the current sign-in before switching accounts.".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn is_riot_running() -> bool {
    RiotSessionManager::is_riot_running()
}

#[tauri::command]
pub fn runtime_snapshot() -> crate::riot::RuntimeSnapshot {
    RiotSessionManager::runtime_snapshot()
}

/// Forcefully closes all running Riot Client and League processes.
#[tauri::command]
pub async fn close_riot_client(confirmed: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || close_riot_client_sync(confirmed))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn close_riot_client_sync(confirmed: Option<bool>) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    crate::riot::process::stop_riot(confirmed.unwrap_or(false))
}

/// Injects the managed Riot session token YAML before launching.
#[tauri::command]
pub async fn inject_account_session(session_yaml: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || inject_account_session_sync(session_yaml))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn inject_account_session_sync(session_yaml: String) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    let manager = RiotSessionManager::new();
    manager.inject_session(&session_yaml)
}

/// Cleans up the managed Riot session and restores original user settings.
#[tauri::command]
pub async fn cleanup_account_session(
    confirmed: Option<bool>,
    expected_owner: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        cleanup_account_session_sync(confirmed, expected_owner)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn cleanup_account_session_sync(
    confirmed: Option<bool>,
    expected_owner: Option<String>,
) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    let manager = RiotSessionManager::new();
    if expected_owner
        .as_ref()
        .is_some_and(|owner| !manager.owner_matches(owner))
    {
        return Ok(());
    }
    manager.cleanup_session_confirmed(confirmed.unwrap_or(false))
}

/// Restores settings left behind by a crashed LAAP process when Riot is not
/// running. It never overwrites a live Riot/League process.
#[tauri::command]
pub async fn recover_orphaned_account_session() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || recover_orphaned_account_session_sync())
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn recover_orphaned_account_session_sync() -> Result<bool, String> {
    let Ok(_operation) = crate::riot::operation::acquire() else {
        return Ok(false);
    };
    if provisioner_lock()?.is_some() || crate::riot::operation::launch_cooldown() {
        return Ok(false);
    }
    let manager = RiotSessionManager::new();
    manager.recover_orphaned_session()
}

/// Opens Riot Client without credentials or launch arguments.
#[tauri::command]
pub async fn launch_riot_client() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_riot_client_sync())
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn launch_riot_client_sync() -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    launch_riot_client_unlocked()
}
pub fn launch_riot_client_unlocked() -> Result<(), String> {
    crate::presence::LaunchPlan::prepare()?.launch()
}

#[tauri::command]
pub async fn restart_riot_presence(confirmed: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = crate::riot::operation::acquire()?;
        idle()?;
        if !cfg!(target_os = "windows") {
            return Err("LAAP Presence is available on Windows.".into());
        }
        if !crate::launcher_settings::load()?.presence_enabled {
            return Err("Enable presence controls in Settings first.".into());
        }
        let plan = crate::presence::LaunchPlan::prepare()?;
        crate::riot::process::stop_riot(confirmed.unwrap_or(false))?;
        plan.launch()
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Starts a single owned provisioning transaction. No background worker outlives it.
#[tauri::command]
pub async fn start_provisioning_session(confirmed: Option<bool>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || start_provisioning_session_sync(confirmed))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn start_provisioning_session_sync(confirmed: Option<bool>) -> Result<String, String> {
    let _operation = crate::riot::operation::acquire()?;
    let mut lock = provisioner_lock()?;
    if lock.is_some() {
        return Err("A sign-in is already in progress.".into());
    }
    let lease = crate::riot::operation::reserve_signin()?;
    let launch_plan = crate::presence::LaunchPlan::prepare()?;
    crate::riot::process::stop_riot(confirmed.unwrap_or(false))?;
    let mut worker = RiotProvisioner::new();
    if let Err(error) = worker.prepare_for_provisioning() {
        let cleanup = worker.finish_and_restore();
        return Err(format!(
            "{error}{}",
            cleanup
                .err()
                .map(|e| format!("; restore failed: {e}"))
                .unwrap_or_default()
        ));
    }
    let id = format!("{:032x}", rand::random::<u128>());
    *lock = Some(ProvisioningSession {
        id: id.clone(),
        worker,
        _lease: lease,
    });
    if let Err(error) = launch_plan.launch() {
        if let Some(session) = lock.as_mut() {
            session.worker.finish_and_restore()?;
        }
        *lock = None;
        return Err(error);
    }
    Ok(id)
}
#[tauri::command]
pub async fn capture_active_session() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || capture_active_session_sync())
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn capture_active_session_sync() -> Result<Option<String>, String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    Ok(RiotSessionManager::new().read_active_session())
}
#[derive(serde::Serialize)]
pub struct CapturedProfile {
    pub session_blob: String,
    pub details: crate::riot::session_format::DetectedSession,
}
#[tauri::command]
pub async fn detect_active_profile() -> Result<Option<CapturedProfile>, String> {
    tauri::async_runtime::spawn_blocking(move || detect_active_profile_sync())
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn detect_active_profile_sync() -> Result<Option<CapturedProfile>, String> {
    Ok(
        capture_active_session_sync()?.map(|session_blob| CapturedProfile {
            details: crate::riot::session_format::detect_details(&session_blob),
            session_blob,
        }),
    )
}
#[tauri::command]
pub async fn poll_provisioning_session(
    provisioning_id: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || poll_provisioning_session_sync(provisioning_id))
        .await
        .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn poll_provisioning_session_sync(
    provisioning_id: Option<String>,
) -> Result<Option<String>, String> {
    let lock = provisioner_lock()?;
    if let Some(session) = lock.as_ref() {
        check_ticket(session, provisioning_id.as_deref())?;
        session.worker.poll_captured_session()
    } else {
        Ok(None)
    }
}
fn restore_provisioning(provisioning_id: Option<&str>, confirmed: bool) -> Result<(), String> {
    let mut lock = provisioner_lock()?;
    if let Some(session) = lock.as_mut() {
        check_ticket(session, provisioning_id)?;
        session.worker.finish_and_restore_confirmed(confirmed)?;
        *lock = None;
    }
    Ok(())
}
#[tauri::command]
pub async fn finish_provisioning_session(
    provisioning_id: Option<String>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        finish_provisioning_session_sync(provisioning_id, confirmed)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn finish_provisioning_session_sync(
    provisioning_id: Option<String>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    restore_provisioning(provisioning_id.as_deref(), confirmed.unwrap_or(false))
}
#[tauri::command]
pub async fn cancel_provisioning_session(
    provisioning_id: Option<String>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        cancel_provisioning_session_sync(provisioning_id, confirmed)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn cancel_provisioning_session_sync(
    provisioning_id: Option<String>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    restore_provisioning(provisioning_id.as_deref(), confirmed.unwrap_or(false))
}
#[tauri::command]
pub async fn complete_local_provisioning(
    provisioning_id: String,
    profile_id: Option<String>,
    details: Option<crate::local_store::ProfileDetails>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        complete_local_provisioning_sync(provisioning_id, profile_id, details, confirmed)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn complete_local_provisioning_sync(
    provisioning_id: String,
    profile_id: Option<String>,
    details: Option<crate::local_store::ProfileDetails>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    let mut lock = provisioner_lock()?;
    let session = lock.as_mut().ok_or("This sign-in has been cancelled.")?;
    check_ticket(session, Some(&provisioning_id))?;
    let captured = session
        .worker
        .poll_captured_session()?
        .ok_or("No saved Riot login detected yet")?;
    let store = crate::local_store::LocalStore::new()?;
    // Finish restoration before committing the vault; failures leave the transaction cancellable.
    session
        .worker
        .finish_and_restore_confirmed(confirmed.unwrap_or(false))?;
    let result = if let Some(id) = profile_id {
        store.refresh_session(&id, captured)
    } else {
        store
            .create_profile(details.ok_or("Profile details are required")?, captured)
            .map(|_| ())
    };
    *lock = None;
    result
}
#[tauri::command]
pub async fn switch_account_session(
    session_yaml: String,
    confirmed: Option<bool>,
    owner_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        switch_account_session_sync(session_yaml, confirmed, owner_id)
    })
    .await
    .map_err(|error| format!("Native operation failed: {error}"))?
}
pub fn switch_account_session_sync(
    session_yaml: String,
    confirmed: Option<bool>,
    owner_id: Option<String>,
) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    switch_session_unlocked(
        &session_yaml,
        confirmed.unwrap_or(false),
        owner_id.as_deref().unwrap_or("external"),
    )
}
pub fn switch_session_unlocked(session: &str, confirmed: bool, owner: &str) -> Result<(), String> {
    if !crate::riot::session_format::has_persisted_session(session) {
        return Err("Sign in required: no reusable saved login.".into());
    }
    let launch_plan = crate::presence::LaunchPlan::prepare()?;
    crate::riot::process::stop_riot(confirmed)?;
    let manager = RiotSessionManager::new();
    manager.inject_session(session)?;
    if let Err(error) = manager.set_owner(owner) {
        let restored = manager.cleanup_session();
        return Err(format!(
            "{error}{}",
            restored
                .err()
                .map(|e| format!("; restore failed: {e}"))
                .unwrap_or_default()
        ));
    }
    if let Err(error) = launch_plan.launch() {
        manager.cleanup_session()?;
        return Err(error);
    }
    Ok(())
}
pub fn launch_local(id: &str, confirmed: bool) -> Result<(), String> {
    let _operation = crate::riot::operation::acquire()?;
    idle()?;
    let store = crate::local_store::LocalStore::new()?;
    switch_session_unlocked(&store.session_for(id)?, confirmed, &format!("local:{id}"))?;
    store.mark_played(id)
}

/// Opens an external URL in the user's default system browser.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://github.com/Kingof3O/laap/")
        || url == "https://github.com/Kingof3O/laap")
        || url
            .chars()
            .any(|character| matches!(character, '\r' | '\n' | '&' | '|' | '<' | '>' | '^' | '%'))
    {
        return Err("External URL is not allowed".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
