//! Append-only customization operation journal.
//!
//! Records adapter apply/stage/restore operations so users can audit and
//! recover from partial failures. Bounded to the most recent entries.

use super::{game_adapter::now_unix, storage};
use serde::{Deserialize, Serialize};
use std::path::Path;

const JOURNAL_FILE: &str = "customization_journal.json";
const MAX_ENTRIES: usize = 200;
const MAX_BYTES: u64 = 256 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum JournalAction {
    Validate,
    Stage,
    Activate,
    Restore,
    Defer,
    Fail,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub at: u64,
    pub action: JournalAction,
    pub mod_hashes: Vec<String>,
    pub adapter_version: Option<String>,
    pub game_build: Option<String>,
    pub detail: String,
}

fn journal_path(root: &Path) -> std::path::PathBuf {
    root.join(JOURNAL_FILE)
}

/// Append one entry, keeping the newest `MAX_ENTRIES` (newest last on disk).
pub fn append_at(root: &Path, entry: JournalEntry) -> Result<(), String> {
    let mut entries = storage::read::<Vec<JournalEntry>>(&journal_path(root), MAX_BYTES)?
        .unwrap_or_default();
    entries.push(entry);
    if entries.len() > MAX_ENTRIES {
        let excess = entries.len() - MAX_ENTRIES;
        entries.drain(0..excess);
    }
    storage::write(&journal_path(root), &entries)
}

/// Read the newest `limit` entries, newest first.
pub fn read_recent_at(root: &Path, limit: usize) -> Result<Vec<JournalEntry>, String> {
    let mut entries = storage::read::<Vec<JournalEntry>>(&journal_path(root), MAX_BYTES)?
        .unwrap_or_default();
    entries.reverse();
    entries.truncate(limit.min(MAX_ENTRIES));
    Ok(entries)
}

/// Convenience record used by adapter hooks.
pub fn record(
    root: &Path,
    action: JournalAction,
    mod_hashes: &[String],
    adapter_version: Option<&str>,
    game_build: Option<&str>,
    detail: impl Into<String>,
) {
    let _ = append_at(
        root,
        JournalEntry {
            at: now_unix(),
            action,
            mod_hashes: mod_hashes.to_vec(),
            adapter_version: adapter_version.map(str::to_string),
            game_build: game_build.map(str::to_string),
            detail: detail.into(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "laap-journal-{tag}-{}",
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn entry(action: JournalAction, detail: &str) -> JournalEntry {
        JournalEntry {
            at: now_unix(),
            action,
            mod_hashes: vec!["a".repeat(64)],
            adapter_version: Some("1.0".into()),
            game_build: Some("14.1".into()),
            detail: detail.into(),
        }
    }

    #[test]
    fn reads_newest_first_and_persists() {
        let root = temp_root("order");
        append_at(&root, entry(JournalAction::Stage, "one")).unwrap();
        append_at(&root, entry(JournalAction::Activate, "two")).unwrap();
        append_at(&root, entry(JournalAction::Restore, "three")).unwrap();

        let recent = read_recent_at(&root, 2).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].detail, "three");
        assert_eq!(recent[1].detail, "two");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn caps_entries_to_maximum() {
        let root = temp_root("cap");
        for i in 0..(MAX_ENTRIES + 10) {
            append_at(&root, entry(JournalAction::Fail, &format!("e{i}"))).unwrap();
        }
        let all = read_recent_at(&root, MAX_ENTRIES + 100).unwrap();
        assert_eq!(all.len(), MAX_ENTRIES);
        assert_eq!(all[0].detail, format!("e{}", MAX_ENTRIES + 9));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn record_swallows_no_io_errors_but_writes() {
        let root = temp_root("record");
        record(&root, JournalAction::Defer, &["b".repeat(64)], None, None, "deferred");
        let entries = read_recent_at(&root, 1).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, JournalAction::Defer);
        std::fs::remove_dir_all(root).unwrap();
    }
}
