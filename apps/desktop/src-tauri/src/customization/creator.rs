use super::{fantome::FantomeMeta, storage};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Cursor, Write},
    path::PathBuf,
    sync::Mutex,
};
use tauri::AppHandle;
use zip::{write::SimpleFileOptions, ZipWriter};

static LOCK: Mutex<()> = Mutex::new(());
const MAX_PROJECTS: usize = 100;
const MAX_FILES_PER_PROJECT: usize = 200;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub relative_path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub format_type: String,
    pub data_base64: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreatorProject {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub champion: String,
    pub skin_num: u32,
    pub tags: Vec<String>,
    pub files: Vec<ProjectFile>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub champion: String,
    pub file_count: usize,
    pub updated_at: String,
}

pub fn validate_project_id(id: &str) -> Result<(), String> {
    let trimmed = id.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("Project ID must be between 1 and 64 characters.".into());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(
            "Project ID must contain only alphanumeric characters, dashes, or underscores.".into(),
        );
    }
    Ok(())
}

fn projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = storage::root(app)?.join("creator_projects");
    super::sandbox::check_chain(&dir, true)?;
    Ok(dir)
}

fn generate_id() -> Result<String, String> {
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    Ok(format!("{:032x}", u128::from_be_bytes(random)))
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn validate_project(project: &CreatorProject) -> Result<(), String> {
    validate_project_id(&project.id)?;
    if project.version.trim().is_empty() || project.version.chars().count() > 40 || project.version.chars().any(char::is_control) {
        return Err("Project version must contain 1–40 visible characters.".into());
    }
    if project.champion.trim().is_empty() || project.champion.chars().count() > 80 {
        return Err("Set a target champion or project category of at most 80 characters.".into());
    }
    if project.name.trim().is_empty()
        || project.name.chars().count() > 80
        || project.author.chars().count() > 120
        || project.description.len() > 2000
        || project.tags.len() > 20
        || project.files.len() > MAX_FILES_PER_PROJECT
    {
        return Err("Invalid project metadata or quota".into());
    }
    let encoded_size = project.files.iter().try_fold(0usize, |size, file| {
        size.checked_add(file.data_base64.as_ref().map_or(0, String::len)).ok_or("Project size overflow")
    })?;
    if encoded_size > 8 * 1024 * 1024 { return Err("Project exceeds 8 MiB asset budget".into()); }
    let mut seen = std::collections::BTreeSet::new();
    for file in &project.files {
        if !super::library::safe_name(&file.relative_path)
            || !seen.insert(file.relative_path.to_ascii_lowercase())
        {
            return Err("Invalid or duplicate asset path".into());
        }
        let ext = file.relative_path.rsplit('.').next().unwrap_or("");
        if super::fantome::is_executable_extension(ext) {
            return Err("Executable asset forbidden".into());
        }
        let bytes = STANDARD
            .decode(
                file.data_base64
                    .as_deref()
                    .ok_or("Project asset content missing")?,
            )
            .map_err(|_| "Invalid project asset encoding")?;
        if bytes.len() as u64 != file.size_bytes
            || format!("{:x}", Sha256::digest(&bytes)) != file.sha256
        {
            return Err("Asset digest or size mismatch".into());
        }
    }
    if serde_json::to_vec(project)
        .map_err(|e| e.to_string())?
        .len()
        > 8 * 1024 * 1024
    {
        return Err("Project exceeds 8 MiB persisted metadata-and-assets budget".into());
    }
    Ok(())
}
fn write_project(path: &std::path::Path, project: &CreatorProject) -> Result<(), String> {
    validate_project(project)?;
    storage::write(path, project)
}

#[tauri::command]
pub fn creator_list_projects(app: AppHandle) -> Result<Vec<ProjectSummary>, String> {
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;
    let mut summaries = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "json") {
                if let Ok(Some(proj)) = storage::read::<CreatorProject>(&path, 8 * 1024 * 1024) {
                    summaries.push(ProjectSummary {
                        id: proj.id,
                        name: proj.name,
                        author: proj.author,
                        version: proj.version,
                        champion: proj.champion,
                        file_count: proj.files.len(),
                        updated_at: proj.updated_at,
                    });
                }
            }
        }
    }
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

pub(crate) fn create_project_with_assets_at(
    customization_root: &std::path::Path,
    name: &str,
    champion: &str,
    author: &str,
    assets: Vec<(String, Vec<u8>)>,
) -> Result<CreatorProject, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() || trimmed_name.chars().count() > 80 {
        return Err("Project name must be between 1 and 80 characters.".into());
    }
    let dir = customization_root.join("creator_projects");
    super::sandbox::check_chain(&dir, true)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;

    let count = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|v| v == "json"))
        .count();
    if count >= MAX_PROJECTS {
        return Err("Maximum number of projects reached (100).".into());
    }

    let id = generate_id()?;
    let now = now_iso();
    let mut files = Vec::with_capacity(assets.len());
    for (rel, bytes) in assets {
        let safe_rel = super::fantome::validate_zip_entry_path(&rel)?;
        let clean_path = safe_rel.to_string_lossy().replace('\\', "/");
        let ext = clean_path
            .rsplit_once('.')
            .map(|(_, e)| e.to_ascii_lowercase())
            .unwrap_or_default();
        if super::fantome::is_executable_extension(&ext) {
            return Err("Executable files are forbidden in Creator packages.".into());
        }
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        files.push(ProjectFile {
            format_type: super::fantome::classify_format(&clean_path),
            relative_path: clean_path,
            size_bytes: bytes.len() as u64,
            sha256,
            data_base64: Some(STANDARD.encode(&bytes)),
        });
    }

    let project = CreatorProject {
        id: id.clone(),
        name: trimmed_name.to_string(),
        author: author.trim().into(),
        version: "1.0.0".into(),
        description: "Extracted locally from verified game WAD assets.".into(),
        champion: champion.trim().to_string(),
        skin_num: 0,
        tags: vec!["local-wad".into()],
        files,
        created_at: now.clone(),
        updated_at: now,
    };

    let file_path = dir.join(format!("{id}.json"));
    write_project(&file_path, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn creator_create_project(
    app: AppHandle,
    name: String,
    champion: String,
    author: String,
) -> Result<CreatorProject, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() || trimmed_name.chars().count() > 80 {
        return Err("Project name must be between 1 and 80 characters.".into());
    }
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;

    let count = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.count();
    if count >= MAX_PROJECTS {
        return Err("Maximum number of projects reached (100).".into());
    }

    let id = generate_id()?;
    let now = now_iso();
    let project = CreatorProject {
        id: id.clone(),
        name: trimmed_name.to_string(),
        author: author.trim().into(),
        version: "1.0.0".into(),
        description: String::new(),
        champion: champion.trim().to_string(),
        skin_num: 0,
        tags: vec![],
        files: vec![],
        created_at: now.clone(),
        updated_at: now,
    };

    let file_path = dir.join(format!("{id}.json"));
    write_project(&file_path, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn creator_get_project(app: AppHandle, id: String) -> Result<CreatorProject, String> {
    validate_project_id(&id)?;
    let dir = projects_dir(&app)?;
    let path = dir.join(format!("{id}.json"));
    storage::read::<CreatorProject>(&path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Project not found.".into())
}

#[tauri::command]
pub fn creator_save_project(
    app: AppHandle,
    mut project: CreatorProject,
) -> Result<CreatorProject, String> {
    validate_project_id(&project.id)?;
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;

    let path = dir.join(format!("{}.json", project.id));
    if !path.exists() { return Err("Project was removed; import a recovery copy to preserve your draft.".into()); }
    project.updated_at = now_iso();
    write_project(&path, &project)?;

    // Write crash recovery autosave
    let autosave_dir = dir.join("autosave");
    storage::write(&autosave_dir.join(format!("{}.json", project.id)), &project)?;

    Ok(project)
}

/// Portable project imports receive a new local identity and never overwrite an existing project.
#[tauri::command]
pub fn creator_import_project(app: AppHandle, mut project: CreatorProject) -> Result<CreatorProject, String> {
    validate_project(&project)?;
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;
    if std::fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|v| v == "json")).count() >= MAX_PROJECTS {
        return Err("Maximum number of projects reached (100).".into());
    }
    project.id = generate_id()?;
    project.created_at = now_iso();
    project.updated_at = project.created_at.clone();
    write_project(&dir.join(format!("{}.json", project.id)), &project)?;
    Ok(project)
}

#[tauri::command]
pub fn creator_duplicate_project(app: AppHandle, id: String) -> Result<CreatorProject, String> {
    validate_project_id(&id)?;
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;

    let count = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.count();
    if count >= MAX_PROJECTS {
        return Err("Maximum number of projects reached (100).".into());
    }

    let path = dir.join(format!("{id}.json"));
    let mut proj = storage::read::<CreatorProject>(&path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Original project not found.".to_string())?;

    let new_id = generate_id()?;
    proj.id = new_id.clone();
    proj.name = format!("{} (Copy)", proj.name);
    proj.updated_at = now_iso();

    let new_path = dir.join(format!("{new_id}.json"));
    write_project(&new_path, &proj)?;
    Ok(proj)
}

#[tauri::command]
pub fn creator_delete_project(app: AppHandle, id: String) -> Result<bool, String> {
    validate_project_id(&id)?;
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;
    let path = dir.join(format!("{id}.json"));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn creator_add_file(
    app: AppHandle,
    project_id: String,
    relative_path: String,
    data_base64: String,
) -> Result<ProjectFile, String> {
    validate_project_id(&project_id)?;
    let safe_rel = super::fantome::validate_zip_entry_path(&relative_path)?;
    let clean_path = safe_rel.to_string_lossy().replace('\\', "/");

    let ext = clean_path
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    if super::fantome::is_executable_extension(&ext) {
        return Err("Executable files are forbidden in Creator packages.".into());
    }

    if data_base64.len() > 8 * 1024 * 1024 {
        return Err("Project asset exceeds persisted quota".into());
    }
    let bytes = STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decoding failed: {e}"))?;

    if bytes.len() > 50 * 1024 * 1024 {
        return Err("Individual project asset exceeds 50 MiB limit.".into());
    }

    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;
    let proj_path = dir.join(format!("{project_id}.json"));
    let mut proj = storage::read::<CreatorProject>(&proj_path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Project not found.".to_string())?;

    if proj.files.len() >= MAX_FILES_PER_PROJECT {
        return Err("Maximum files per project reached (200).".into());
    }

    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    let format_type = super::fantome::classify_format(&clean_path);

    let file_record = ProjectFile {
        relative_path: clean_path.clone(),
        size_bytes: bytes.len() as u64,
        sha256,
        format_type,
        data_base64: Some(data_base64),
    };

    proj.files.retain(|f| f.relative_path != clean_path);
    proj.files.push(file_record.clone());
    proj.updated_at = now_iso();

    write_project(&proj_path, &proj)?;
    Ok(file_record)
}

#[tauri::command]
pub fn creator_remove_file(
    app: AppHandle,
    project_id: String,
    relative_path: String,
) -> Result<bool, String> {
    validate_project_id(&project_id)?;
    let dir = projects_dir(&app)?;
    let _guard = LOCK.lock().map_err(|_| "Projects lock unavailable.")?;
    let proj_path = dir.join(format!("{project_id}.json"));
    let mut proj = storage::read::<CreatorProject>(&proj_path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Project not found.".to_string())?;

    let clean_path = relative_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    let initial_count = proj.files.len();
    proj.files.retain(|f| f.relative_path != clean_path);

    if proj.files.len() < initial_count {
        proj.updated_at = now_iso();
        write_project(&proj_path, &proj)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn creator_export_fantome(app: AppHandle, project_id: String) -> Result<String, String> {
    validate_project_id(&project_id)?;
    let dir = projects_dir(&app)?;
    let proj_path = dir.join(format!("{project_id}.json"));
    let proj = storage::read::<CreatorProject>(&proj_path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Project not found.".to_string())?;

    if proj.files.is_empty() {
        return Err("Cannot export an empty project. Add at least one asset file.".into());
    }

    validate_project(&proj)?;
    let mut buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut buf);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Build META/info.json
    let meta = FantomeMeta {
        license: None,
        name: proj.name,
        author: proj.author,
        version: proj.version,
        description: proj.description,
        mod_type: "Skin".into(),
        target_champion: if proj.champion.is_empty() {
            None
        } else {
            Some(proj.champion)
        },
        target_skin: Some(proj.skin_num),
    };
    let meta_bytes = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;

    zip.start_file("META/info.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(&meta_bytes).map_err(|e| e.to_string())?;

    for file in &proj.files {
        if let Some(b64) = &file.data_base64 {
            let data = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            zip.start_file(&file.relative_path, opts)
                .map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(buf.into_inner()))
}

#[tauri::command]
pub fn creator_export_modpkg(app: AppHandle, project_id: String) -> Result<String, String> {
    validate_project_id(&project_id)?;
    let dir = projects_dir(&app)?;
    let proj_path = dir.join(format!("{project_id}.json"));
    let proj = storage::read::<CreatorProject>(&proj_path, 8 * 1024 * 1024)?
        .ok_or_else(|| "Project not found.".to_string())?;

    if proj.files.is_empty() {
        return Err("Cannot export an empty project. Add at least one asset file.".into());
    }

    validate_project(&proj)?;
    let mut buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(&mut buf);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Build modpkg.json
    let manifest_bytes = serde_json::to_vec_pretty(&serde_json::json!({
        "modpkgVersion": "1.0",
        "name": proj.name,
        "author": proj.author,
        "version": proj.version,
        "champion": proj.champion,
        "description": proj.description,
        "files": proj.files.iter().map(|f| &f.relative_path).collect::<Vec<_>>()
    }))
    .map_err(|e| e.to_string())?;

    zip.start_file("modpkg.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(&manifest_bytes).map_err(|e| e.to_string())?;

    for file in &proj.files {
        if let Some(b64) = &file.data_base64 {
            let data = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            zip.start_file(&file.relative_path, opts)
                .map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(buf.into_inner()))
}

#[tauri::command]
pub async fn creator_export_file(app: AppHandle, project_id: String, kind: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (bytes, extension) = match kind.as_str() {
            "project" => {
                let project = creator_get_project(app.clone(), project_id.clone())?;
                validate_project(&project)?;
                (serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?, "json")
            }
            "fantome" => (STANDARD.decode(creator_export_fantome(app.clone(), project_id.clone())?).map_err(|e| e.to_string())?, "fantome"),
            "modpkg" => (STANDARD.decode(creator_export_modpkg(app.clone(), project_id.clone())?).map_err(|e| e.to_string())?, "modpkg"),
            _ => return Err("Unsupported project export type".into()),
        };
        super::exports::save_dialog(&app, &bytes, &format!("{project_id}.{extension}"), extension)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_project_preserves_assets_and_failed_validation_keeps_last_save() {
        let root = std::env::temp_dir().join(format!("laap-project-{}", rand::random::<u64>()));
        std::fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let bytes = b"Original text asset";
        let mut project = CreatorProject { id: "owned-fixture".into(), name: "Original".into(), author: "Fixture author".into(), version: "1".into(), description: "".into(), champion: "Ahri".into(), skin_num: 0, tags: vec![], created_at: now_iso(), updated_at: now_iso(),
            files: vec![ProjectFile { relative_path: "assets/original.txt".into(), size_bytes: bytes.len() as u64, sha256: format!("{:x}", Sha256::digest(bytes)), format_type: "Other Asset".into(), data_base64: Some(STANDARD.encode(bytes)) }] };
        let file = root.join("owned-fixture.json");
        write_project(&file, &project).unwrap();
        let saved = project.clone();
        let mut invalid = saved.clone(); invalid.version.clear();
        assert!(write_project(&file, &invalid).unwrap_err().contains("version"));
        project.files[0].data_base64 = Some(STANDARD.encode(b"corrupted"));
        assert!(write_project(&file, &project).is_err());
        assert_eq!(storage::read::<CreatorProject>(&file, 8 * 1024 * 1024).unwrap().unwrap(), saved);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_project_file_handling() {
        let f = ProjectFile {
            relative_path: "assets/textures/skin.dds".into(),
            size_bytes: 1024,
            sha256: "aabbcc".into(),
            format_type: "Texture / Image".into(),
            data_base64: Some("SGVsbG8gV29ybGQ=".into()),
        };
        assert_eq!(f.format_type, "Texture / Image");
        assert_eq!(f.relative_path, "assets/textures/skin.dds");
    }
}
