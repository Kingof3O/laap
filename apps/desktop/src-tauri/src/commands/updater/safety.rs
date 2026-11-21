use std::sync::atomic::{AtomicBool, Ordering};
use super::crypto::verify_ed25519_signature;

static INSTALL_TRANSITION_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Returns whether an update installation transition is currently in progress.
pub fn is_install_transition_active() -> bool {
    INSTALL_TRANSITION_ACTIVE.load(Ordering::SeqCst)
}

/// Explicitly updates the update installation transition state.
pub fn set_install_transition_active(active: bool) {
    INSTALL_TRANSITION_ACTIVE.store(active, Ordering::SeqCst);
}

pub struct TransitionGuard {
    pub active: bool,
}

impl Drop for TransitionGuard {
    fn drop(&mut self) {
        if self.active {
            INSTALL_TRANSITION_ACTIVE.store(false, Ordering::SeqCst);
        }
    }
}

pub fn validate_manifest_edition(
    manifest_edition: Option<&str>,
    download_url: &str,
) -> Result<(), String> {
    // 1. Mandatory edition metadata enforcement: fail closed on missing, empty, or whitespace-only edition
    let declared = match manifest_edition {
        Some(e) if !e.trim().is_empty() => e.trim(),
        _ => {
            return Err("Security violation: Missing mandatory edition metadata in update manifest. Updates without explicit edition metadata are rejected.".to_string());
        }
    };

    let app_edition = crate::product::update_channel();
    if !declared.eq_ignore_ascii_case(app_edition) {
        return Err(format!(
            "Edition isolation violation: Manifest declared edition '{declared}' does not match installed application edition '{app_edition}'"
        ));
    }

    // 2. Reliable artifact identity checks on download URL and file basename
    let file_name = download_url
        .split('/')
        .last()
        .unwrap_or("")
        .to_lowercase();

    if file_name.is_empty() {
        return Err("Security violation: Download URL has no valid artifact filename.".to_string());
    }

    if !file_name.contains("offline")
        || file_name.contains("studio")
        || file_name.contains("team")
        || file_name.contains("desktop")
    {
        return Err(format!(
            "Artifact identity mismatch: expected an Offline update artifact, got '{file_name}'."
        ));
    }

    // Verify valid artifact extension for platform
    let valid_extensions = [
        ".zip",
        ".nsis.zip",
        ".exe",
        ".msi",
        ".dmg",
        ".tar.gz",
        ".app.tar.gz",
    ];
    if !valid_extensions.iter().any(|ext| file_name.ends_with(ext)) {
        return Err(format!(
            "Security violation: Artifact '{file_name}' has invalid or untrusted extension for update payload."
        ));
    }

    Ok(())
}

/// Validates downloaded payload bytes for non-emptiness, valid container magic bytes, and signature integrity
pub fn validate_payload_bytes(
    bytes: &[u8],
    signature_str: &str,
    public_key_str: &str,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("Security violation: Downloaded update payload is empty (0 bytes).".into());
    }

    // Header magic checks for reliable artifact verification
    #[cfg(target_os = "windows")]
    {
        let is_zip = bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04";
        let is_pe = bytes.len() >= 2 && &bytes[0..2] == b"MZ";
        if !is_zip && !is_pe {
            return Err(
                "Security violation: Downloaded Windows update payload lacks valid ZIP or PE magic header."
                    .into(),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        let is_gzip = bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
        if !is_gzip {
            return Err(
                "Security violation: Downloaded macOS update payload lacks valid gzip magic header."
                    .into(),
            );
        }
    }

    // Verify cryptographic Ed25519 signature
    verify_ed25519_signature(public_key_str, signature_str, bytes)
}
