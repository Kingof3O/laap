use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("customization").join("v1"))
        .map_err(|e| e.to_string())
}

pub fn read<T: DeserializeOwned>(path: &Path, limit: u64) -> Result<Option<T>, String> {
    if path.exists() { super::sandbox::check_chain(path, false)?; }
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Stored data exceeds the supported size.".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("Invalid stored data: {e}"))
}

pub fn write<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    write_with(path, |file| Ok(serde_json::to_writer(file, value)?))
}

pub fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_with(path, |file| file.write_all(bytes))
}

fn write_with(
    path: &Path,
    write: impl FnOnce(&mut fs::File) -> std::io::Result<()>,
) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing data directory.")?;
    super::sandbox::check_chain(parent, true)?;
    let mut random = [0; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let temp = parent.join(format!(".{:032x}.tmp", u128::from_be_bytes(random)));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        write(&mut file)?;
        file.flush()?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| e.to_string())
}
