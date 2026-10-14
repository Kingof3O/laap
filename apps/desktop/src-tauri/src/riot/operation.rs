use fs2::FileExt;
use std::{
    fs::{File, OpenOptions},
    sync::{Mutex, MutexGuard, TryLockError},
};
static OPERATION: Mutex<()> = Mutex::new(());
pub struct OperationGuard {
    _guard: MutexGuard<'static, ()>,
    _file: File,
}
fn lock_file(name: &str) -> Result<File, String> {
    let directory = crate::local_store::LocalAccountStorage::default_storage_dir();
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(directory.join(name))
        .map_err(|e| e.to_string())?;
    file.try_lock_exclusive().map_err(|_| {
        "Another LAAP instance is operating Riot. Finish that operation first.".to_string()
    })?;
    Ok(file)
}
pub fn reserve_signin() -> Result<File, String> {
    lock_file("riot-signin.lock")
}
pub fn acquire() -> Result<OperationGuard, String> {
    let guard = match OPERATION.try_lock() {
        Ok(guard) => guard,
        Err(TryLockError::WouldBlock) => {
            return Err("Another Riot operation is in progress. Please wait and try again.".into())
        }
        Err(TryLockError::Poisoned(error)) => {
            OPERATION.clear_poison();
            error.into_inner()
        }
    };
    let file = lock_file("riot-operation.lock")?;
    if !crate::commands::session::owns_provisioning() {
        drop(reserve_signin()?);
    }
    Ok(OperationGuard {
        _guard: guard,
        _file: file,
    })
}
static LAST_LAUNCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
pub fn mark_launch() {
    LAST_LAUNCH.store(now(), std::sync::atomic::Ordering::SeqCst);
}
pub fn launch_cooldown() -> bool {
    now().saturating_sub(LAST_LAUNCH.load(std::sync::atomic::Ordering::SeqCst)) < 30
}
