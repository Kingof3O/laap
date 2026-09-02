pub mod device;
pub mod session;
pub mod local_store;
mod commands;

pub use device::DeviceIdentity;
pub use session::{RiotProvisioner, RiotSessionManager};
pub use local_store::{LocalAccount, LocalAccountSummary, LocalStore};

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::device_public_key,
            commands::sign_device_nonce,
            commands::is_riot_running,
            commands::close_riot_client,
            commands::device_platform,
            commands::inject_account_session,
            commands::cleanup_account_session,
            commands::capture_active_session,
            commands::start_provisioning_session,
            commands::poll_provisioning_session,
            commands::finish_provisioning_session,
            commands::cancel_provisioning_session,
            commands::launch_riot_client,
            commands::list_local_accounts,
            commands::get_local_account,
            commands::save_local_account,
            commands::delete_local_account,
            commands::launch_local_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running LAAP desktop")
}
