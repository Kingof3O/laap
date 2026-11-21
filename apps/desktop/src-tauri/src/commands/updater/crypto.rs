use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

/// Parses a Minisign PublicKey from Tauri's base64 config, raw textual Minisign format, or 42-byte base64.
pub fn parse_minisign_public_key(raw_key: &str) -> Result<minisign_verify::PublicKey, String> {
    let trimmed = raw_key.trim();

    // 1. If already raw textual Minisign format
    if trimmed.contains("minisign public key") {
        return minisign_verify::PublicKey::decode(trimmed)
            .map_err(|e| format!("Failed to parse textual minisign public key: {e}"));
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for public key: {e}"))?;

    // 2a. If it's UTF-8 text containing minisign public key (Tauri's base64-encoded minisign.pub)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("minisign public key") {
            return minisign_verify::PublicKey::decode(text)
                .map_err(|e| format!("Failed to parse decoded textual minisign public key: {e}"));
        }
    }

    // 2b. If it was the 42-byte base64 string directly
    if decoded.len() == 42 {
        return minisign_verify::PublicKey::from_base64(trimmed)
            .map_err(|e| format!("Failed to parse 42-byte minisign public key: {e}"));
    }

    Err(format!(
        "Invalid minisign public key format: expected 42-byte base64 or Minisign public key record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a Minisign Signature from Tauri's base64 manifest signature or raw 4-line signature format.
pub fn parse_minisign_signature(raw_sig: &str) -> Result<minisign_verify::Signature, String> {
    let trimmed = raw_sig.trim();

    // 1. If already 4-line textual Minisign signature format
    if trimmed.contains("untrusted comment") {
        return minisign_verify::Signature::decode(trimmed)
            .map_err(|e| format!("Failed to parse textual minisign signature: {e}"));
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for signature: {e}"))?;

    // 2a. If it's UTF-8 text containing untrusted comment (Tauri's base64-encoded signature in update.json)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("untrusted comment") {
            return minisign_verify::Signature::decode(text)
                .map_err(|e| format!("Failed to parse decoded minisign signature record: {e}"));
        }
    }

    Err(format!(
        "Invalid minisign signature: expected Minisign signature record or base64-encoded record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a 32-byte ed25519 public key from either raw base64 or Minisign public key format
pub fn parse_public_key_bytes(raw_key: &str) -> Result<[u8; 32], String> {
    let trimmed = raw_key.trim();

    // 1. If the input directly contains textual minisign key lines
    if trimmed.contains("minisign public key") {
        let line2 = trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign public key format: missing key line".to_string())?
            .trim();
        let decoded = STANDARD
            .decode(line2)
            .map_err(|e| format!("Base64 decoding failed for minisign public key: {e}"))?;
        if decoded.len() == 42 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&decoded[10..42]);
            return Ok(key);
        } else if decoded.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&decoded);
            return Ok(key);
        } else {
            return Err(format!(
                "Invalid public key length in minisign line: expected 32 or 42 bytes, got {}",
                decoded.len()
            ));
        }
    }

    // 2. Decode the base64 string
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for public key: {e}"))?;

    // 2a. Raw 32-byte ed25519 public key
    if decoded.len() == 32 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded);
        return Ok(key);
    }

    // 2b. Minisign 42 bytes (2 bytes algorithm + 8 bytes key ID + 32 bytes pubkey)
    if decoded.len() == 42 {
        let mut key = [0u8; 32];
        key.copy_from_slice(&decoded[10..42]);
        return Ok(key);
    }

    // 2c. The embedded Tauri format (base64 of textual minisign key record, e.g. DEFAULT_UPDATER_PUBKEY)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("minisign public key") {
            let line2 = text
                .lines()
                .nth(1)
                .ok_or_else(|| "Invalid minisign public key record: missing key line".to_string())?
                .trim();
            let decoded_inner = STANDARD
                .decode(line2)
                .map_err(|e| format!("Base64 decoding failed for inner minisign key: {e}"))?;
            if decoded_inner.len() == 42 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&decoded_inner[10..42]);
                return Ok(key);
            } else if decoded_inner.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&decoded_inner);
                return Ok(key);
            }
        }
    }

    Err(format!(
        "Invalid public key length: expected 32, 42, or textual Minisign record, got {} bytes",
        decoded.len()
    ))
}

/// Parses a 64-byte ed25519 signature from either raw base64 or Minisign signature format
pub fn parse_signature_bytes(raw_sig: &str) -> Result<[u8; 64], String> {
    let trimmed = raw_sig.trim();

    // 1. Direct textual Minisign signature
    if trimmed.contains("untrusted comment") {
        let line2 = trimmed
            .lines()
            .nth(1)
            .ok_or_else(|| "Invalid minisign signature format: missing signature line".to_string())?
            .trim();
        let decoded = STANDARD
            .decode(line2)
            .map_err(|e| format!("Base64 decoding failed for minisign signature: {e}"))?;
        if decoded.len() == 74 {
            let mut sig = [0u8; 64];
            sig.copy_from_slice(&decoded[10..74]);
            return Ok(sig);
        } else if decoded.len() == 64 {
            let mut sig = [0u8; 64];
            sig.copy_from_slice(&decoded);
            return Ok(sig);
        } else {
            return Err(format!(
                "Invalid signature length in minisign line: expected 64 or 74 bytes, got {}",
                decoded.len()
            ));
        }
    }

    // 2. Decode base64
    let decoded = STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Base64 decoding failed for signature: {e}"))?;

    // 2a. Raw 64-byte ed25519 signature
    if decoded.len() == 64 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded);
        return Ok(sig);
    }

    // 2b. Minisign 74 bytes (2 bytes algorithm + 8 bytes key ID + 64 bytes signature)
    if decoded.len() == 74 {
        let mut sig = [0u8; 64];
        sig.copy_from_slice(&decoded[10..74]);
        return Ok(sig);
    }

    // 2c. Base64-encoded textual Minisign signature (Tauri update manifest format)
    if let Ok(text) = std::str::from_utf8(&decoded) {
        if text.contains("untrusted comment") {
            let line2 = text
                .lines()
                .nth(1)
                .ok_or_else(|| "Invalid minisign signature record: missing signature line".to_string())?
                .trim();
            let decoded_inner = STANDARD
                .decode(line2)
                .map_err(|e| format!("Base64 decoding failed for inner minisign signature: {e}"))?;
            if decoded_inner.len() == 74 {
                let mut sig = [0u8; 64];
                sig.copy_from_slice(&decoded_inner[10..74]);
                return Ok(sig);
            } else if decoded_inner.len() == 64 {
                let mut sig = [0u8; 64];
                sig.copy_from_slice(&decoded_inner);
                return Ok(sig);
            }
        }
    }

    Err(format!(
        "Invalid signature length: expected 64, 74 bytes, or textual Minisign record, got {} bytes",
        decoded.len()
    ))
}

/// Verifies an ed25519 / minisign signature against data bytes
pub fn verify_ed25519_signature(
    public_key_str: &str,
    signature_str: &str,
    data: &[u8],
) -> Result<(), String> {
    // 1. Try Minisign verification first (official Tauri CLI / Minisign prehashed format)
    let minisign_pub = parse_minisign_public_key(public_key_str);
    let minisign_sig = parse_minisign_signature(signature_str);

    match (minisign_pub, minisign_sig) {
        (Ok(pubkey), Ok(sig)) => {
            // Minisign verification: verifies key_id match, Blake2b prehashing if is_prehashed,
            // ed25519 signature of data/hash, and ed25519 global_signature over trusted_comment!
            pubkey
                .verify(data, &sig, true)
                .map_err(|e| format!("Minisign cryptographic signature verification failed: {e:?}"))
        }
        (Err(_), _) | (_, Err(_)) => {
            // Fallback for raw 32-byte public key and raw 64-byte Ed25519 signature test fixtures
            let pubkey_bytes = parse_public_key_bytes(public_key_str)?;
            let sig_bytes = parse_signature_bytes(signature_str)?;

            let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
                .map_err(|e| format!("Invalid ed25519 verifying key: {e}"))?;
            let signature = Signature::from_bytes(&sig_bytes);

            verifying_key
                .verify(data, &signature)
                .map_err(|e| format!("Cryptographic signature verification failed: {e}"))
        }
    }
}
