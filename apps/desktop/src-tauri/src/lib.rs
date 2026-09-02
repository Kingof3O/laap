pub mod device;
pub mod session;
pub mod local_store;
pub mod commands;

pub use device::DeviceIdentity;
pub use session::{RiotProvisioner, RiotSessionManager};
pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::device::device_public_key,
            commands::device::sign_device_nonce,
            commands::device::device_platform,
            commands::session::is_riot_running,
            commands::session::close_riot_client,
            commands::session::inject_account_session,
            commands::session::cleanup_account_session,
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
            commands::local_accounts::launch_local_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
