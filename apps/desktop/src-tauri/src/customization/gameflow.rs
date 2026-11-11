use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static LAST_NOTICE: Mutex<Option<MatchNotice>> = Mutex::new(None);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchNotice {
    pub notice_id: String,
    pub title: String,
    pub message: String,
    pub phase: String,
    pub timestamp: String,
    pub action_label: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameflowStatus {
    pub connected: bool,
    pub phase: Option<String>,
}

#[tauri::command]
pub async fn gameflow_status(consent: bool) -> Result<GameflowStatus, String> {
    if !consent {
        return Err("Read-only League client access requires your explicit permission.".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let Some(client) = crate::lcu_read::connection()? else {
            return Ok(GameflowStatus {
                connected: false,
                phase: None,
            });
        };
        let value = client.get("/lol-gameflow/v1/gameflow-phase")?;
        let phase = value
            .as_str()
            .filter(|phase| {
                [
                    "None",
                    "Lobby",
                    "Matchmaking",
                    "ReadyCheck",
                    "ChampSelect",
                    "GameStart",
                    "InProgress",
                    "WaitingForStats",
                    "PreEndOfGame",
                    "EndOfGame",
                    "Reconnect",
                ]
                .contains(phase)
            })
            .unwrap_or("Unknown");
        Ok(GameflowStatus {
            connected: true,
            phase: Some(phase.into()),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lcu_test_connection(consent: bool) -> Result<bool, String> {
    if !consent {
        return Err("Read-only League client access requires consent.".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let conn = crate::lcu_read::connection()?;
        Ok(conn.is_some())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lcu_get_gameflow_phase(consent: bool) -> Result<String, String> {
    let status = gameflow_status(consent).await?;
    status
        .phase
        .ok_or_else(|| "League client not currently active.".into())
}

#[tauri::command]
pub fn match_notice_show(notice: MatchNotice) -> Result<bool, String> {
    let mut guard = LAST_NOTICE.lock().map_err(|_| "Notice lock unavailable.")?;
    *guard = Some(notice);
    Ok(true)
}

#[tauri::command]
pub fn match_notice_ready(ack: bool) -> Result<bool, String> {
    let guard = LAST_NOTICE.lock().map_err(|_| "Notice lock unavailable.")?;
    if let Some(notice) = &*guard {
        if ack && notice.phase == "ReadyCheck" {
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn match_notice_action(action: String) -> Result<String, String> {
    let mut guard = LAST_NOTICE.lock().map_err(|_| "Notice lock unavailable.")?;
    let notice = guard.take();
    Ok(format!(
        "Action '{action}' dispatched for notice: {:?}",
        notice.map(|n| n.notice_id)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_notice_flow() {
        let notice = MatchNotice {
            notice_id: "match-101".into(),
            title: "Ready Check".into(),
            message: "Match found! Click Accept in League client.".into(),
            phase: "ReadyCheck".into(),
            timestamp: "2026-11-11T00:00:00Z".into(),
            action_label: Some("Review Match".into()),
        };
        assert!(match_notice_show(notice).is_ok());
        assert!(match_notice_ready(true).unwrap());
        let res = match_notice_action("dismiss".into()).unwrap();
        assert!(res.contains("match-101"));
    }
}
