pub mod commands;
pub mod device;
pub mod local_store;
pub mod riot;

pub use device::DeviceIdentity;
pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};
pub use riot as session;
pub use riot::{RiotProvisioner, RiotSessionManager};

pub fn run() {
    tauri::Builder::default()
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
            commands::session::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
