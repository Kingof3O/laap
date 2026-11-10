use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameflowStatus {
    connected: bool,
    phase: Option<String>,
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
