use sysinfo::System;

/// Checks if any Riot Client or League process is currently running.
pub fn is_riot_running() -> bool {
    let mut system = System::new_all();
    system.refresh_all();
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name.contains("riotclientservices")
            || name.contains("riot client")
            || name.contains("leagueclientux")
            || name.contains("leagueclient")
            || name.contains("league of legends")
            || name.contains("leagueoflegends")
        {
            return true;
        }
    }
    false
}

/// Gracefully terminates any running Riot Client or League processes and waits until all file locks are released.
pub fn terminate_riot_processes() -> Result<(), String> {
    let mut system = System::new_all();
    system.refresh_all();

    let mut found = false;
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name.contains("riotclientservices")
            || name.contains("riot client")
            || name.contains("leagueclientux")
            || name.contains("leagueclient")
            || name.contains("league of legends")
            || name.contains("leagueoflegends")
        {
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
