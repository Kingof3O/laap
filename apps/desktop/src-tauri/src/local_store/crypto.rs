use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand::rngs::OsRng;
use rand::RngCore;
use std::fmt;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.laaP.desktop.local-store";
const KEYRING_ACCOUNT: &str = "session-vault-key-v1";
const ENVELOPE_PREFIX: &str = "laap-local:v1:";

#[derive(Clone)]
pub struct LocalSecretBox {
    key: Zeroizing<[u8; 32]>,
}

impl fmt::Debug for LocalSecretBox {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalSecretBox")
            .finish_non_exhaustive()
    }
}

impl LocalSecretBox {
    pub fn load_or_create() -> Result<Self, String> {
        let entry =
            Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())?;
        let key = match entry.get_password() {
            Ok(encoded) => {
                let bytes = URL_SAFE_NO_PAD
                    .decode(encoded)
                    .map_err(|_| "Stored local vault key is invalid".to_string())?;
                if bytes.len() != 32 {
                    return Err("Stored local vault key is invalid".to_string());
                }
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                key
            }
            Err(keyring::Error::NoEntry) => {
                let mut key = [0u8; 32];
                OsRng.fill_bytes(&mut key);
                entry
                    .set_password(&URL_SAFE_NO_PAD.encode(key))
                    .map_err(|error| error.to_string())?;
                key
            }
            Err(error) => return Err(error.to_string()),
        };
        Ok(Self {
            key: Zeroizing::new(key),
        })
    }

    #[cfg(test)]
    pub fn ephemeral() -> Self {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        Self {
            key: Zeroizing::new(key),
        }
    }

    pub fn encrypt(&self, plaintext: &str, context: &str) -> Result<String, String> {
        if plaintext.is_empty() {
            return Ok(String::new());
        }
        let cipher =
            Aes256Gcm::new_from_slice(self.key.as_ref()).map_err(|error| error.to_string())?;
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let encrypted = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: context.as_bytes(),
                },
            )
            .map_err(|_| "Failed to encrypt local session".to_string())?;
        Ok(format!(
            "{ENVELOPE_PREFIX}{}:{}",
            URL_SAFE_NO_PAD.encode(nonce_bytes),
            URL_SAFE_NO_PAD.encode(encrypted)
        ))
    }

    pub fn decrypt(&self, stored: &str, context: &str) -> Result<(String, bool), String> {
        if stored.is_empty() {
            return Ok((String::new(), false));
        }
        if !stored.starts_with(ENVELOPE_PREFIX) {
            return Ok((stored.to_string(), true));
        }
        let encoded = &stored[ENVELOPE_PREFIX.len()..];
        let (nonce_text, ciphertext_text) = encoded
            .split_once(':')
            .ok_or_else(|| "Stored local session envelope is invalid".to_string())?;
        let nonce = URL_SAFE_NO_PAD
            .decode(nonce_text)
            .map_err(|_| "Stored local session envelope is invalid".to_string())?;
        let ciphertext = URL_SAFE_NO_PAD
            .decode(ciphertext_text)
            .map_err(|_| "Stored local session envelope is invalid".to_string())?;
        if nonce.len() != 12 {
            return Err("Stored local session envelope is invalid".to_string());
        }
        let cipher =
            Aes256Gcm::new_from_slice(self.key.as_ref()).map_err(|error| error.to_string())?;
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: context.as_bytes(),
                },
            )
            .map_err(|_| "Stored local session could not be decrypted".to_string())?;
        String::from_utf8(plaintext)
            .map(|value| (value, false))
            .map_err(|_| "Stored local session is invalid".to_string())
    }
}
