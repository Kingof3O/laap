pub mod commands;
#[cfg(not(feature = "basic"))]
mod customization;
#[cfg(not(feature = "studio"))]
pub mod launcher_settings;
#[cfg(not(feature = "studio"))]
pub mod local_store;
#[cfg(not(feature = "studio"))]
pub mod presence;
#[cfg(not(feature = "studio"))]
mod presence_identity;
#[cfg(not(feature = "studio"))]
mod presence_protocol;
#[cfg(not(feature = "studio"))]
mod presence_proxy;
mod lcu_read;
pub mod product;
#[cfg(not(feature = "studio"))]
pub mod profile_assets;
#[cfg(not(feature = "studio"))]
pub mod riot;
#[cfg_attr(feature = "studio", path = "studio_tray.rs")]
pub mod tray;

#[cfg(not(feature = "studio"))]
pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};
#[cfg(not(feature = "studio"))]
pub use riot as session;
#[cfg(not(feature = "studio"))]
pub use riot::{RiotProvisioner, RiotSessionManager};

pub fn run() {
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
            #[cfg(not(feature = "basic"))]
            app.handle().plugin(tauri_plugin_dialog::init())?;
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
                    #[cfg(not(feature = "studio"))]
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
            #[cfg(not(feature = "studio"))]
            commands::session::is_riot_running,
            #[cfg(not(feature = "studio"))]
            commands::session::runtime_snapshot,
            #[cfg(not(feature = "studio"))]
            commands::session::close_riot_client,
            #[cfg(not(feature = "studio"))]
            commands::session::cleanup_account_session,
            #[cfg(not(feature = "studio"))]
            commands::session::recover_orphaned_account_session,
            #[cfg(not(feature = "studio"))]
            commands::session::capture_active_session,
            #[cfg(not(feature = "studio"))]
            commands::session::detect_active_profile,
            #[cfg(not(feature = "studio"))]
            commands::session::complete_local_provisioning,
            #[cfg(not(feature = "studio"))]
            commands::session::switch_account_session,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::edit_local_account,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::refresh_local_account,
            #[cfg(not(feature = "studio"))]
            profile_assets::get_icon_catalog,
            #[cfg(not(feature = "studio"))]
            profile_assets::get_profile_icon,
            #[cfg(not(feature = "studio"))]
            profile_assets::read_cached_icon,
            #[cfg(not(feature = "studio"))]
            profile_assets::upload_profile_icon,
            #[cfg(not(feature = "studio"))]
            profile_assets::sync_profile_customizations,
            #[cfg(not(feature = "studio"))]
            commands::session::start_provisioning_session,
            #[cfg(not(feature = "studio"))]
            commands::session::poll_provisioning_session,
            #[cfg(not(feature = "studio"))]
            commands::session::finish_provisioning_session,
            #[cfg(not(feature = "studio"))]
            commands::session::cancel_provisioning_session,
            #[cfg(not(feature = "studio"))]
            commands::session::launch_riot_client,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::list_local_accounts,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::save_local_account,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::delete_local_account,
            #[cfg(not(feature = "studio"))]
            commands::local_accounts::launch_local_account,
            #[cfg(not(feature = "studio"))]
            tray::active_local_profile,
            #[cfg(not(feature = "studio"))]
            tray::tray_available,
            #[cfg(not(feature = "studio"))]
            tray::tray_client_ready,
            #[cfg(not(feature = "studio"))]
            tray::show_launcher,
            #[cfg(not(feature = "studio"))]
            tray::update_tray,
            #[cfg(not(feature = "studio"))]
            tray::prepare_quit,
            #[cfg(not(feature = "studio"))]
            tray::finish_quit,
            #[cfg(not(feature = "studio"))]
            presence::initialize_presence,
            #[cfg(not(feature = "studio"))]
            presence::allow_normal_online_launch,
            #[cfg(not(feature = "studio"))]
            presence::get_launcher_settings,
            #[cfg(not(feature = "studio"))]
            presence::save_launcher_settings,
            #[cfg(not(feature = "studio"))]
            presence::prepare_presence_support,
            #[cfg(not(feature = "studio"))]
            presence::get_presence_status,
            #[cfg(not(feature = "studio"))]
            presence::set_presence_mode,
            #[cfg(not(feature = "studio"))]
            presence::retry_presence,
            #[cfg(not(feature = "studio"))]
            commands::session::restart_riot_presence,
            product::get_product_capabilities,
            commands::window::open_external_url,
            #[cfg(not(feature = "basic"))]
            customization::catalog::catalog_list,
            #[cfg(not(feature = "basic"))]
            customization::catalog_media::catalog_artwork,
            #[cfg(not(feature = "basic"))]
            customization::doctor::doctor_collect,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::gameflow_status,
            #[cfg(not(feature = "basic"))]
            customization::doctor::catalog_clear_media_cache,
            #[cfg(not(feature = "basic"))]
            customization::catalog::catalog_champion,
            #[cfg(not(feature = "basic"))]
            customization::catalog_preferences::catalog_preferences,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_import,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_list,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_remove,
            #[cfg(not(feature = "basic"))]
            customization::library::creator_build_package,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_list,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_save,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_delete,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_export,
            #[cfg(not(feature = "basic"))]
            customization::exports::customization_preset_export_file,
            #[cfg(not(feature = "basic"))]
            customization::exports::creator_save_package,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_import,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_resolve,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_preview_load,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_preview_save,
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
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if tray::available(handle)
                    && !tray::QUIT_ALLOWED.load(std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_exit();
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                } else {
                    #[cfg(not(feature = "studio"))]
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
        });
}
