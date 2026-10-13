pub mod paths;
pub mod process;
pub mod provisioner;
mod session_format;
pub mod session_manager;

pub use paths::{detect_riot_data_dir, RIOT_SETTINGS_FILENAMES};
pub use process::{is_riot_running, runtime_snapshot, terminate_riot_processes, RuntimeSnapshot};
pub use provisioner::RiotProvisioner;
pub use session_manager::RiotSessionManager;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn current_session_is_detected_by_import_and_provisioning() {
        let temp_dir = std::env::temp_dir().join(format!(
            "riot_current_format_test_{}_{}",
            std::process::id(),
            rand::random::<u32>()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let manager = RiotSessionManager::with_custom_dir(temp_dir.clone());
        let provisioner = RiotProvisioner::with_manager(manager.clone());
        let settings = "psl:\n  authorization:\n    riot-client:\n      refresh_token: test-refresh-token\nriot-login:\n  persist: null\n";

        // An empty first candidate must not hide a valid second candidate.
        fs::write(
            temp_dir.join(RIOT_SETTINGS_FILENAMES[0]),
            "remember_me: false\n",
        )
        .unwrap();
        fs::write(temp_dir.join(RIOT_SETTINGS_FILENAMES[1]), settings).unwrap();
        assert_eq!(manager.read_active_session().as_deref(), Some(settings));
        assert_eq!(
            provisioner.poll_captured_session().unwrap().as_deref(),
            Some(settings)
        );

        fs::write(
            temp_dir.join(RIOT_SETTINGS_FILENAMES[1]),
            "riot-login:\n  persist: null\n",
        )
        .unwrap();
        assert_eq!(manager.read_active_session(), None);
        assert_eq!(provisioner.poll_captured_session().unwrap(), None);
        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_session_injection_and_cleanup() {
        let temp_dir = std::env::temp_dir().join(format!("riot_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let manager = RiotSessionManager::with_custom_dir(temp_dir.clone());
        let dummy_yaml = "login_remember_me_tokens: dummy_token\n";

        // Inject
        let inject_res = manager.inject_session(dummy_yaml);
        assert!(inject_res.is_ok());

        // Check active session
        let active = manager.read_active_session();
        assert_eq!(active, Some(dummy_yaml.to_string()));

        // Cleanup
        let cleanup_res = manager.cleanup_session();
        assert!(cleanup_res.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_provisioner_flow() {
        let temp_dir = std::env::temp_dir().join(format!("riot_prov_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let manager = RiotSessionManager::with_custom_dir(temp_dir.clone());
        let mut provisioner = RiotProvisioner::with_manager(manager.clone());

        assert!(provisioner.prepare_for_provisioning().is_ok());

        // Simulate Riot Client writing token
        let target_file = temp_dir.join("RiotClientPrivateSettings.yaml");
        let _ = fs::write(&target_file, "rso_token: captured_test_token\n");

        let polled = provisioner.poll_captured_session();
        assert!(polled.is_ok());
        assert!(polled.unwrap().is_some());

        assert!(provisioner.finish_and_restore().is_ok());
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_recover_orphaned_session_restores_original_settings() {
        let temp_dir =
            std::env::temp_dir().join(format!("riot_recover_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let manager = RiotSessionManager::with_custom_dir(temp_dir.clone());
        let target_file = temp_dir.join("RiotClientPrivateSettings.yaml");
        fs::write(&target_file, "original: true\n").unwrap();
        manager.inject_session("rso_token: temporary\n").unwrap();
        assert!(fs::read_to_string(&target_file)
            .unwrap()
            .contains("temporary"));
        let recovered = manager.recover_orphaned_session().unwrap();
        assert!(recovered);
        assert_eq!(
            fs::read_to_string(&target_file).unwrap(),
            "original: true\n"
        );
        assert!(!manager.backup_file_paths().iter().any(|path| path.exists()));
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
