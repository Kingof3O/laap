use serde::Serialize;
use std::time::{Duration, Instant};
#[cfg(not(target_os = "windows"))]
use sysinfo::Signal;
use sysinfo::{Pid, System};

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
    force_stop_and_wait(
        &targets,
        |pid, start| {
            // A parent may exit and take its children with it between attempts.
            let live = System::new_all();
            live.process(pid)
                .filter(|process| process.start_time() == start)
                .is_none_or(|process| process.kill())
        },
        || {
            let live = System::new_all();
            targets
                .iter()
                .copied()
                .filter(|(pid, start)| {
                    live.process(*pid)
                        .is_some_and(|process| process.start_time() == *start)
                })
                .collect()
        },
        Duration::from_millis(2500),
    )?;
    ensure_stopped()
}

fn force_stop_and_wait(
    targets: &[(Pid, u64)],
    mut terminate: impl FnMut(Pid, u64) -> bool,
    mut remaining: impl FnMut() -> Vec<(Pid, u64)>,
    timeout: Duration,
) -> Result<(), String> {
    let mut failed = Vec::new();
    for &(pid, start) in targets {
        if !terminate(pid, start) {
            // A failed call can mean the process already exited, not access denied.
            // Continue stopping other targets and decide from a fresh snapshot.
            failed.push((pid, start));
        }
    }
    let deadline = Instant::now() + timeout;
    loop {
        let live = remaining();
        if live.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return if live.iter().any(|target| failed.contains(target)) {
                Err("Unable to stop remaining Riot/League processes. Close them manually; if Riot is running as Administrator, run LAAP with matching permissions, then retry.".into())
            } else {
                Err("Riot did not exit. Close Riot/League manually before retrying.".into())
            };
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exited_child_does_not_abort_stopping_the_remaining_parent() {
        let child = (Pid::from_u32(10), 100);
        let parent = (Pid::from_u32(20), 200);
        let mut attempted = Vec::new();
        let result = force_stop_and_wait(
            &[child, parent],
            |pid, _| {
                attempted.push(pid);
                pid != child.0
            },
            Vec::new,
            Duration::ZERO,
        );
        assert!(result.is_ok());
        assert_eq!(attempted, vec![child.0, parent.0]);
    }

    #[test]
    fn failed_termination_reports_permissions_only_if_that_process_remains() {
        let exited = (Pid::from_u32(10), 100);
        let live = (Pid::from_u32(20), 200);
        let result = force_stop_and_wait(
            &[exited, live],
            |pid, _| pid == live.0,
            || vec![live],
            Duration::ZERO,
        );
        assert_eq!(
            result.unwrap_err(),
            "Riot did not exit. Close Riot/League manually before retrying."
        );
        let result = force_stop_and_wait(&[live], |_, _| false, || vec![live], Duration::ZERO);
        assert!(result.unwrap_err().contains("matching permissions"));
    }

    #[test]
    fn waits_for_delayed_exit_after_a_failed_termination_call() {
        let target = (Pid::from_u32(10), 100);
        let mut snapshots = 0;
        let result = force_stop_and_wait(
            &[target],
            |_, _| false,
            || {
                snapshots += 1;
                if snapshots == 1 {
                    vec![target]
                } else {
                    vec![]
                }
            },
            Duration::from_secs(1),
        );
        assert!(result.is_ok());
        assert_eq!(snapshots, 2);
    }

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
