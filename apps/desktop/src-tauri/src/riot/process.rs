use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::{Pid, Signal, System};

#[derive(Debug, Clone, Default, Serialize)]
pub struct RuntimeSnapshot {
    pub riot_client: bool,
    pub league_client: bool,
    pub league_game: bool,
    pub valorant_game: bool,
}
impl RuntimeSnapshot {
    pub fn active_match(&self) -> bool {
        self.league_game || self.valorant_game
    }
    pub fn running(&self) -> bool {
        self.riot_client || self.league_client || self.active_match()
    }
}
fn classify_process(name: &str, snapshot: &mut RuntimeSnapshot) {
    let name = name.to_ascii_lowercase();
    if name.contains("valorant-win64-shipping") {
        snapshot.valorant_game = true;
    } else if name.contains("riotclientservices")
        || name.contains("riotclientux")
        || name.contains("riot client")
    {
        snapshot.riot_client = true;
    } else if name.contains("leagueclient") {
        snapshot.league_client = true;
    } else if name.contains("league of legends") || name.contains("leagueoflegends") {
        snapshot.league_game = true;
    }
}
pub fn runtime_snapshot() -> RuntimeSnapshot {
    let system = System::new_all();
    let mut snapshot = RuntimeSnapshot::default();
    for process in system.processes().values() {
        classify_process(&process.name().to_string_lossy(), &mut snapshot);
    }
    snapshot
}
pub fn is_riot_running() -> bool {
    runtime_snapshot().running()
}
pub fn guard_match(snapshot: &RuntimeSnapshot, confirmed: bool) -> Result<(), String> {
    if snapshot.active_match() && !confirmed {
        Err("ACTIVE_MATCH_CONFIRMATION_REQUIRED".into())
    } else {
        Ok(())
    }
}
#[cfg(target_os = "windows")]
fn graceful_close(pid: Pid) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };
    unsafe extern "system" fn visit(
        window: windows_sys::Win32::Foundation::HWND,
        target: isize,
    ) -> i32 {
        let mut owner = 0;
        unsafe {
            GetWindowThreadProcessId(window, &mut owner);
        }
        if owner == target as u32 {
            unsafe {
                PostMessageW(window, WM_CLOSE, 0, 0);
            }
        }
        1
    }
    unsafe {
        EnumWindows(Some(visit), pid.as_u32() as isize);
    }
}
#[cfg(not(target_os = "windows"))]
fn graceful_close(_pid: Pid) {}

pub fn terminate_riot_processes() -> Result<(), String> {
    stop_riot(false)
}
pub fn stop_riot(confirmed: bool) -> Result<(), String> {
    let system = System::new_all();
    let mut snapshot = RuntimeSnapshot::default();
    for process in system.processes().values() {
        classify_process(&process.name().to_string_lossy(), &mut snapshot);
    }
    guard_match(&snapshot, confirmed)?;
    let targets: Vec<_> = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let mut snapshot = RuntimeSnapshot::default();
            classify_process(&process.name().to_string_lossy(), &mut snapshot);
            snapshot.running().then_some((*pid, process.start_time()))
        })
        .collect();
    for (pid, _) in &targets {
        graceful_close(*pid);
        #[cfg(not(target_os = "windows"))]
        if let Some(process) = system.process(*pid) {
            process.kill_with(Signal::Term);
        }
    }
    if targets.is_empty() {
        return Ok(());
    }
    let deadline = Instant::now() + Duration::from_millis(2500);
    loop {
        let live = System::new_all();
        if targets
            .iter()
            .all(|(pid, start)| live.process(*pid).is_none_or(|p| p.start_time() != *start))
        {
            return ensure_stopped();
        }
        if Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let live = System::new_all();
    for (pid, start) in &targets {
        if let Some(process) = live.process(*pid).filter(|p| p.start_time() == *start) {
            if !process.kill() {
                return Err("Unable to stop Riot. Close Riot/League manually; if Riot is running as Administrator, run LAAP with matching permissions, then retry.".into());
            }
        }
    }
    for _ in 0..25 {
        let live = System::new_all();
        if targets
            .iter()
            .all(|(pid, start)| live.process(*pid).is_none_or(|p| p.start_time() != *start))
        {
            return ensure_stopped();
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("Riot did not exit. Close Riot/League manually before retrying.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_match_executables_and_guards_them() {
        for name in ["League of Legends.exe", "VALORANT-Win64-Shipping.exe"] {
            let mut snapshot = RuntimeSnapshot::default();
            classify_process(name, &mut snapshot);
            assert!(guard_match(&snapshot, false).is_err());
            assert!(guard_match(&snapshot, true).is_ok());
        }
        let mut snapshot = RuntimeSnapshot::default();
        classify_process("LeagueClientUx.exe", &mut snapshot);
        assert!(!snapshot.active_match());
        assert!(snapshot.league_client);
    }
}

fn ensure_stopped() -> Result<(), String> {
    if runtime_snapshot().running() {
        Err("Riot restarted while stopping. Close all Riot/League/Valorant windows manually and retry.".into())
    } else {
        Ok(())
    }
}
