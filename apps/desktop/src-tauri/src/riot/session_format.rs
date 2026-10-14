use serde_yaml_ng::Value;

/// Recognizes persisted logins in both current and legacy Riot settings.
/// A preference such as `remember_me: true` alone is not a reusable session.
pub fn has_persisted_session(content: &str) -> bool {
    let Ok(settings) = serde_yaml_ng::from_str::<Value>(content) else {
        return false;
    };
    contains_session(&settings)
}

fn contains_session(value: &Value) -> bool {
    match value {
        Value::Mapping(mapping) => mapping.iter().any(|(key, value)| {
            let recognized = match key.as_str() {
                // Current clients store this beneath psl.authorization.
                Some("authorization") => value
                    .get("riot-client")
                    .and_then(|client| client.get("refresh_token"))
                    .and_then(Value::as_str)
                    .is_some_and(|token| !token.trim().is_empty()),
                Some("login_remember_me_tokens" | "rso_token" | "rso_access_token") => {
                    has_token_value(value)
                }
                _ => false,
            };
            recognized || contains_session(value)
        }),
        Value::Sequence(values) => values.iter().any(contains_session),
        _ => false,
    }
}

fn has_token_value(value: &Value) -> bool {
    match value {
        Value::String(token) => !token.trim().is_empty(),
        Value::Sequence(values) => values.iter().any(has_token_value),
        Value::Mapping(values) => values.iter().any(|(key, value)| {
            matches!(
                key.as_str(),
                Some(
                    "token"
                        | "access_token"
                        | "refresh_token"
                        | "rso_token"
                        | "rso_access_token"
                        | "remember_me_token"
                )
            ) && has_token_value(value)
        }),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::has_persisted_session;

    #[test]
    fn detects_current_riot_authorization_without_legacy_markers() {
        let settings = "psl:\n  authorization:\n    riot-client:\n      refresh_token: test-refresh-token\n      is_dpop_bound: false\nriot-login:\n  persist: null\n";
        assert!(has_persisted_session(settings));
    }

    #[test]
    fn detects_legacy_sessions() {
        for settings in [
            "login_remember_me_tokens: test-token\n",
            "rso_token: test-token\n",
            "rso_access_token: test-token\n",
            "riot-login:\n  login_remember_me_tokens:\n    - token: test-token\n",
        ] {
            assert!(has_persisted_session(settings));
        }
    }

    #[test]
    fn rejects_signed_out_empty_and_invalid_settings() {
        for settings in [
            "",
            "riot-login:\n  persist: true\nremember_me: true\n",
            "psl:\n  authorization:\n    riot-client:\n      refresh_token: null\n",
            "psl:\n  authorization:\n    riot-client:\n      refresh_token: ''\n",
            "psl:\n  authorization:\n    riot-client:\n      refresh_token: '  '\n",
            "psl:\n  authorization:\n    riot-client:\n      id_token: identity-only\n",
            "login_remember_me_tokens: []\n",
            "login_remember_me_tokens:\n  - username: only-a-name\n    token: null\n",
            "rso_token: null\n",
            "rso_access_token: ''\n",
            "# rso_token: comment-only\n",
            "authorization: [malformed\n",
        ] {
            assert!(!has_persisted_session(settings), "Accepted {settings:?}");
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct DetectedSession {
    pub name: Option<String>,
    pub region: Option<String>,
    pub puuid: Option<String>,
}

/// Metadata is informational only: JWT payloads read from disk are not trusted authentication.
pub fn detect_details(content: &str) -> DetectedSession {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    fn collect(value: &Value, out: &mut serde_json::Map<String, serde_json::Value>) {
        match value {
            Value::Mapping(map) => {
                for (key, value) in map {
                    if let Some(key) = key.as_str() {
                        if let Some(text) = value.as_str() {
                            if matches!(
                                key,
                                "region"
                                    | "sub"
                                    | "game_name"
                                    | "gameName"
                                    | "tag_line"
                                    | "tagLine"
                            ) {
                                out.insert(key.into(), text.into());
                            }
                            if matches!(key, "id_token" | "claims") {
                                if let Ok(claims) = serde_json::from_str::<serde_json::Value>(text)
                                {
                                    if let Some(map) = claims.as_object() {
                                        if let Ok(value) = serde_yaml_ng::to_value(map) {
                                            collect(&value, out);
                                        }
                                    }
                                } else if let Some(payload) = text.split('.').nth(1) {
                                    if let Ok(bytes) = URL_SAFE_NO_PAD.decode(payload) {
                                        if let Ok(serde_json::Value::Object(claims)) =
                                            serde_json::from_slice(&bytes)
                                        {
                                            if let Ok(value) = serde_yaml_ng::to_value(&claims) {
                                                collect(&value, out);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    collect(value, out);
                }
            }
            Value::Sequence(values) => {
                for value in values {
                    collect(value, out);
                }
            }
            _ => {}
        }
    }
    let mut fields = serde_json::Map::new();
    if let Ok(settings) = serde_yaml_ng::from_str::<Value>(content) {
        collect(&settings, &mut fields);
    }
    let text = |key: &str| fields.get(key).and_then(|v| v.as_str()).map(str::to_string);
    let region = text("region").and_then(|value| {
        let region = match value.to_uppercase().as_str() {
            "EUW1" => "EUW".into(),
            "EUN1" => "EUNE".into(),
            "NA1" => "NA".into(),
            "BR1" => "BR".into(),
            "LA1" => "LAN".into(),
            "LA2" => "LAS".into(),
            "OC1" => "OCE".into(),
            "TR1" => "TR".into(),
            "RU1" => "RU".into(),
            "JP1" => "JP".into(),
            "SG2" => "SG".into(),
            "PH2" => "PH".into(),
            "TH2" => "TH".into(),
            "TW2" => "TW".into(),
            "VN2" => "VN".into(),
            "ME1" => "ME".into(),
            _ => value.to_uppercase(),
        };
        [
            "NA", "EUW", "EUNE", "KR", "LAN", "LAS", "OCE", "TR", "RU", "JP", "BR", "SEA", "SG",
            "TW", "VN", "PH", "TH", "ME",
        ]
        .contains(&region.as_str())
        .then_some(region)
    });
    let name = text("game_name").or_else(|| text("gameName")).map(|name| {
        match text("tag_line").or_else(|| text("tagLine")) {
            Some(tag) => format!("{name}#{tag}"),
            None => name,
        }
    });
    DetectedSession {
        name,
        region,
        puuid: text("sub"),
    }
}

pub fn session_status(content: &str, captured_at: Option<&str>) -> &'static str {
    if !has_persisted_session(content) {
        return "missing";
    }
    // Access/id tokens expiring does not prove that a refresh token is invalid.
    // Age is a conservative freshness hint; Riot remains the authentication authority.
    match captured_at.and_then(|date| chrono::DateTime::parse_from_rfc3339(date).ok()) {
        Some(date) if chrono::Utc::now().signed_duration_since(date).num_days() >= 30 => "stale",
        Some(_) => "saved",
        None => "unknown",
    }
}

#[cfg(test)]
mod metadata_tests {
    use super::*;
    #[test]
    fn detects_actual_metadata_without_inventing_missing_fields() {
        let details = detect_details("rso_token: saved\nregion: euw1\nsub: player-one\n");
        assert_eq!(details.region.as_deref(), Some("EUW"));
        assert_eq!(details.puuid.as_deref(), Some("player-one"));
        let missing = detect_details("rso_token: saved");
        assert_eq!(missing.region, None);
        assert_eq!(missing.name, None);
        assert_eq!(
            session_status("rso_token: saved", Some("2020-01-01T00:00:00Z")),
            "stale"
        );
        assert_eq!(session_status("remember_me: true", None), "missing");
    }
}
