use super::*;
use crate::local_store::LocalAccount;
use axum::{
    http::{HeaderMap as AxumHeaders, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use reqwest::header::HeaderMap;
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[test]
fn resolves_sea_and_oce_to_asia_cluster() {
    assert_eq!(resolve_routing("OCE").unwrap(), ("asia", "oc1"));
    assert_eq!(resolve_routing("SG2").unwrap(), ("asia", "sg2"));
    assert_eq!(resolve_routing("PH").unwrap(), ("asia", "sg2"));
    assert_eq!(resolve_routing("ME").unwrap(), ("europe", "me1"));
    assert!(resolve_routing("MARS").is_err());
}

#[test]
fn normalizes_and_validates_worker_urls() {
    assert_eq!(normalize_worker_url("").unwrap(), None);
    assert_eq!(
        normalize_worker_url("https://laap-api.example.workers.dev/api/riot/live-status/").unwrap(),
        Some("https://laap-api.example.workers.dev".into())
    );
    assert!(normalize_worker_url("http://public.example.com").is_err());
    assert!(normalize_worker_url("https://user:pass@laap-api.example.workers.dev").is_err());
    assert!(normalize_worker_url("http://127.0.0.1:4170").is_ok());
}

#[tokio::test]
async fn direct_mode_queries_account_then_spectator_and_respects_429() {
    let hits = Arc::new(AtomicUsize::new(0));
    let hits_clone = hits.clone();
    let router = Router::new()
        .route(
            "/riot/account/v1/accounts/by-riot-id/{name}/{tag}",
            get(|| async { Json(serde_json::json!({"puuid": "mock-puuid-123"})) }),
        )
        .route(
            "/lol/spectator/v5/active-games/by-summoner/mock-puuid-123",
            get(move || {
                let count = hits_clone.fetch_add(1, Ordering::SeqCst);
                async move {
                    if count == 0 {
                        (
                            StatusCode::OK,
                            HeaderMap::new(),
                            Json(serde_json::json!({
                                "gameId": 4242,
                                "gameMode": "CLASSIC",
                                "gameType": "MATCHED_GAME",
                                "gameQueueConfigId": 420,
                                "gameLength": 310,
                                "participants": [{"puuid": "mock-puuid-123", "championId": 157}]
                            })),
                        )
                    } else {
                        let mut headers = HeaderMap::new();
                        headers.insert("retry-after", "15".parse().unwrap());
                        (
                            StatusCode::TOO_MANY_REQUESTS,
                            headers,
                            Json(serde_json::json!({})),
                        )
                    }
                }
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let client = build_http_client().unwrap();
    let res = query_direct(
        &client,
        &base,
        &base,
        "euw1_test_direct",
        "fixture-key-123456",
        None,
        Some(("Kingof3O".into(), "EUW".into())),
    )
    .await
    .unwrap();

    assert!(res.in_game);
    assert_eq!(res.champion_id, Some(157));
    assert_eq!(res.game_mode.as_deref(), Some("CLASSIC"));
    assert_eq!(res.puuid.as_deref(), Some("mock-puuid-123"));

    let err = query_direct(
        &client,
        &base,
        &base,
        "euw1_test_direct",
        "fixture-key-123456",
        Some("mock-puuid-123".into()),
        None,
    )
    .await
    .unwrap_err();
    assert!(err.contains("RATE_LIMITED"));
    assert!(err.contains("15s"));

    // Cached cooldown blocks additional upstream hit without re-requesting
    let err2 = query_direct(
        &client,
        &base,
        &base,
        "euw1_test_direct",
        "fixture-key-123456",
        Some("mock-puuid-123".into()),
        None,
    )
    .await
    .unwrap_err();
    assert!(err2.contains("cooldown"));
    assert_eq!(hits.load(Ordering::SeqCst), 2);
    task.abort();
}

#[test]
fn hmac_sha256_matches_rfc_4231_vector() {
    // RFC 4231 Test Case 2
    assert_eq!(
        hmac_sha256_hex(b"Jefe", b"what do ya want for nothing?"),
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
}

#[test]
fn builtin_worker_defaults_activate_when_unset_and_respect_explicit_opt_out() {
    let dir = std::env::temp_dir().join(format!(
        "laap-live-default-test-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&dir).unwrap();

    let off = read_config_from_with_builtin(&dir, None, false).unwrap();
    assert_eq!(off.mode, LiveStatusMode::Off);

    let defaulted = read_config_from_with_builtin(
        &dir,
        Some("https://worker.example.workers.dev".into()),
        true,
    )
    .unwrap();
    assert_eq!(defaulted.mode, LiveStatusMode::Worker);
    assert_eq!(
        defaulted.worker_url.as_deref(),
        Some("https://worker.example.workers.dev")
    );

    let (settings_path, _) = storage_paths(&dir);
    fs::write(
        &settings_path,
        serde_json::to_vec(&LiveStatusConfig {
            mode: LiveStatusMode::Off,
            worker_url: None,
            prelaunch_guard: false,
        })
        .unwrap(),
    )
    .unwrap();

    let opted_out = read_config_from_with_builtin(
        &dir,
        Some("https://worker.example.workers.dev".into()),
        true,
    )
    .unwrap();
    assert_eq!(opted_out.mode, LiveStatusMode::Off);

    // Built-in token must never be attached when pointing to a different URL
    assert_eq!(
        resolve_effective_worker_token(
            "https://custom.example.workers.dev",
            "",
            Some("https://worker.example.workers.dev"),
            Some("built-in-secret"),
        ),
        None
    );
    assert_eq!(
        resolve_effective_worker_token(
            "https://worker.example.workers.dev",
            "",
            Some("https://worker.example.workers.dev"),
            Some("built-in-secret"),
        )
        .as_deref(),
        Some("built-in-secret")
    );

    let _ = fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn worker_mode_sends_signed_hmac_headers_and_parses_idle_response() {
    let router = Router::new().route(
        "/api/riot/live-status",
        post(|headers: AxumHeaders, body: axum::body::Bytes| async move {
            if headers.get("x-laap-riot-token").is_some() {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({"error": {"message": "Static token must not be sent"}})),
                );
            }
            let ts = headers.get("x-laap-timestamp").and_then(|v| v.to_str().ok()).unwrap_or("");
            let nonce = headers.get("x-laap-nonce").and_then(|v| v.to_str().ok()).unwrap_or("");
            let sig = headers.get("x-laap-signature").and_then(|v| v.to_str().ok()).unwrap_or("");
            let body_hash = sha256_hex(&body);
            let canonical = format!("{ts}\n{nonce}\nPOST\n/api/riot/live-status\n{body_hash}");
            let expected = hmac_sha256_hex(b"worker-secret-token", canonical.as_bytes());
            if nonce.len() < 12 || sig != expected {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({"error": {"message": "Invalid HMAC signature"}})),
                );
            }
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "inGame": false,
                    "puuid": "worker-puuid-999",
                    "platform": "euw1",
                    "cached": false,
                    "checkedAt": "2026-11-14T00:00:00Z"
                })),
            )
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let client = build_http_client().unwrap();
    let result = query_worker(
        &client,
        &base,
        Some("worker-secret-token"),
        "EUW",
        "euw1_test_worker",
        None,
        Some(("Kingof3O".into(), "EUW".into())),
        false,
    )
    .await
    .unwrap();

    assert!(!result.in_game);
    assert_eq!(result.mode, LiveStatusMode::Worker);
    assert_eq!(result.puuid.as_deref(), Some("worker-puuid-999"));
    task.abort();
}

#[tokio::test]
async fn ignores_rso_uuid_uses_session_id_token_and_recovers_on_400() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

    assert!(is_uuid_36("df284845-718a-a75e-22a8-b1e3b2c6086e"));
    assert!(!is_uuid_36("mock-puuid-123"));
    assert!(!is_uuid_36(&"a".repeat(78)));

    let requests = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
    let req_log = requests.clone();
    let router = Router::new().route(
        "/api/riot/live-status",
        post(move |Json(payload): Json<serde_json::Value>| {
            let req_log = req_log.clone();
            async move {
                req_log.lock().unwrap().push(payload.clone());
                let sent_puuid = payload["puuid"].as_str();
                if sent_puuid.is_some_and(is_uuid_36) {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "error": { "code": "INVALID_PUUID", "message": "UUID must never be sent" }
                        })),
                    );
                }
                if sent_puuid == Some("stale-puuid-old") {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "error": { "code": "RIOT_INVALID_PUUID", "message": "Riot API returned HTTP 400" }
                        })),
                    );
                }
                assert_eq!(payload["gameName"].as_str(), Some("RealPlayer"));
                assert_eq!(payload["tagLine"].as_str(), Some("EUNE"));
                let returned_puuid = if req_log.lock().unwrap().len() >= 2 {
                    "encrypted-puuid-eune-2"
                } else {
                    "encrypted-puuid-eune-1"
                };
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "inGame": false,
                        "puuid": returned_puuid,
                        "platform": "eun1",
                        "cached": false,
                        "checkedAt": "2026-11-14T00:00:00Z"
                    })),
                )
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let dir = std::env::temp_dir().join(format!(
        "laap_live_uuid_test_{}_{}",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    save_settings_to_dir(
        &dir,
        SaveLiveStatusSettingsInput {
            mode: LiveStatusMode::Worker,
            worker_url: base,
            prelaunch_guard: false,
            riot_api_key: None,
            clear_riot_api_key: false,
            worker_token: Some("test-worker-secret".into()),
            clear_worker_token: false,
        },
    )
    .unwrap();

    let jwt_payload = URL_SAFE_NO_PAD.encode(
        br#"{"sub":"df284845-718a-a75e-22a8-b1e3b2c6086e","acct":{"game_name":"RealPlayer","tag_line":"EUNE"}}"#,
    );
    let account = LocalAccount {
        id: "acc-eune-1".into(),
        name: "Main - EUNE".into(),
        region: "EUNE".into(),
        rank: None,
        riot_id: None,
        notes: String::new(),
        favorite: false,
        puuid: Some("df284845-718a-a75e-22a8-b1e3b2c6086e".into()),
        session_updated_at: None,
        customization: Default::default(),
        session_blob: format!(
            "psl:\n  authorization:\n    riot-client:\n      id_token: hdr.{jwt_payload}.sig\n"
        ),
        created_at: "2026-11-14T00:00:00Z".into(),
        last_used_at: None,
        games: vec![crate::local_store::Game::League],
        valorant_rank: None,
        last_game: None,
    };

    let first = check_account_live_status_with_account(
        &dir,
        Some(&account.id),
        Some(&account),
        account.region.clone(),
        account.name.clone(),
        Some(true),
    )
    .await
    .unwrap();

    assert!(!first.in_game);
    assert_eq!(first.puuid.as_deref(), Some("encrypted-puuid-eune-1"));
    assert_eq!(
        read_cached_api_puuid(&dir, "eun1", &account.id).as_deref(),
        Some("encrypted-puuid-eune-1")
    );
    assert_eq!(
        account.puuid.as_deref(),
        Some("df284845-718a-a75e-22a8-b1e3b2c6086e")
    );

    save_cached_api_puuid(&dir, "eun1", &account.id, "stale-puuid-old");
    let recovered = check_account_live_status_with_account(
        &dir,
        Some(&account.id),
        Some(&account),
        account.region.clone(),
        account.name.clone(),
        Some(true),
    )
    .await
    .unwrap();

    assert_eq!(recovered.puuid.as_deref(), Some("encrypted-puuid-eune-2"));
    assert_eq!(
        read_cached_api_puuid(&dir, "eun1", &account.id).as_deref(),
        Some("encrypted-puuid-eune-2")
    );
    let logged = requests.lock().unwrap();
    assert_eq!(logged.len(), 3);
    assert!(logged[0]["puuid"].is_null());
    assert_eq!(logged[1]["puuid"].as_str(), Some("stale-puuid-old"));
    assert!(logged[2]["puuid"].is_null());

    task.abort();
    let _ = fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn query_direct_ignores_uuid_and_flags_spectator_400() {
    let router = Router::new()
        .route(
            "/riot/account/v1/accounts/by-riot-id/{name}/{tag}",
            get(|| async { Json(serde_json::json!({"puuid": "direct-bad-puuid"})) }),
        )
        .route(
            "/lol/spectator/v5/active-games/by-summoner/{puuid}",
            get(|| async { StatusCode::BAD_REQUEST }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let client = build_http_client().unwrap();
    let err = query_direct(
        &client,
        &base,
        &base,
        "eun1_test_direct_400",
        "RGAPI-mock",
        Some("9fde699e-6feb-dcbb-a918-a4d7a01f60f1".into()),
        Some(("Main".into(), "EUNE".into())),
    )
    .await
    .unwrap_err();

    assert!(err.starts_with(INVALID_PUUID_ERR_PREFIX));
    let mem_empty = LIVE_STATE
        .lock()
        .unwrap()
        .puuid_cache
        .get("eun1_test_direct_400\0main\0eune")
        .is_none();
    assert!(mem_empty);

    task.abort();
}
