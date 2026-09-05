use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeSnapshot {
    pub riot_client: bool,
    pub league_client: bool,
    pub league_game: bool,
}

fn classify_process(name: &str, snapshot: &mut RuntimeSnapshot) {
    let normalized = name.to_ascii_lowercase();
    if normalized.contains("riotclientservices")
        || normalized.contains("riotclientux")
        || normalized.contains("riot client")
    {
        snapshot.riot_client = true;
    } else if normalized.contains("leagueclientux") || normalized.contains("leagueclient") {
        snapshot.league_client = true;
    } else if normalized.contains("league of legends") || normalized.contains("leagueoflegends") {
        snapshot.league_game = true;
    }
}

pub fn runtime_snapshot() -> RuntimeSnapshot {
    let mut system = System::new_all();
    system.refresh_all();
    let mut snapshot = RuntimeSnapshot {
        riot_client: false,
        league_client: false,
        league_game: false,
    };
    for process in system.processes().values() {
        classify_process(&process.name().to_string_lossy(), &mut snapshot);
    }
    snapshot
}

/// Checks if any Riot Client or League process is currently running.
pub fn is_riot_running() -> bool {
    let snapshot = runtime_snapshot();
    snapshot.riot_client || snapshot.league_client || snapshot.league_game
}

/// Gracefully terminates any running Riot Client or League processes and waits until all file locks are released.
pub fn terminate_riot_processes() -> Result<(), String> {
    let mut system = System::new_all();
    system.refresh_all();

    let mut found = false;
    for process in system.processes().values() {
        let mut snapshot = RuntimeSnapshot {
            riot_client: false,
            league_client: false,
            league_game: false,
        };
        classify_process(&process.name().to_string_lossy(), &mut snapshot);
        if snapshot.riot_client || snapshot.league_client || snapshot.league_game {
            found = true;
            let _ = process.kill();
        }
    }

    if found {
        // Wait up to 2 seconds for processes to fully exit and release file handles
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if !is_riot_running() {
                break;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{classify_process, RuntimeSnapshot};

    #[test]
    fn classifies_common_riot_and_league_process_names() {
        let mut snapshot = RuntimeSnapshot {
            riot_client: false,
            league_client: false,
            league_game: false,
        };
        classify_process("RiotClientUx.exe", &mut snapshot);
        classify_process("LeagueClientUxRender.exe", &mut snapshot);
        classify_process("League of Legends.exe", &mut snapshot);
        assert!(snapshot.riot_client);
        assert!(snapshot.league_client);
        assert!(snapshot.league_game);
    }
}
