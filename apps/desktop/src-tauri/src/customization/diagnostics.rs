//! Diagnostics bundle and non-destructive adapter self-test.
//!
//! The bundle is redacted: it never includes bearer tokens or absolute paths.
//! The self-test only probes/validates; it never activates or restores.

use super::{game_adapter, game_path, journal, library, storage};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsBundle {
    pub generated_at: u64,
    pub app_version: String,
    pub platform: String,
    pub adapter_configured: bool,
    pub adapter_consent_granted: bool,
    pub adapter_clearance_acknowledged: bool,
    pub last_verified_version: Option<String>,
    pub last_verified_sha256_present: bool,
    pub detected_game_build: Option<String>,
    pub library_mod_count: usize,
    pub enabled_mod_count: usize,
    pub recent_journal: Vec<journal::JournalEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestStep {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

/// Build a redacted diagnostics payload for support/debugging.
pub fn build_diagnostics_at(root: &Path) -> Result<DiagnosticsBundle, String> {
    let config = game_adapter::load_config_at(root)?;
    let mods = library::list_installed_at(root)?;
    let install = game_path::resolve_game_install_info_at(&root.join("game_path.json"), None);

    Ok(DiagnosticsBundle {
        generated_at: game_adapter::now_unix(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        adapter_configured: config.adapter_path.is_some(),
        adapter_consent_granted: config.user_consent_granted,
        adapter_clearance_acknowledged: config.clearance_acknowledged,
        last_verified_version: config.last_verified_version,
        last_verified_sha256_present: config.last_verified_sha256.is_some(),
        detected_game_build: install.detected_build,
        library_mod_count: mods.len(),
        enabled_mod_count: mods.iter().filter(|m| m.enabled).count(),
        recent_journal: journal::read_recent_at(root, 20)?,
    })
}

/// Run probe + validation only. Returns one step per check.
pub fn run_self_test_at(root: &Path) -> Vec<SelfTestStep> {
    let opts = game_adapter::ProbeOptions {
        allow_path_discovery: true,
        ..game_adapter::ProbeOptions::default()
    };
    let probe = game_adapter::probe_adapter_at(root, &opts);
    let mut steps = vec![SelfTestStep {
        name: "adapter-probe".into(),
        ok: probe.compatible,
        detail: format!("{} ({})", probe.state.as_summary(), probe.detail),
    }];

    let candidates = match library::all_candidate_specs(root) {
        Ok(items) => items,
        Err(err) => {
            steps.push(SelfTestStep {
                name: "library".into(),
                ok: false,
                detail: err,
            });
            return steps;
        }
    };
    steps.push(SelfTestStep {
        name: "library".into(),
        ok: true,
        detail: format!("{} package(s) available", candidates.len()),
    });

    if !probe.compatible {
        return steps;
    }

    for cand in candidates.iter().filter(|c| c.valid).take(5) {
        let entry = game_adapter::validate_single_candidate_at(root, cand, &opts);
        match entry {
            Ok(entry) => steps.push(SelfTestStep {
                name: format!("validate:{}", cand.name),
                ok: !matches!(entry.state, game_adapter::ModRuntimeState::Failed),
                detail: entry.detail,
            }),
            Err(err) => steps.push(SelfTestStep {
                name: format!("validate:{}", cand.name),
                ok: false,
                detail: err,
            }),
        }
    }

    steps
}

#[tauri::command]
pub fn customization_diagnostics_bundle(app: AppHandle) -> Result<DiagnosticsBundle, String> {
    let root = storage::root(&app)?;
    build_diagnostics_at(&root)
}

#[tauri::command]
pub async fn game_adapter_self_test(app: AppHandle) -> Result<Vec<SelfTestStep>, String> {
    let root = storage::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || Ok(run_self_test_at(&root)))
        .await
        .map_err(|e| format!("Self-test failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::customization::journal::{append_at, JournalAction, JournalEntry};

    #[test]
    fn bundle_redacts_paths_and_reports_counts() {
        let root = std::env::temp_dir().join(format!(
            "laap-diag-{}",
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&root).unwrap();
        append_at(
            &root,
            JournalEntry {
                at: game_adapter::now_unix(),
                action: JournalAction::Activate,
                mod_hashes: vec!["a".repeat(64)],
                adapter_version: Some("1.0".into()),
                game_build: Some("14.1".into()),
                detail: "applied".into(),
            },
        )
        .unwrap();

        let bundle = build_diagnostics_at(&root).unwrap();
        let json = serde_json::to_string(&bundle).unwrap();
        assert!(json.contains("\"libraryModCount\":0"));
        assert_eq!(bundle.recent_journal.len(), 1);
        assert!(!json.contains(&root.to_string_lossy().to_string()));
        assert!(!json.contains("token"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
