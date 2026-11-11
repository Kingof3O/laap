//! App-owned staging only. No game-install path is accepted by this module.
use super::{
    library::{validate_archive, InstalledMod},
    storage,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    generation: String,
    files: Vec<super::library::Entry>,
}
fn no_link(path: &Path) -> Result<(), String> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err("Reparse points are forbidden in staging paths.".into());
        }
    }
    if m.file_type().is_symlink() {
        return Err("Symlinks are forbidden in staging paths.".into());
    }
    Ok(())
}
pub(super) fn check_chain(path: &Path, create: bool) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Absolute app-owned path required.".into());
    }
    let mut current = PathBuf::new();
    for part in path.components() {
        if matches!(
            part,
            std::path::Component::ParentDir | std::path::Component::CurDir
        ) {
            return Err("Noncanonical staging path.".into());
        }
        current.push(part);
        if !current.exists() && create {
            fs::create_dir(&current).map_err(|e| e.to_string())?;
        }
        no_link(&current)?;
    }
    Ok(())
}
pub(super) fn read_blob(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    check_chain(path, false)?;
    let f = fs::File::open(path).map_err(|e| e.to_string())?;
    if !f.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Regular content file required.".into());
    }
    let mut bytes = Vec::new();
    f.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Content exceeds quota.".into());
    }
    Ok(bytes)
}
fn generation(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid staging ownership receipt.".into());
    }
    Ok(root.join(id))
}
fn cleanup(root: &Path, receipt: &Receipt) -> Result<usize, String> {
    let dir = generation(root, &receipt.generation)?;
    check_chain(&dir, false)?;
    let owned: Receipt = storage::read(&dir.join(".laap-stage.json"), 256 * 1024)?
        .ok_or("Missing staging ownership receipt")?;
    if serde_json::to_vec(&owned).unwrap() != serde_json::to_vec(receipt).unwrap() {
        return Err("Staging ownership mismatch.".into());
    }
    // Preflight every owned file before deleting anything. Modified or unknown files are retained.
    for entry in &receipt.files {
        if !super::library::safe_name(&entry.relative_path) {
            return Err("Unsafe receipt entry.".into());
        }
        let p = dir.join(&entry.relative_path);
        if p.exists() {
            let bytes = read_blob(&p, entry.size_bytes)?;
            if bytes.len() as u64 != entry.size_bytes
                || format!("{:x}", Sha256::digest(&bytes)) != entry.sha256
            {
                return Err("Staged content changed; retained for recovery.".into());
            }
        }
    }
    let mut removed = 0;
    for entry in &receipt.files {
        let p = dir.join(&entry.relative_path);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
            removed += 1;
        }
        let mut parent = p.parent();
        while let Some(path) = parent {
            if path == dir {
                break;
            }
            // remove_dir never follows links or recursively removes unknown files.
            if fs::remove_dir(path).is_err() {
                break;
            }
            parent = path.parent();
        }
    }
    fs::remove_file(dir.join(".laap-stage.json")).map_err(|e| e.to_string())?;
    // Unknown files belong to the user. Keep them and their directory.
    let _ = fs::remove_dir(&dir);
    Ok(removed)
}
pub(super) fn stage(
    library: &Path,
    rows: &[InstalledMod],
) -> Result<(PathBuf, usize, usize), String> {
    let requested_bytes = rows
        .iter()
        .filter(|m| m.enabled)
        .flat_map(|m| &m.manifest.files)
        .try_fold(0u64, |n, e| {
            n.checked_add(e.size_bytes).ok_or("Staging quota overflow")
        })?;
    if requested_bytes > 512 * 1024 * 1024 {
        return Err("Expanded staging exceeds 512 MiB quota".into());
    }
    let root = library.join("staging");
    check_chain(&root, true)?;
    if fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .count()
        >= 4
    {
        return Err("Staging recovery quota reached. Clear owned staging and inspect retained generations before staging again.".into());
    }
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let id = format!("{:032x}", u128::from_be_bytes(random));
    let dir = generation(&root, &id)?;
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    let mut receipt = Receipt {
        generation: id,
        files: vec![],
    };
    storage::write(&dir.join(".laap-stage.json"), &receipt)?;
    let result = (|| {
        let mut mods: Vec<_> = rows.iter().filter(|r| r.enabled).collect();
        mods.sort_by_key(|r| r.priority);
        let mut seen = std::collections::BTreeSet::new();
        for m in &mods {
            let bytes = read_blob(
                &library.join("content").join(&m.manifest.sha256),
                32 * 1024 * 1024,
            )?;
            validate_archive(&bytes, &m.manifest)?;
            let mut zip =
                zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
            for e in &m.manifest.files {
                if !seen.insert(e.relative_path.to_ascii_lowercase()) {
                    return Err("Resolve path conflicts before staging.".into());
                }
                let dest = dir.join(&e.relative_path);
                check_chain(dest.parent().unwrap(), true)?;
                let mut output = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&dest)
                    .map_err(|e| e.to_string())?;
                // Persist ownership before writing so an interrupted stage has a recoverable receipt.
                receipt.files.push(e.clone());
                storage::write(&dir.join(".laap-stage.json"), &receipt)?;
                let mut entry = zip.by_name(&e.relative_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
                output.flush().map_err(|e| e.to_string())?;
                output.sync_all().map_err(|e| e.to_string())?;
            }
        }
        // Pointer update is the commit; existing generations are left intact for recovery.
        storage::write(&root.join("active.json"), &receipt)?;
        Ok((dir.clone(), mods.len(), receipt.files.len()))
    })();
    if result.is_err() {
        let _ = cleanup(&root, &receipt);
    }
    result
}
pub(super) fn rollback(library: &Path) -> Result<usize, String> {
    let root = library.join("staging");
    if !root.exists() {
        return Ok(0);
    }
    check_chain(&root, false)?;
    let Some(receipt) = storage::read::<Receipt>(&root.join("active.json"), 256 * 1024)? else {
        return Ok(0);
    };
    let count = cleanup(&root, &receipt)?;
    fs::remove_file(root.join("active.json")).map_err(|e| e.to_string())?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        let p = std::env::temp_dir().join(format!("laap-sandbox-{}", rand::random::<u64>()));
        fs::create_dir(&p).unwrap();
        p
    }
    #[test]
    fn rollback_retains_unrelated_files_and_rejects_modified_owned_files() {
        let root = temp();
        let staging = root.join("staging");
        fs::create_dir(&staging).unwrap();
        let id = "a".repeat(32);
        let dir = staging.join(&id);
        fs::create_dir(&dir).unwrap();
        let receipt = Receipt {
            generation: id,
            files: vec![super::super::library::Entry {
                relative_path: "owned.txt".into(),
                sha256: format!("{:x}", Sha256::digest(b"original")),
                size_bytes: 8,
            }],
        };
        fs::write(dir.join("owned.txt"), b"changed!").unwrap();
        fs::write(dir.join("unrelated.txt"), b"keep").unwrap();
        storage::write(&dir.join(".laap-stage.json"), &receipt).unwrap();
        storage::write(&staging.join("active.json"), &receipt).unwrap();
        assert!(rollback(&root).is_err());
        assert!(dir.join("owned.txt").exists());
        fs::write(dir.join("owned.txt"), b"original").unwrap();
        assert_eq!(rollback(&root).unwrap(), 1);
        assert!(dir.join("unrelated.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn windows_junctions_are_rejected_without_touching_the_target() {
        let root = temp();
        let outside = temp();
        let link = root.join("junction");
        fs::write(outside.join("keep.txt"), b"unchanged").unwrap();
        let result = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&outside)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(check_chain(&link, false).is_err());
        assert!(read_blob(&link.join("keep.txt"), 100).is_err());
        assert_eq!(fs::read(outside.join("keep.txt")).unwrap(), b"unchanged");
        fs::remove_dir(&link).unwrap();
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
    #[test]
    fn rejects_traversal_receipts_and_external_symbolic_paths() {
        let root = temp();
        assert!(generation(&root, "../elsewhere").is_err());
        #[cfg(unix)]
        {
            let link = root.join("link");
            std::os::unix::fs::symlink(std::env::temp_dir(), &link).unwrap();
            assert!(check_chain(&link, false).is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
