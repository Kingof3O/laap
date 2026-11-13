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
            #[cfg(not(feature = "basic"))]
            if customization::discord::scrub_legacy_config(app.handle()).is_err() {
                eprintln!("Legacy Discord configuration cleanup failed; review local integration settings.");
            }
            #[cfg(not(feature = "basic"))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if customization::discord::restore_connection(handle).await.is_err() {
                        eprintln!("Saved Discord presence connection is unavailable; retry from integration settings.");
                    }
                });
            }
            #[cfg(not(feature = "basic"))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let ensure_handle = handle.clone();
                    if let Ok(Ok(status)) = tauri::async_runtime::spawn_blocking(move || {
                        customization::skin_bootstrap::customization_bootstrap_ensure(ensure_handle)
                    })
                    .await
                    {
                        if status.setup_needed || !status.managed_backend_ready {
                            let _ = customization::skin_bootstrap::customization_bootstrap_provision(
                                handle,
                            )
                            .await;
                        }
                    }
                });
            }
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
            customization::catalog::catalog_tft_list,
            #[cfg(not(feature = "basic"))]
            customization::catalog::catalog_random_pick,
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
            #[cfg(all(feature = "customization", not(feature = "basic")))]
            customization::community_credentials::community_credential_load,
            #[cfg(all(feature = "customization", not(feature = "basic")))]
            customization::community_credentials::community_credential_save,
            #[cfg(all(feature = "customization", not(feature = "basic")))]
            customization::community_credentials::community_credential_clear,
            #[cfg(not(feature = "basic"))]
            customization::provider_support::provider_key_save,
            #[cfg(not(feature = "basic"))]
            customization::provider_support::provider_key_clear,
            #[cfg(all(feature = "customization", not(feature = "basic")))]
            customization::library::mod_inspect,
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
            customization::presets::customization_preset_duplicate,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_delete,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_restore,
            #[cfg(not(feature = "basic"))]
            customization::presets::customization_preset_conflicts,
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
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_export_file,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_import_bundle,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_list,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_get_active,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_set_active,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_save_custom,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_delete_custom,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_reset_default,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_save_media,
            #[cfg(not(feature = "basic"))]
            customization::themes::theme_media_read,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_set_enabled,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_set_priority,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_detect_conflicts,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_stage_overlay,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_apply_single,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_rollback,
            #[cfg(not(feature = "basic"))]
            customization::library::mod_get_package_data,
            #[cfg(not(feature = "basic"))]
            customization::library::delete_cache_file,
            #[cfg(not(feature = "basic"))]
            customization::library::delete_custom_mod_cache,
            #[cfg(not(feature = "basic"))]
            customization::library::delete_marketplace_mod_cache,
            #[cfg(not(feature = "basic"))]
            customization::library::delete_custom_mod_storage,
            #[cfg(not(feature = "basic"))]
            customization::library::invalidate_fixed_mod_cache,
            #[cfg(not(feature = "basic"))]
            customization::library::fantome_read_meta,
            #[cfg(not(feature = "basic"))]
            customization::library::fantome_write_meta,
            #[cfg(not(feature = "basic"))]
            customization::library::fantome_list_contents,
            #[cfg(not(feature = "basic"))]
            customization::library::fantome_extract,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_list_projects,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_create_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_get_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_save_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_duplicate_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_delete_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_add_file,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_remove_file,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_export_file,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_import_project,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_export_fantome,
            #[cfg(not(feature = "basic"))]
            customization::creator::creator_export_modpkg,
            #[cfg(not(feature = "basic"))]
            customization::game_path::get_game_path,
            #[cfg(not(feature = "basic"))]
            customization::game_path::set_game_path,
            #[cfg(not(feature = "basic"))]
            customization::game_path::clear_game_path,
            #[cfg(not(feature = "basic"))]
            customization::game_path::pick_game_path,
            #[cfg(not(feature = "basic"))]
            customization::game_path::get_game_install_info,
            #[cfg(not(feature = "basic"))]
            customization::game_path::open_folder_in_explorer,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_save_asset,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_save_asset_path,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_pick_media,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_clear_asset,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_set_music_options,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_pick_font,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_set_font_preset,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_clear_font,
            #[cfg(not(feature = "basic"))]
            customization::client_themes::client_themes_set_transition,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::lcu_test_connection,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::lcu_get_gameflow_phase,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::match_notice_show,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::match_notice_ready,
            #[cfg(not(feature = "basic"))]
            customization::gameflow::match_notice_action,
            #[cfg(not(feature = "basic"))]
            customization::discord::discord_get_status,
            #[cfg(not(feature = "basic"))]
            customization::discord::discord_configure,
            #[cfg(not(feature = "basic"))]
            customization::discord::discord_revoke_token,
            #[cfg(not(feature = "basic"))]
            customization::discord::set_rpc_enabled,
            #[cfg(not(feature = "basic"))]
            customization::discord::update_activity,
            #[cfg(not(feature = "basic"))]
            customization::discord::rpc_set_presence,
            #[cfg(not(feature = "basic"))]
            customization::stats_provider::opgg_get_summoner_profile,
            #[cfg(not(feature = "basic"))]
            customization::ai_assistant::ai_chat,
            #[cfg(not(feature = "basic"))]
            customization::ai_assistant::provider_cancel,
            #[cfg(not(feature = "basic"))]
            customization::ai_assistant::elevenlabs_tts,
            #[cfg(not(feature = "basic"))]
            customization::ai_assistant::streamelements_tts,
            #[cfg(not(feature = "basic"))]
            customization::fantome::fantome_inspect_package,
            #[cfg(not(feature = "basic"))]
            customization::fantome::fantome_repair_package,
            #[cfg(not(feature = "basic"))]
            customization::bin_tool::bin_inspect,
            #[cfg(not(feature = "basic"))]
            customization::bin_tool::bin_convert_to_json,
            #[cfg(not(feature = "basic"))]
            customization::bin_tool::bin_convert_from_json,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_inspect,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_extract_local,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_extract_files,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_pack_files,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_get_hash_dictionary_status,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_pick_hash_dictionary,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_list_game_archives,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_inspect_game_archive,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_pick_and_inspect,
            #[cfg(not(feature = "basic"))]
            customization::wad_tool::wad_extract_entries,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_validate_config,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_get_config,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_save_config,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_reset_defaults,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_export_snippet,
            #[cfg(not(feature = "basic"))]
            customization::client_surfaces::client_surfaces_get_adapter_status,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_get_status,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_start,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_stop,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_rotate_token,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_set_plugins_dir,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_pick_plugins_dir,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_set_consent,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_install_plugin,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_uninstall_plugin,
            #[cfg(not(feature = "basic"))]
            customization::client_bridge::client_bridge_export_plugin_zip,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_get_config,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_save_config,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_get_status,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_set_enabled,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_poll_now,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_clear_logs,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_apply_matched_mod,
            #[cfg(not(feature = "basic"))]
            customization::in_game_runner::in_game_runner_restore_defaults,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_get_config,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_save_config,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_pick_executable,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_probe,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_validate_mod,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_get_mod_states,
            #[cfg(not(feature = "basic"))]
            customization::game_adapter::game_adapter_restore_defaults,
            #[cfg(not(feature = "basic"))]
            customization::diagnostics::customization_diagnostics_bundle,
            #[cfg(not(feature = "basic"))]
            customization::diagnostics::game_adapter_self_test,
            #[cfg(not(feature = "basic"))]
            customization::skin_bootstrap::customization_bootstrap_status,
            #[cfg(not(feature = "basic"))]
            customization::skin_bootstrap::customization_bootstrap_ensure,
            #[cfg(not(feature = "basic"))]
            customization::skin_bootstrap::customization_bootstrap_provision,
            #[cfg(not(feature = "basic"))]
            customization::skin_catalog::skin_catalog_for_champion,
            #[cfg(not(feature = "basic"))]
            customization::skin_catalog::skin_catalog_for_numeric_champion,
            #[cfg(not(feature = "basic"))]
            customization::skin_catalog::skin_select,
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
                tauri::RunEvent::Exit => {
                    #[cfg(not(feature = "basic"))]
                    customization::game_adapter::shutdown_managed_backend();
                }
                _ => {}
            }
        });
}
