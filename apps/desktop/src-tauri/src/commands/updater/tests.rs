use super::crypto::*;
use super::models::*;
use super::platform::*;
use super::safety::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};

#[test]
fn test_semver_comparison() {
    assert!(is_newer("0.4.9", "0.4.8"));
    assert!(is_newer("0.5.0", "0.4.8"));
    assert!(is_newer("1.0.0", "0.4.8"));
    assert!(!is_newer("0.4.8", "0.4.8"));
    assert!(!is_newer("0.4.7", "0.4.8"));
    assert!(!is_newer("0.3.9", "0.4.8"));
    assert!(is_newer("v0.4.9", "0.4.8"));
    assert!(is_newer("0.4.8", "0.4.7"));
}

#[test]
fn test_signature_verification_valid_and_invalid() {
    use ed25519_dalek::{Signer, SigningKey};

    // Generate deterministic test keypair
    let seed = [42u8; 32];
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();

    let pubkey_base64 = STANDARD.encode(verifying_key.to_bytes());
    let payload = b"LAAP verified update payload v0.4.9";

    // Generate valid signature
    let sig = signing_key.sign(payload);
    let sig_base64 = STANDARD.encode(sig.to_bytes());

    // Valid signature passes
    assert!(verify_ed25519_signature(&pubkey_base64, &sig_base64, payload).is_ok());

    // Tampered payload fails
    let tampered = b"LAAP tampered payload v0.4.9";
    assert!(verify_ed25519_signature(&pubkey_base64, &sig_base64, tampered).is_err());

    // Corrupted signature fails
    let corrupt_sig = STANDARD.encode([0u8; 64]);
    assert!(verify_ed25519_signature(&pubkey_base64, &corrupt_sig, payload).is_err());
}

#[test]
fn test_edition_mismatch_detection() {
    // Matching edition and URL succeeds
    let offline = "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Offline-1.0.0-x64-setup.exe";
    let team = "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Desktop-1.0.0-x64-setup.exe";
    let studio = "https://github.com/Kingof3O/laap/releases/download/v1.0.0/LAAP-Studio-1.0.0-x64-setup.exe";
    assert!(validate_manifest_edition(Some("offline"), offline).is_ok());
    for edition in [None, Some(""), Some(" "), Some("team"), Some("studio")] {
        assert!(validate_manifest_edition(edition, offline).is_err());
    }
    for url in [team, studio, "https://example.test/LAAP-Offline.sh"] {
        assert!(validate_manifest_edition(Some("offline"), url).is_err());
    }
}

#[test]
fn test_payload_validation_empty_and_tampered() {
    let fake_sig = STANDARD.encode([0u8; 64]);
    let fake_pubkey = DEFAULT_UPDATER_PUBKEY;

    // Empty payload rejected
    assert!(validate_payload_bytes(&[], &fake_sig, fake_pubkey).is_err());

    // Corrupted payload rejected
    let corrupted_bytes = vec![0u8; 1024];
    assert!(validate_payload_bytes(&corrupted_bytes, &fake_sig, fake_pubkey).is_err());
}

#[test]
fn test_simultaneous_launch_transition_lock() {
    set_install_transition_active(false);
    assert!(!is_install_transition_active());

    set_install_transition_active(true);
    assert!(is_install_transition_active());

    // Reset state
    set_install_transition_active(false);
    assert!(!is_install_transition_active());
}

#[test]
fn test_platform_architecture_detection() {
    let platform = get_target_platform();
    assert!(!platform.is_empty());
}

#[test]
fn test_default_updater_pubkey_parsing() {
    // 1. DEFAULT_UPDATER_PUBKEY must parse successfully into a 32-byte Ed25519 public key
    let pubkey_bytes = parse_public_key_bytes(DEFAULT_UPDATER_PUBKEY)
        .expect("DEFAULT_UPDATER_PUBKEY must parse into 32-byte public key");
    assert_eq!(pubkey_bytes.len(), 32);
    assert!(!pubkey_bytes.iter().all(|&b| b == 0));

    // 2. DEFAULT_UPDATER_PUBKEY must parse successfully into a Minisign PublicKey struct
    let minisign_pubkey = parse_minisign_public_key(DEFAULT_UPDATER_PUBKEY)
        .expect("DEFAULT_UPDATER_PUBKEY must parse into minisign PublicKey");
    assert_eq!(
        minisign_pubkey.untrusted_comment(),
        Some("untrusted comment: minisign public key: 5A7A4FE748D1E7F8")
    );
}

#[test]
fn test_tauri_cli_real_signature_verification_and_tamper_detection() {
    // Pinned test public key produced by `tauri signer generate`
    let test_pubkey = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUyN0MzMUQ5QUI0NTNBNUEKUldSYU9rV3IyVEY4VWhuVGRTcHhnVW1vbldzTWZnZVh3VmNudjdVQTNKQzM2SkZlQzg1Qm9PeDMK";

    #[cfg(target_os = "macos")]
    let (test_signature, genuine_payload) = {
        let sig = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYU9rV3IyVEY4VXZrckJrL0NpNWt3MWU1a0pReDEzaC9xME5ySFRtcHRyVndRUlRzQ09FRGJKd1Qzdk5mWmpuenhEQW5qM0NmWEdmdHZCeTZDZWE2dWhFNTQ4UTg1UlFBPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0Mjc5MjM4CWZpbGU6bGFhcC1tYWMtcGF5bG9hZC5iaW4KdENweDBLT3BvT3ZHYjJyN3FpNHNrbkF4NUhxVVp0cjhCVzdZdzhKdnFCZVVaRHE0YzZqM1hPUVp2blZ1UXA5YVZuNWtmQnBlTGdNYXNlVEF5b2ZJQVE9PQo=";
        let mut payload = vec![0x1f, 0x8b, 0x08, 0x00];
        payload.extend_from_slice(b"LAAP Verified Release Update Executable Payload v1.1.0");
        (sig, payload)
    };

    #[cfg(not(target_os = "macos"))]
    let (test_signature, genuine_payload) = {
        let sig = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYU9rV3IyVEY4VWh2ZXhMSDE5QldrYTNMdVVyV3JoMmlJMkdOem1BVXJtL2lVOUNWQUhpV1JNVndxMVVRN0JKL3B3dlpYNjc3clBVTEhUMXpDdFY1VzdjeXRhL1J3cHdVPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0Mjc5MjM4CWZpbGU6bGFhcC13aW4tcGF5bG9hZC5iaW4KVlBUaG5BNEJTb3JOMlNSdWdpKzhvcnl2YUNiYW5pNk5uMFF5YjFaK0FqL3hSRDJDdDF6SFJsSlRxWGc4ZEVicjFINVU4NVhaR1ZFdWR2emYydDlnREE9PQo=";
        let mut payload = vec![0x4d, 0x5a, 0x90, 0x00];
        payload.extend_from_slice(b"LAAP Verified Release Update Executable Payload v1.1.0");
        (sig, payload)
    };

    // 1. Genuine payload verification passes through production verify_ed25519_signature
    let verify_res = verify_ed25519_signature(test_pubkey, test_signature, &genuine_payload);
    assert!(
        verify_res.is_ok(),
        "Genuine Tauri CLI signature must verify: {:?}",
        verify_res
    );

    // 2. Genuine payload verification passes through production validate_payload_bytes (checks magic bytes + signature)
    let payload_res = validate_payload_bytes(&genuine_payload, test_signature, test_pubkey);
    assert!(
        payload_res.is_ok(),
        "Genuine payload must pass validate_payload_bytes: {:?}",
        payload_res
    );

    // 3. Tampered payload fails closed (1 byte altered in body)
    let mut tampered_payload = genuine_payload.clone();
    tampered_payload[10] ^= 0xff;
    assert!(verify_ed25519_signature(test_pubkey, test_signature, &tampered_payload).is_err());
    assert!(validate_payload_bytes(&tampered_payload, test_signature, test_pubkey).is_err());

    // 4. Tampered signature fails closed (corrupted signature bytes)
    let decoded_text = String::from_utf8(STANDARD.decode(test_signature).unwrap()).unwrap();
    let mut lines: Vec<String> = decoded_text.lines().map(|s| s.to_string()).collect();
    let corrupted_line2 = format!("{}AAAA", &lines[1][..lines[1].len() - 4]);
    lines[1] = corrupted_line2;
    let tampered_sig_text = lines.join("\n");
    let tampered_signature = STANDARD.encode(tampered_sig_text);
    assert!(
        verify_ed25519_signature(test_pubkey, &tampered_signature, &genuine_payload).is_err()
    );

    // 5. Wrong key fails closed (verifying with DEFAULT_UPDATER_PUBKEY instead of test_pubkey)
    assert!(
        verify_ed25519_signature(DEFAULT_UPDATER_PUBKEY, test_signature, &genuine_payload)
            .is_err()
    );
}

#[test]
fn test_live_tauri_cli_signing_integration() {
    let keygen_output = std::process::Command::new("npx")
        .args(&["--workspace", "@laap/desktop", "tauri", "signer", "generate", "-p", ""])
        .output();

    let (privkey, pubkey) = match keygen_output {
        Ok(ref output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut lines = stdout.lines();
            let mut priv_opt = None;
            let mut pub_opt = None;
            while let Some(line) = lines.next() {
                if line.contains("Private:") {
                    priv_opt = lines.next().map(|s| s.trim().to_string());
                } else if line.contains("Public:") {
                    pub_opt = lines.next().map(|s| s.trim().to_string());
                }
            }
            match (priv_opt, pub_opt) {
                (Some(privk), Some(pubk)) if !privk.is_empty() && !pubk.is_empty() => (privk, pubk),
                _ => return,
            }
        }
        _ => return,
    };

    let temp_dir = std::env::temp_dir();
    let payload_path = temp_dir.join(format!("laap_live_sign_test_{}.bin", std::process::id()));

    #[cfg(target_os = "macos")]
    let mut test_payload = vec![0x1f, 0x8b, 0x08, 0x00];
    #[cfg(not(target_os = "macos"))]
    let mut test_payload = vec![0x4d, 0x5a, 0x90, 0x00];
    test_payload.extend_from_slice(b"Live Tauri Signer Integration Test Binary Payload");

    std::fs::write(&payload_path, &test_payload).expect("write test payload");

    let sign_result = std::process::Command::new("npx")
        .args(&[
            "--workspace",
            "@laap/desktop",
            "tauri",
            "signer",
            "sign",
            "-p",
            "",
            payload_path.to_str().unwrap(),
        ])
        .env("TAURI_SIGNING_PRIVATE_KEY", &privkey)
        .output();

    if let Ok(output) = sign_result {
        if output.status.success() {
            let sig_path = temp_dir.join(format!(
                "laap_live_sign_test_{}.bin.sig",
                std::process::id()
            ));
            if sig_path.exists() {
                let sig_content = std::fs::read_to_string(&sig_path).expect("read sig file");

                // Validate with exact production functions
                let valid = validate_payload_bytes(&test_payload, sig_content.trim(), &pubkey);
                assert!(
                    valid.is_ok(),
                    "Live Tauri CLI signature must validate: {:?}",
                    valid
                );

                // Tamper detection with live signature
                let mut tampered = test_payload.clone();
                tampered[6] ^= 0xaa;
                let invalid = validate_payload_bytes(&tampered, sig_content.trim(), &pubkey);
                assert!(invalid.is_err(), "Tampered payload must fail verification");

                let _ = std::fs::remove_file(sig_path);
            }
        }
    }

    let _ = std::fs::remove_file(payload_path);
}
