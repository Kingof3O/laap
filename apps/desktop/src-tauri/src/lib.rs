pub mod commands;
mod billing;
pub mod launcher_settings;
pub mod local_store;
pub mod presence;
mod presence_identity;
mod presence_protocol;
mod presence_proxy;
mod lcu_read;
pub mod product;
pub mod profile_assets;
pub mod opgg;
pub mod riot;
pub mod riot_live;
pub mod tray;

pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};
pub use riot as session;
pub use riot::{RiotProvisioner, RiotSessionManager};

#[cfg(target_os = "windows")]
fn encode_wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn set_windows_app_user_model_id(app_id: &str) {
    let wide = encode_wide_null(app_id);
    // Register the explicit AUMID before creating windows or WebView2 so NSIS Start Menu / taskbar pins group reliably.
    let hr = unsafe {
        windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(wide.as_ptr())
    };
    if hr < 0 {
        eprintln!("Unable to register Windows AppUserModelID '{app_id}': HRESULT 0x{hr:08x}");
    }
}

pub fn run() {
    #[cfg(target_os = "windows")]
    set_windows_app_user_model_id(product::app_identifier());

    use tauri::{Emitter, Manager};
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if commands::updater::is_install_transition_active() {
                eprintln!("Blocked simultaneous launch attempt during active update installation transition.");
                return;
            }
            tray::show(app);
            let _ = app.emit("laap:tray-intent", tray::TrayIntent::Open);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            product::validate_identifier(&app.config().identifier)?;
            tauri::async_runtime::spawn(billing::refresh_background());
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }
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
                } else {
                    if presence::keep_open() {
                    api.prevent_close();
                    presence::explain_close();
                } else {
                        let _ = presence::stop_proxy();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::session::is_riot_running,
            commands::session::runtime_snapshot,
            commands::session::close_riot_client,
            commands::session::cleanup_account_session,
            commands::session::recover_orphaned_account_session,
            commands::session::capture_active_session,
            commands::session::detect_active_profile,
            commands::session::complete_local_provisioning,
            billing::billing_status,
            billing::billing_send_code,
            billing::billing_verify_email,
            billing::billing_activate,
            billing::billing_transfer,
            billing::billing_redeem,
            billing::billing_cancel_checkout,
            billing::billing_open_page,
            commands::local_accounts::basic_profile_slots,
            commands::local_accounts::select_basic_profiles,
            commands::local_accounts::replace_basic_profile,
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
            commands::local_accounts::save_local_account,
            commands::local_accounts::delete_local_account,
            commands::local_accounts::launch_local_account,
            commands::local_accounts::apply_opgg_profile,
            commands::local_accounts::update_account_riot_id,
            opgg::fetch_opgg_summoner_stats,
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
            riot_live::get_live_status_settings,
            riot_live::save_live_status_settings,
            riot_live::check_account_live_status,
            product::get_product_capabilities,
            commands::window::open_external_url,
            commands::system_utils::write_error_report,
            commands::system_utils::set_auto_launch,
            commands::system_utils::get_auto_launch,
            commands::system_utils::set_minimize_to_tray,
            commands::system_utils::get_minimize_to_tray,
            commands::system_utils::set_developer_mode,
            commands::system_utils::get_developer_mode,
            commands::system_utils::get_file_info,
            commands::system_utils::register_hotkey,
            commands::system_utils::set_performance_mode,
            commands::system_utils::set_app_low_priority,
            commands::updater::get_app_version,
            commands::updater::check_github_update,
            commands::updater::get_updater_preflight_status,
            commands::updater::native_install_update,
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_is_maximized,
            commands::window::window_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building LAAP desktop")
        .run(|handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if tray::available(handle)
                        && !tray::QUIT_ALLOWED.load(std::sync::atomic::Ordering::SeqCst)
                    {
                        api.prevent_exit();
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    } else {
                        if presence::keep_open() {
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
                }
                _ => {}
            }
        });
}

#[cfg(all(test, target_os = "windows"))]
mod windows_identity_tests {
    use super::{encode_wide_null, product};

    #[test]
    fn windows_aumid_is_non_empty_and_null_terminated() {
        let id = product::app_identifier();
        let wide = encode_wide_null(id);
        assert_eq!(wide.last().copied(), Some(0));
        assert_eq!(wide.len(), id.encode_utf16().count() + 1);
        assert_eq!(id, "com.laap.offline");
    }
}
