use tauri::AppHandle;
use zeroize::Zeroizing;
fn entry(app: &AppHandle, provider: &str) -> Result<keyring::Entry, String> {
    if !["openai", "gemini", "elevenlabs", "riot"].contains(&provider) {
        return Err("Unsupported provider".into());
    }
    keyring::Entry::new(&format!("{}.providers", app.config().identifier), provider)
        .map_err(|_| "OS secret store unavailable".into())
}
pub(super) fn load(app: &AppHandle, provider: &str) -> Result<Zeroizing<String>, String> {
    match entry(app, provider)?.get_password() {
        Ok(key) => Ok(Zeroizing::new(key)),
        Err(keyring::Error::NoEntry) => {
            let var = match provider {
                "openai" => "OPENAI_API_KEY",
                "gemini" => "GEMINI_API_KEY",
                "elevenlabs" => "ELEVENLABS_API_KEY",
                "riot" => "RIOT_API_KEY",
                _ => return Err("Unsupported provider".into()),
            };
            std::env::var(var)
                .map(Zeroizing::new)
                .map_err(|_| format!("Configure the {provider} API key in integrations first"))
        }
        Err(_) => Err("OS secret store unavailable".into()),
    }
}
#[tauri::command]
pub fn provider_key_save(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    if key.len() < 16 || key.len() > 512 || key.chars().any(char::is_whitespace) {
        return Err("Invalid provider key".into());
    }
    entry(&app, &provider)?
        .set_password(&key)
        .map_err(|_| "Unable to store provider key securely".into())
}
#[tauri::command]
pub fn provider_key_clear(app: AppHandle, provider: String) -> Result<(), String> {
    match entry(&app, &provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Unable to remove provider key".into()),
    }
}
pub(super) async fn bounded_body(
    mut response: reqwest::Response,
    max: usize,
) -> Result<Vec<u8>, String> {
    if !response.status().is_success() {
        let status = response.status().as_u16();
        return Err(match status {
            401 | 403 => "[AUTH_REQUIRED] Provider rejected the API credential".into(),
            429 => format!(
                "[RATE_LIMITED] Retry after {} seconds",
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("60")
            ),
            _ => format!("[PROVIDER_ERROR] HTTP {status}"),
        });
    }
    if response.content_length().is_some_and(|n| n > max as u64) {
        return Err("[RESPONSE_TOO_LARGE] Provider response exceeds limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "[NETWORK_ERROR] Provider response interrupted")?
    {
        if bytes.len() + chunk.len() > max {
            return Err("[RESPONSE_TOO_LARGE] Provider response exceeds limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
