pub mod crypto;
pub mod manager;
pub mod models;
pub mod storage;

pub use manager::{LocalStore, ProfileDetails};
pub use models::{LocalAccount, LocalAccountSummary, ProfileCustomization};
pub use storage::LocalAccountStorage;

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use std::fs;

    #[test]
    fn test_local_store_crud() {
        let test_dir = temp_dir().join(format!("laap-test-local-{}", rand::random::<u32>()));
        let store = LocalStore::with_custom_dir(test_dir.clone());

        // 1. Initial list empty
        assert_eq!(store.load_accounts().unwrap().len(), 0);

        // 2. Add accounts
        let acc1 = store
            .add_account(
                "Test#EUW".to_string(),
                "EUW".to_string(),
                "rso_token: yaml-data-1".to_string(),
                Some(" Diamond II ".to_string()),
            )
            .unwrap();
        let acc2 = store
            .add_account(
                "Test#NA".to_string(),
                "NA".to_string(),
                "rso_token: yaml-data-2".to_string(),
                None,
            )
            .unwrap();

        let list = store.load_accounts().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Test#EUW");
        assert_eq!(list[1].name, "Test#NA");
        assert_eq!(list[0].rank.as_deref(), Some("Diamond II"));
        assert_eq!(list[1].rank, None);
        let raw = fs::read_to_string(test_dir.join(super::storage::LOCAL_STORE_FILENAME)).unwrap();
        assert!(!raw.contains("rso_token: yaml-data-1"));
        assert!(raw.contains("laap-local:v1:"));

        // 3. Summaries
        let summaries = store.list_summaries().unwrap();
        assert_eq!(summaries.len(), 2);
        assert!(summaries[0].has_session);
        assert_eq!(summaries[0].rank.as_deref(), Some("Diamond II"));

        // 4. Delete acc1
        store.delete_account(&acc1.id).unwrap();
        let list_after = store.load_accounts().unwrap();
        assert_eq!(list_after.len(), 1);
        assert_eq!(list_after[0].id, acc2.id);

        let _ = fs::remove_dir_all(&test_dir);
    }
}

#[cfg(test)]
mod safety_tests {
    use super::*;
    fn store() -> (LocalStore, std::path::PathBuf) {
        let path =
            std::env::temp_dir().join(format!("laap-vault-safety-{:032x}", rand::random::<u128>()));
        (LocalStore::with_custom_dir(path.clone()), path)
    }
    #[test]
    fn isolates_corrupt_records_and_preserves_quarantine() {
        let (store, path) = store();
        store
            .add_account(
                "Valid".into(),
                "EUW".into(),
                "rso_token: valid".into(),
                None,
            )
            .unwrap();
        let file = path.join(storage::LOCAL_STORE_FILENAME);
        let mut rows: Vec<serde_json::Value> =
            serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        let mut damaged = rows[0].clone();
        damaged["id"] = "broken".into();
        damaged["session_blob"] = "laap-local:v1:broken".into();
        rows.push(damaged);
        rows.push(serde_json::json!({"id":123}));
        std::fs::write(&file, serde_json::to_vec(&rows).unwrap()).unwrap();
        let valid = store.load_accounts().unwrap();
        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].name, "Valid");
        assert_eq!(
            std::fs::read_dir(&path)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|e| e.file_name().to_string_lossy().starts_with("quarantine-"))
                .count(),
            2
        );
        assert_eq!(store.load_accounts().unwrap().len(), 1);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn completely_damaged_vault_is_preserved_and_reported() {
        let (store, path) = store();
        std::fs::create_dir_all(&path).unwrap();
        let file = path.join(storage::LOCAL_STORE_FILENAME);
        let bytes = b"[{\"id\":123}]";
        std::fs::write(&file, bytes).unwrap();
        assert!(store.load_accounts().is_err());
        assert_eq!(std::fs::read(file).unwrap(), bytes);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn concurrent_additions_do_not_overwrite_each_other() {
        let (store, path) = store();
        let handles: Vec<_> = (0..16)
            .map(|index| {
                let store = store.clone();
                std::thread::spawn(move || {
                    store
                        .add_account(
                            format!("Account {index}"),
                            "NA".into(),
                            "rso_token: test".into(),
                            None,
                        )
                        .unwrap()
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(store.load_accounts().unwrap().len(), 16);
        assert!(!std::fs::read_dir(&path)
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.path().extension().is_some_and(|x| x == "tmp")));
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn refresh_preserves_profile_metadata_and_rejects_wrong_identity() {
        let (store, path) = store();
        let details = ProfileDetails {
            name: "Main".into(),
            region: "EUW".into(),
            rank: Some("Gold I".into()),
            notes: "Custom note".into(),
            favorite: true,
            customization: None,
        };
        let original = store
            .create_profile(details, "rso_token: old\nsub: player-one".into())
            .unwrap();
        store
            .refresh_session(&original.id, "rso_token: new\nsub: player-one".into())
            .unwrap();
        assert!(store
            .refresh_session(&original.id, "rso_token: new\nsub: player-two".into())
            .is_err());
        let current = store.load_accounts().unwrap().remove(0);
        assert_eq!(
            (
                current.name,
                current.region,
                current.rank,
                current.notes,
                current.favorite,
                current.created_at
            ),
            (
                original.name,
                original.region,
                original.rank,
                original.notes,
                original.favorite,
                original.created_at
            )
        );
        assert!(current.session_blob.contains("new"));
        std::fs::remove_dir_all(path).unwrap();
    }
}

#[cfg(test)]
mod customization_tests {
    use super::*;
    #[test]
    fn sync_requires_matching_identity_and_rechecks_each_opt_in() {
        let path = std::env::temp_dir().join(format!(
            "laap-customization-{:032x}",
            rand::random::<u128>()
        ));
        let store = LocalStore::with_custom_dir(path.clone());
        let details = ProfileDetails {
            name: "Main".into(),
            region: "SG".into(),
            rank: Some("Silver II".into()),
            notes: "Do not lose these notes".into(),
            favorite: true,
            customization: Some(ProfileCustomization {
                auto_sync_icon: true,
                auto_sync_rank: true,
                ..Default::default()
            }),
        };
        let profile = store
            .create_profile(
                details.clone(),
                "rso_token: test\nsub: expected-player".into(),
            )
            .unwrap();
        assert!(!store
            .apply_customization_sync(
                &profile.id,
                "wrong-player",
                Some("Challenger".into()),
                Some(("dd-16.20.1-685.png".into(), 685))
            )
            .unwrap());
        assert!(store
            .apply_customization_sync(
                &profile.id,
                "expected-player",
                Some("Diamond II".into()),
                Some(("dd-16.20.1-685.png".into(), 685))
            )
            .unwrap());
        // A stale editor still containing the previous rank/icon must not revert a fresh auto-sync.
        store.edit_profile(&profile.id, details.clone()).unwrap();
        let current = store.load_accounts().unwrap().remove(0);
        assert_eq!(current.rank.as_deref(), Some("Diamond II"));
        assert_eq!(current.customization.icon_id, Some(685));
        assert_eq!(current.notes, "Do not lose these notes");
        assert!(current.favorite);
        // Turning both switches off while an LCU response is pending prevents that response from overwriting manual choices.
        let mut manual = details;
        manual.rank = Some("Gold I".into());
        manual.customization = Some(ProfileCustomization::default());
        store.edit_profile(&profile.id, manual).unwrap();
        assert!(!store
            .apply_customization_sync(
                &profile.id,
                "expected-player",
                Some("Challenger".into()),
                Some(("dd-16.20.1-999.png".into(), 999))
            )
            .unwrap());
        let current = store.load_accounts().unwrap().remove(0);
        assert_eq!(current.rank.as_deref(), Some("Gold I"));
        assert_eq!(current.customization.icon_asset, None);
        std::fs::remove_dir_all(path).unwrap();
    }
}

#[cfg(test)]
mod independent_sync_tests {
    use super::*;
    #[test]
    fn rank_sync_does_not_replace_a_manual_avatar() {
        let root =
            std::env::temp_dir().join(format!("laap-rank-sync-{:032x}", rand::random::<u128>()));
        let store = LocalStore::with_custom_dir(root.clone());
        let profile = store
            .create_profile(
                ProfileDetails {
                    name: "Main".into(),
                    region: "ME".into(),
                    rank: Some("Gold I".into()),
                    notes: String::new(),
                    favorite: false,
                    customization: Some(ProfileCustomization {
                        icon_asset: Some("upload-example.png".into()),
                        icon_source: Some("upload".into()),
                        icon_id: None,
                        auto_sync_icon: false,
                        auto_sync_rank: true,
                    }),
                },
                "rso_token: test\nsub: player".into(),
            )
            .unwrap();
        assert!(store
            .apply_customization_sync(
                &profile.id,
                "player",
                Some("Emerald IV".into()),
                Some(("dd-16.20.1-685.png".into(), 685))
            )
            .unwrap());
        let current = store.load_accounts().unwrap().remove(0);
        assert_eq!(current.rank.as_deref(), Some("Emerald IV"));
        assert_eq!(
            current.customization.icon_asset.as_deref(),
            Some("upload-example.png")
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
