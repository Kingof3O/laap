use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sysinfo::System;

/// UI/runtime states. `Authenticated` requires a future supported Riot signal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClientState { LoggedOut, LeaseAcquired, WaitingForRiotLogin, Authenticated, LeagueRunning, Reconnecting, LeaseLost }

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct ProcessSnapshot { pub riot_client: bool, pub league_client: bool, pub game: bool }

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
pub struct RuntimeMonitor { state: ClientState, lease_active: bool, authenticated_signal: bool, reconnect_until: Option<DateTime<Utc>> }

impl Default for RuntimeMonitor { fn default() -> Self { Self { state: ClientState::LoggedOut, lease_active: false, authenticated_signal: false, reconnect_until: None } } }

impl RuntimeMonitor {
    pub fn state(&self) -> ClientState { self.state }
    pub fn set_lease_active(&mut self, active: bool) { self.lease_active = active; if !active { self.authenticated_signal = false; self.reconnect_until = None; self.state = ClientState::LoggedOut; } else if self.state == ClientState::LoggedOut { self.state = ClientState::LeaseAcquired; } }
    /// Only an explicit supported integration may set this signal. Process presence never flips it to true.
    pub fn set_authenticated_signal(&mut self, authenticated: bool) { self.authenticated_signal = authenticated; }
    pub fn transition(&mut self, snapshot: ProcessSnapshot, now: DateTime<Utc>) -> ClientState {
        if !self.lease_active { self.state = ClientState::LoggedOut; return self.state; }
        if snapshot.game { self.reconnect_until = None; self.state = ClientState::LeagueRunning; return self.state; }
        if self.state == ClientState::LeagueRunning { self.reconnect_until = Some(now + Duration::seconds(300)); self.state = ClientState::Reconnecting; return self.state; }
        if self.state == ClientState::Reconnecting { if self.reconnect_until.is_some_and(|deadline| now < deadline) { return self.state; } self.reconnect_until = None; self.state = ClientState::LeaseLost; return self.state; }
        self.state = if self.authenticated_signal && (snapshot.riot_client || snapshot.league_client) { ClientState::Authenticated } else if snapshot.riot_client || snapshot.league_client { ClientState::WaitingForRiotLogin } else { ClientState::LeaseAcquired };
        self.state
    }
    pub fn poll(&mut self) -> ClientState { self.transition(ProcessSnapshot::detect(), Utc::now()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn process_presence_never_proves_authentication() {
        let now = Utc::now(); let mut monitor = RuntimeMonitor::default(); monitor.set_lease_active(true);
        assert_eq!(monitor.transition(ProcessSnapshot { riot_client: true, ..Default::default() }, now), ClientState::WaitingForRiotLogin);
        assert_eq!(monitor.transition(ProcessSnapshot { league_client: true, ..Default::default() }, now), ClientState::WaitingForRiotLogin);
        monitor.set_authenticated_signal(true);
        assert_eq!(monitor.transition(ProcessSnapshot { league_client: true, ..Default::default() }, now), ClientState::Authenticated);
    }
    #[test]
    fn protects_an_in_game_crash_for_five_minutes() {
        let now = Utc::now(); let mut monitor = RuntimeMonitor::default(); monitor.set_lease_active(true);
        assert_eq!(monitor.transition(ProcessSnapshot { game: true, ..Default::default() }, now), ClientState::LeagueRunning);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(1)), ClientState::Reconnecting);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(299)), ClientState::Reconnecting);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now + Duration::seconds(301)), ClientState::LeaseLost);
    }
    #[test]
    fn lease_loss_and_logout_are_terminal_until_a_new_lease() {
        let now = Utc::now(); let mut monitor = RuntimeMonitor::default(); monitor.set_lease_active(true);
        assert_eq!(monitor.transition(ProcessSnapshot::default(), now), ClientState::LeaseAcquired);
        monitor.set_lease_active(false);
        assert_eq!(monitor.state(), ClientState::LoggedOut);
    }
}
