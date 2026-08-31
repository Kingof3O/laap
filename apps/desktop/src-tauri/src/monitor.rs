use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuntimeState {
    Idle,
    Launching,
    InClient,
    InGame,
    Reconnecting,
    Terminated,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct ProcessSnapshot {
    pub riot_client: bool,
    pub league_client: bool,
    pub game: bool,
}

impl ProcessSnapshot {
    pub fn detect() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        let mut snapshot = Self::default();
        for process in system.processes().values() {
            let name = process.name().to_string_lossy().to_ascii_lowercase();
            snapshot.riot_client |= name.contains("riotclientservices") || name.contains("riot client");
            snapshot.league_client |= name.contains("leagueclientux");
            snapshot.game |= name.contains("league of legends") || name.contains("leagueoflegends");
        }
        snapshot
    }
}

#[derive(Debug)]
pub struct RuntimeMonitor {
    state: RuntimeState,
    reconnect_until: Option<DateTime<Utc>>,
}

impl Default for RuntimeMonitor {
    fn default() -> Self { Self { state: RuntimeState::Idle, reconnect_until: None } }
}

impl RuntimeMonitor {
    pub fn state(&self) -> RuntimeState { self.state }

    pub fn transition(&mut self, snapshot: ProcessSnapshot, now: DateTime<Utc>) -> RuntimeState {
        if snapshot.game {
            self.reconnect_until = None;
            self.state = RuntimeState::InGame;
            return self.state;
        }
        if self.state == RuntimeState::InGame {
            self.reconnect_until = Some(now + Duration::seconds(300));
            self.state = RuntimeState::Reconnecting;
            return self.state;
        }
        if self.state == RuntimeState::Reconnecting {
            if self.reconnect_until.is_some_and(|deadline| now < deadline) { return self.state; }
            self.reconnect_until = None;
            self.state = RuntimeState::Terminated;
            return self.state;
        }
        self.state = if snapshot.league_client { RuntimeState::InClient } else if snapshot.riot_client { RuntimeState::Launching } else { RuntimeState::Idle };
        self.state
    }

    pub fn poll(&mut self) -> RuntimeState { self.transition(ProcessSnapshot::detect(), Utc::now()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protects_an_in_game_crash_for_five_minutes() {
        let now = Utc::now();
        let mut monitor = RuntimeMonitor::default();
        assert_eq!(monitor.transition(ProcessSnapshot { game: true, ..Default::default() }, now), RuntimeState::InGame);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(1)), RuntimeState::Reconnecting);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(299)), RuntimeState::Reconnecting);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(301)), RuntimeState::Terminated);
    }
}
