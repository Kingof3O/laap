use super::{
    catalog::{Champion, ChampionDetail, Snapshot},
    storage,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedManifest {
    pub schema_version: u32,
    pub version: String,
    pub files: BTreeMap<String, String>,
}

pub struct Seed {
    root: PathBuf,
    manifest: SeedManifest,
}

fn bounded(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(max + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > max {
        return Err("Bundled resource exceeded its size limit.".into());
    }
    Ok(data)
}

impl Seed {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        Self::at(
            app.path()
                .resource_dir()
                .map_err(|e| e.to_string())?
                .join("catalog"),
        )
    }

    fn at(root: PathBuf) -> Result<Self, String> {
        let manifest: SeedManifest = storage::read(&root.join("manifest.json"), 512 * 1024)?
            .ok_or("The bundled catalog is missing. Reinstall this edition or refresh online.")?;
        if manifest.schema_version != 1
            || !super::catalog::safe_version(&manifest.version)
            || manifest.files.len() > 400
        {
            return Err("Unsupported bundled catalog manifest.".into());
        }
        Ok(Self { root, manifest })
    }

    fn verified(&self, name: &str, limit: u64) -> Result<Vec<u8>, String> {
        if name.contains('/') || name.contains('\\') || name.starts_with('.') {
            return Err("Invalid bundled resource name.".into());
        }
        let expected = self
            .manifest
            .files
            .get(name)
            .ok_or("Bundled resource is unavailable.")?;
        let data = bounded(&self.root.join(name), limit)?;
        if format!("{:x}", Sha256::digest(&data)) != *expected {
            return Err(
                "The bundled catalog failed its integrity check. Reinstall this edition.".into(),
            );
        }
        Ok(data)
    }

    pub fn index(&self) -> Result<Snapshot<Vec<Champion>>, String> {
        let data = self.verified("champions-en_US.json", 8 * 1024 * 1024)?;
        let snapshot: Snapshot<Vec<Champion>> =
            serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if snapshot.version != self.manifest.version
            || snapshot.locale != "en_US"
            || snapshot.data.is_empty()
        {
            return Err("Bundled catalog identity mismatch.".into());
        }
        Ok(snapshot)
    }

    fn entry(&self, id: &str, version: &str, name: &str) -> Result<Vec<u8>, String> {
        if !super::catalog::safe_id(id)
            || version != self.manifest.version
            || !self.index()?.data.iter().any(|row| row.id == id)
        {
            return Err("No bundled resources for this catalog patch.".into());
        }
        let data = self.verified(&format!("{id}.zip"), 32 * 1024 * 1024)?;
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| e.to_string())?;
        let file = archive
            .by_name(name)
            .map_err(|_| "Bundled preview is unavailable.")?;
        if file.size() > 2 * 1024 * 1024 {
            return Err("Bundled preview is too large.".into());
        }
        let mut bytes = Vec::new();
        file.take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("Bundled preview is too large.".into());
        }
        Ok(bytes)
    }

    pub fn detail(&self, id: &str, version: &str) -> Result<Snapshot<ChampionDetail>, String> {
        let data = self.entry(id, version, "detail.json")?;
        let snapshot: Snapshot<ChampionDetail> =
            serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if snapshot.version != version
            || snapshot.data.champion.id != id
            || snapshot.locale != "en_US"
        {
            return Err("Bundled champion identity mismatch.".into());
        }
        Ok(snapshot)
    }

    pub fn artwork(&self, id: &str, version: &str, skin: Option<u32>) -> Result<Vec<u8>, String> {
        match skin {
            None => self.entry(id, version, "portrait.png"),
            Some(number) => {
                let detail = self.detail(id, version)?;
                if !detail.data.skins.iter().any(|row| row.num == number) {
                    return Err("Cosmetic is unavailable in this catalog.".into());
                }
                self.entry(id, version, &format!("skin-{number}.jpg"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires the generated first-launch Data Dragon resource pack"]
    fn generated_seed_is_complete_and_usable_offline() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/catalog");
        let seed = Seed::at(root).unwrap();
        let index = seed.index().unwrap();
        assert!(index.data.len() >= 100);
        for champion in &index.data {
            let detail = seed.detail(&champion.id, &index.version).unwrap();
            assert!(!detail.data.skins.is_empty());
            let portrait = seed.artwork(&champion.id, &index.version, None).unwrap();
            assert_eq!(
                image::guess_format(&portrait).unwrap(),
                image::ImageFormat::Png
            );
        }
    }
}
