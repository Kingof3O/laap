use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use keyring::Entry;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};
use zeroize::Zeroizing;

const DAY: i64 = 86_400;
const CLOCK_TOLERANCE: i64 = 300;
const ORIGIN: Option<&str> = option_env!("LAAP_BILLING_ORIGIN");
const VERIFY_KEY: Option<&str> = option_env!("LAAP_BILLING_PUBLIC_KEY");
static CREDENTIALS: Mutex<()> = Mutex::new(());
static REQUEST: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LOGIN: Mutex<Option<Zeroizing<String>>> = Mutex::new(None);
static LAST_ATTEMPT: Mutex<Option<std::time::Instant>> = Mutex::new(None);

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Credentials {
    device_secret: String,
    license: Option<String>,
    high_water: i64,
    checked_at: i64,
    ended_grant: Option<String>,
    last_grant: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Lease {
    v: u8,
    aud: String,
    device_key: String,
    state: String,
    iat: i64,
    exp: i64,
    end: Option<i64>,
    grant_id: Option<String>,
}

#[derive(Clone, Default)]
pub(crate) struct Entitlement {
    pub pro: bool,
    pub ended_grant: Option<String>,
    expires_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingStatus {
    available: bool,
    signed_in: bool,
    pro: bool,
    expires_at: Option<i64>,
    ended_grant: Option<String>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn origin() -> Option<Url> {
    let url = Url::parse(ORIGIN?).ok()?;
    (url.scheme() == "https"
        && url.host().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path() == "/")
        .then_some(url)
}

fn decode<const N: usize>(text: &str) -> Result<[u8; N], String> {
    B64.decode(text)
        .ok()
        .and_then(|value| value.try_into().ok())
        .ok_or_else(|| "Invalid LAAP license encoding.".into())
}

fn license_key() -> Option<VerifyingKey> {
    VerifyingKey::from_bytes(&decode(VERIFY_KEY?).ok()?).ok()
}

fn verify(token: &str, device: &str, key: &VerifyingKey) -> Result<Lease, String> {
    let (payload, signature) = token.split_once('.').ok_or("Invalid LAAP license.")?;
    let decoded = B64.decode(payload).map_err(|_| "Invalid LAAP license.")?;
    let signature = Signature::from_bytes(&decode(signature)?);
    key.verify_strict(&decoded, &signature)
        .map_err(|_| "LAAP license signature did not verify.")?;
    let lease: Lease = serde_json::from_slice(&decoded).map_err(|_| "Invalid LAAP license.")?;
    if lease.v != 1
        || lease.aud != crate::product::app_identifier()
        || lease.device_key != device
        || lease.iat <= 0
        || lease.exp <= lease.iat
        || lease.exp - lease.iat > 30 * DAY
        || !matches!(lease.state.as_str(), "pro" | "basic")
        || (lease.state == "pro"
            && (lease.grant_id.is_none() || lease.end.is_some_and(|end| end < lease.exp)))
    {
        return Err("LAAP license is invalid for this installation.".into());
    }
    Ok(lease)
}

fn entry() -> Result<Entry, String> {
    Entry::new("com.laap.offline.billing", "device-and-license-v1").map_err(|e| e.to_string())
}

fn read() -> Result<Credentials, String> {
    match entry()?.get_password() {
        Ok(value) => serde_json::from_str(&Zeroizing::new(value)).map_err(|_| {
            "The local LAAP license could not be read. Verify your email again.".into()
        }),
        Err(keyring::Error::NoEntry) => Ok(Credentials::default()),
        Err(error) => Err(error.to_string()),
    }
}

fn write(state: &Credentials) -> Result<(), String> {
    let json = Zeroizing::new(serde_json::to_string(state).map_err(|e| e.to_string())?);
    entry()?.set_password(&json).map_err(|e| e.to_string())
}

fn device() -> Result<SigningKey, String> {
    let _guard = CREDENTIALS.lock().map_err(|e| e.to_string())?;
    let mut state = read()?;
    if state.device_secret.is_empty() {
        let mut seed = Zeroizing::new([0; 32]);
        getrandom::fill(seed.as_mut()).map_err(|e| e.to_string())?;
        state.device_secret = B64.encode(seed.as_ref());
        write(&state)?;
    }
    Ok(SigningKey::from_bytes(&Zeroizing::new(decode(
        &state.device_secret,
    )?)))
}

fn evaluate(state: &Credentials, lease: &Lease, clock: i64) -> Entitlement {
    let clock_valid = clock.saturating_add(CLOCK_TOLERANCE) >= state.high_water.max(lease.iat);
    let effective_now = clock.max(state.high_water).max(lease.iat);
    let pro = clock_valid && lease.state == "pro" && effective_now < lease.exp;
    let ended_grant =
        if lease.state == "pro" && clock_valid && lease.end.is_some_and(|end| effective_now >= end)
        {
            lease.grant_id.clone()
        } else {
            state.ended_grant.clone()
        };
    Entitlement {
        pro,
        ended_grant,
        expires_at: (lease.state == "pro").then_some(lease.exp),
    }
}

pub(crate) fn entitlement() -> Entitlement {
    fn current() -> Result<Entitlement, String> {
        let Some(key) = license_key() else {
            return Ok(Entitlement::default());
        };
        let _guard = CREDENTIALS.lock().map_err(|e| e.to_string())?;
        let mut state = read()?;
        let Some(token) = state.license.as_ref() else {
            return Ok(Entitlement::default());
        };
        let secret = Zeroizing::new(decode(&state.device_secret)?);
        let device = B64.encode(SigningKey::from_bytes(&secret).verifying_key().to_bytes());
        let lease = verify(token, &device, &key)?;
        let clock = now();
        let result = evaluate(&state, &lease, clock);
        // Record observed time while a lease is in use, without writing on every tray poll.
        let observed = clock.min(lease.exp);
        let advance = lease.state == "pro" && observed >= state.high_water.saturating_add(60);
        if advance || result.ended_grant != state.ended_grant {
            if advance {
                state.high_water = observed;
            }
            state.ended_grant.clone_from(&result.ended_grant);
            write(&state)?;
        }
        Ok(result)
    }
    current().unwrap_or_default()
}

fn save_lease(token: String, public_key: &str) -> Result<(), String> {
    let lease = verify(
        &token,
        public_key,
        &license_key().ok_or("Billing is unavailable.")?,
    )?;
    let _guard = CREDENTIALS.lock().map_err(|e| e.to_string())?;
    let mut state = read()?;
    if let Some(previous) = &state.license {
        if verify(
            previous,
            public_key,
            &license_key().ok_or("Billing is unavailable.")?,
        )
        .is_ok_and(|old| old.iat > lease.iat)
        {
            return Err("The billing server returned an older license.".into());
        }
    }
    if lease.state == "pro" {
        state.last_grant.clone_from(&lease.grant_id);
        state.ended_grant = None;
    } else if state.last_grant.is_some() {
        state.ended_grant = state.last_grant.take();
    }
    state.high_water = lease.iat;
    state.checked_at = now();
    state.license = Some(token);
    write(&state)
}

fn status() -> BillingStatus {
    let access = entitlement();
    BillingStatus {
        available: origin().is_some() && license_key().is_some(),
        signed_in: LOGIN.lock().is_ok_and(|value| value.is_some()),
        pro: access.pro,
        expires_at: access.expires_at,
        ended_grant: access.ended_grant,
    }
}

async fn request(path: &str, data: Value, authenticated: bool) -> Result<Value, String> {
    let url = origin()
        .ok_or("Billing is unavailable in this build.")?
        .join(path)
        .map_err(|e| e.to_string())?;
    let client = Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.post(url).json(&data);
    if authenticated {
        let token = LOGIN
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Verify your billing email to continue.")?;
        request = request.bearer_auth(&*token);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Could not reach LAAP billing. Try again when connected.")?;
    let code = response.status();
    if authenticated && code == reqwest::StatusCode::UNAUTHORIZED {
        *LOGIN.lock().map_err(|e| e.to_string())? = None;
        return Err("Your billing sign-in expired. Verify your email again.".into());
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| "Invalid response from LAAP billing.")?;
    if !code.is_success() {
        return Err(body["error"]
            .as_str()
            .unwrap_or("LAAP billing could not complete this request.")
            .into());
    }
    Ok(body)
}

async fn fetch_lease(action: &str, mut data: Value, authenticated: bool) -> Result<(), String> {
    let signing = device()?;
    let device_key = B64.encode(signing.verifying_key().to_bytes());
    let challenge = request(
        "/v1/device/challenge",
        json!({ "deviceKey": device_key, "action": action }),
        false,
    )
    .await?;
    let challenge = challenge["challenge"]
        .as_str()
        .ok_or("Missing device challenge.")?;
    data["deviceKey"] = json!(device_key);
    data["challenge"] = json!(challenge);
    data["proof"] = json!(B64.encode(
        signing
            .sign(format!("laap-device-v1:{action}:{challenge}").as_bytes())
            .to_bytes()
    ));
    let response = request(&format!("/v1/device/{action}"), data, authenticated).await?;
    save_lease(
        response["license"]
            .as_str()
            .ok_or("Missing signed license.")?
            .into(),
        &device_key,
    )
}

#[tauri::command]
pub async fn billing_status(refresh: bool, force: Option<bool>) -> Result<BillingStatus, String> {
    let available = refresh && origin().is_some() && license_key().is_some();
    let forced = force.unwrap_or(false);
    let request = if !available {
        None
    } else if forced {
        Some(REQUEST.lock().await)
    } else {
        REQUEST.try_lock().ok()
    };
    if let Some(_request) = request {
        let due = CREDENTIALS
            .lock()
            .ok()
            .and_then(|_| read().ok())
            .is_some_and(|state| {
                state.license.is_some()
                    && (forced
                        || now() < state.checked_at
                        || now().saturating_sub(state.checked_at) >= DAY)
            });
        let retry = due
            && LAST_ATTEMPT.lock().is_ok_and(|mut attempt| {
                if !forced && attempt.is_some_and(|at| at.elapsed() < Duration::from_secs(300)) {
                    return false;
                }
                *attempt = Some(std::time::Instant::now());
                true
            });
        if retry {
            let result = fetch_lease("refresh", json!({}), false).await;
            if forced {
                result?;
            }
        }
    }
    Ok(status())
}

pub(crate) async fn refresh_background() {
    if origin().is_none() || license_key().is_none() {
        return;
    }
    loop {
        let _ = billing_status(true, None).await;
        tokio::time::sleep(Duration::from_secs(300)).await;
    }
}

#[tauri::command]
pub async fn billing_send_code(email: String) -> Result<(), String> {
    request("/v1/auth/code", json!({ "email": email }), false)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn billing_verify_email(email: String, code: String) -> Result<BillingStatus, String> {
    let _request = REQUEST.lock().await;
    let result = request(
        "/v1/auth/verify",
        json!({ "email": email, "code": code }),
        false,
    )
    .await?;
    let token = result["accessToken"]
        .as_str()
        .ok_or("Missing billing sign-in token.")?;
    *LOGIN.lock().map_err(|e| e.to_string())? = Some(Zeroizing::new(token.into()));
    Ok(status())
}

#[tauri::command]
pub async fn billing_activate() -> Result<BillingStatus, String> {
    let _request = REQUEST.lock().await;
    fetch_lease("activate", json!({}), true).await?;
    Ok(status())
}

#[tauri::command]
pub async fn billing_transfer(email: String, code: String) -> Result<BillingStatus, String> {
    let _request = REQUEST.lock().await;
    fetch_lease("transfer", json!({ "email": email, "code": code }), true).await?;
    Ok(status())
}

#[tauri::command]
pub async fn billing_redeem(code: String) -> Result<BillingStatus, String> {
    let _request = REQUEST.lock().await;
    fetch_lease("redeem", json!({ "code": code }), true).await?;
    Ok(status())
}

#[tauri::command]
pub async fn billing_cancel_checkout() -> Result<(), String> {
    request("/v1/checkout/cancel", json!({}), true)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn billing_open_page(plan: Option<String>) -> Result<(), String> {
    let (path, body) = match plan {
        Some(plan) => ("/v1/checkout", json!({ "plan": plan })),
        None => ("/v1/portal", json!({})),
    };
    let result = request(path, body, true).await?;
    let url = Url::parse(result["url"].as_str().ok_or("Missing billing page.")?)
        .map_err(|_| "Invalid billing page.")?;
    let allowed = if path == "/v1/checkout" {
        origin().is_some_and(|root| url.origin() == root.origin()) && url.path() == "/checkout"
    } else {
        matches!(
            url.host_str(),
            Some("customer-portal.paddle.com" | "sandbox-customer-portal.paddle.com")
        )
    };
    if !allowed
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("That billing page is not allowed.".into());
    }
    crate::commands::window::open_browser(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_lease_is_bound_to_device_and_application_and_expires_offline() {
        let signer = SigningKey::from_bytes(&[42; 32]);
        let payload = serde_json::to_vec(&json!({
            "v": 1, "aud": "com.laap.offline", "deviceKey": "device-a", "state": "pro",
            "iat": 100_000, "exp": 200_000, "end": 300_000, "grantId": "gift-1",
        }))
        .unwrap();
        let signature = B64.encode(signer.sign(&payload).to_bytes());
        let token = format!("{}.{}", B64.encode(&payload), signature);
        let key = signer.verifying_key();
        assert!(verify(&token, "device-b", &key).is_err());
        let modified = String::from_utf8(payload)
            .unwrap()
            .replace("200000", "299000");
        let altered = format!("{}.{}", B64.encode(modified.as_bytes()), signature);
        assert!(verify(&altered, "device-a", &key).is_err());
        let lease = verify(&token, "device-a", &key).unwrap();
        let state = Credentials {
            high_water: 150_000,
            ..Credentials::default()
        };
        assert!(evaluate(&state, &lease, 190_000).pro);
        assert!(!evaluate(&state, &lease, 149_000).pro);
        let offline_expired = evaluate(&state, &lease, 200_000);
        assert!(!offline_expired.pro);
        assert!(offline_expired.ended_grant.is_none());
        assert_eq!(
            evaluate(&state, &lease, 300_000).ended_grant.as_deref(),
            Some("gift-1")
        );
    }
}
