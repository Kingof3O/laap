use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use keyring::Entry;
use rand::rngs::OsRng;
use thiserror::Error;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.laaP.desktop";
const KEYRING_ACCOUNT: &str = "ed25519-device-secret";

#[derive(Debug, Error)]
pub enum DeviceError {
    #[error("OS keychain error: {0}")]
    Keychain(String),
    #[error("stored device key is invalid")]
    InvalidKey,
}

/// Hardware-backed in production through the platform keychain. The private
/// material is never serialized into application state or sent to the API.
pub struct DeviceIdentity {
    secret: Zeroizing<[u8; 32]>,
}

impl DeviceIdentity {
    pub fn load_or_create() -> Result<Self, DeviceError> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| DeviceError::Keychain(error.to_string()))?;
        let secret = match entry.get_password() {
            Ok(encoded) => {
                let bytes = STANDARD_NO_PAD.decode(encoded).map_err(|_| DeviceError::InvalidKey)?;
                if bytes.len() != 32 { return Err(DeviceError::InvalidKey); }
                let mut value = [0u8; 32];
                value.copy_from_slice(&bytes);
                value
            }
            Err(keyring::Error::NoEntry) => {
                let mut rng = OsRng;
                let signing = SigningKey::generate(&mut rng);
                let value = signing.to_bytes();
                entry.set_password(&STANDARD_NO_PAD.encode(value)).map_err(|error| DeviceError::Keychain(error.to_string()))?;
                value
            }
            Err(error) => return Err(DeviceError::Keychain(error.to_string())),
        };
        Ok(Self { secret: Zeroizing::new(secret) })
    }

    pub fn public_key(&self) -> String {
        let signing = SigningKey::from_bytes(&self.secret);
        STANDARD_NO_PAD.encode(signing.verifying_key().to_bytes())
    }

    pub fn sign_nonce(&self, nonce: &str) -> String {
        let signing = SigningKey::from_bytes(&self.secret);
        STANDARD_NO_PAD.encode(signing.sign(nonce.as_bytes()).to_bytes())
    }
}
