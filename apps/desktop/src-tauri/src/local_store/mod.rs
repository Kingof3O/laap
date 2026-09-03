pub mod manager;
pub mod models;
pub mod storage;

pub use manager::LocalStore;
pub use models::{LocalAccount, LocalAccountSummary};
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
                "yaml-data-1".to_string(),
            )
            .unwrap();
        let acc2 = store
            .add_account(
                "Test#NA".to_string(),
                "NA".to_string(),
                "yaml-data-2".to_string(),
            )
            .unwrap();

        let list = store.load_accounts().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Test#EUW");
        assert_eq!(list[1].name, "Test#NA");

        // 3. Summaries
        let summaries = store.list_summaries().unwrap();
        assert_eq!(summaries.len(), 2);
        assert!(summaries[0].has_session);

        // 4. Delete acc1
        store.delete_account(&acc1.id).unwrap();
        let list_after = store.load_accounts().unwrap();
        assert_eq!(list_after.len(), 1);
        assert_eq!(list_after[0].id, acc2.id);

        let _ = fs::remove_dir_all(&test_dir);
    }
}
