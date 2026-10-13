use serde_yaml_ng::Value;

/// Recognizes persisted logins in both current and legacy Riot settings.
/// A preference such as `remember_me: true` alone is not a reusable session.
pub(super) fn has_persisted_session(content: &str) -> bool {
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
        Value::Mapping(values) => values.values().any(has_token_value),
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
            "rso_token: null\n",
            "rso_access_token: ''\n",
            "# rso_token: comment-only\n",
            "authorization: [malformed\n",
        ] {
            assert!(!has_persisted_session(settings), "Accepted {settings:?}");
        }
    }
}
