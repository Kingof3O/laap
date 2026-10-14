pub mod commands;
pub mod device;
pub mod launcher_settings;
pub mod local_store;
pub mod presence;
mod presence_identity;
mod presence_protocol;
mod presence_proxy;
pub mod profile_assets;
pub mod riot;
pub mod tray;

pub use device::DeviceIdentity;
pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};
pub use riot as session;
pub use riot::{RiotProvisioner, RiotSessionManager};

pub fn run() {
    use tauri::Manager;
    tauri::Builder::default()
        .setup(|app| {
            if let Err(error) = tray::setup(app.handle()) {
                eprintln!("LAAP tray unavailable: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if tray::available(window.app_handle())
                    && !tray::QUIT_ALLOWED.load(std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.hide();
                } else if presence::keep_open() {
                    api.prevent_close();
                    presence::explain_close();
                } else {
                    let _ = presence::stop_proxy();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::load_access_token,
            commands::auth::store_access_token,
            commands::auth::clear_access_token,
            commands::device::device_public_key,
            commands::device::sign_device_nonce,
            commands::device::device_platform,
            commands::device::device_info,
            commands::session::is_riot_running,
            commands::session::runtime_snapshot,
            commands::session::close_riot_client,
            commands::session::inject_account_session,
            commands::session::cleanup_account_session,
            commands::session::recover_orphaned_account_session,
            commands::session::capture_active_session,
            commands::session::detect_active_profile,
            commands::session::complete_local_provisioning,
            commands::session::switch_account_session,
            commands::local_accounts::edit_local_account,
            commands::local_accounts::refresh_local_account,
            profile_assets::get_icon_catalog,
            profile_assets::get_profile_icon,
            profile_assets::read_cached_icon,
            profile_assets::upload_profile_icon,
            profile_assets::sync_profile_customizations,
            commands::session::start_provisioning_session,
            commands::session::poll_provisioning_session,
            commands::session::finish_provisioning_session,
            commands::session::cancel_provisioning_session,
            commands::session::launch_riot_client,
            commands::local_accounts::list_local_accounts,
            commands::local_accounts::get_local_account,
            commands::local_accounts::save_local_account,
            commands::local_accounts::delete_local_account,
            commands::local_accounts::launch_local_account,
            tray::active_local_profile,
            tray::tray_available,
            tray::tray_client_ready,
            tray::show_launcher,
            tray::update_tray,
            tray::prepare_quit,
            tray::finish_quit,
            presence::initialize_presence,
            presence::allow_normal_online_launch,
            presence::get_launcher_settings,
            presence::save_launcher_settings,
            presence::prepare_presence_support,
            presence::get_presence_status,
            presence::set_presence_mode,
            presence::retry_presence,
            commands::session::restart_riot_presence,
            commands::session::open_external_url
        ])
        .build(tauri::generate_context!())
        .expect("error while building LAAP desktop")
        .run(|handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if tray::available(handle)
                    && !tray::QUIT_ALLOWED.load(std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_exit();
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                } else if presence::keep_open() {
                    api.prevent_exit();
                    presence::explain_close();
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else {
                    let _ = presence::stop_proxy();
                }
            }
        });
}
