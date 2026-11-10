use super::{
    catalog::{safe_id, safe_version, ChampionDetail, Snapshot},
    catalog_seed::Seed,
    storage,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs::File, io::Read, time::Duration};
use tauri::AppHandle;

static CACHE_EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub(super) fn invalidate_pending_cache_writes() {
    CACHE_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

const MAX_IMAGE: u64 = 2 * 1024 * 1024;
static NETWORK: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

fn image_url(bytes: Vec<u8>, portrait: bool) -> Result<String, String> {
    let format = image::guess_format(&bytes).map_err(|_| "Invalid catalog image.")?;
    let expected = if portrait {
        image::ImageFormat::Png
    } else {
        image::ImageFormat::Jpeg
    };
    if format != expected {
        return Err("Unexpected catalog image format.".into());
    }
    let (width, height) = image::ImageReader::with_format(std::io::Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| "Invalid catalog image header.")?;
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err("Catalog image dimensions exceed the limit.".into());
    }
    Ok(format!(
        "data:{};base64,{}",
        if portrait { "image/png" } else { "image/jpeg" },
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub async fn catalog_artwork(
    app: AppHandle,
    id: String,
    version: String,
    skin: Option<u32>,
) -> Result<String, String> {
    if !safe_id(&id) || !safe_version(&version) {
        return Err("Invalid catalog artwork identifier.".into());
    }
    let epoch = CACHE_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
    let permit = NETWORK
        .acquire()
        .await
        .map_err(|_| "Artwork service unavailable.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        if let Ok(bytes) = Seed::open(&app).and_then(|seed| seed.artwork(&id, &version, skin)) {
            return image_url(bytes, skin.is_none());
        }
        let dir = storage::root(&app)?.join("catalog");
        // Limit new media to champion IDs and cosmetic numbers in a validated local snapshot.
        let known = std::fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("champions-")
            })
            .any(|entry| {
                storage::read::<Snapshot<Vec<super::catalog::Champion>>>(
                    &entry.path(),
                    8 * 1024 * 1024,
                )
                .ok()
                .flatten()
                .is_some_and(|snapshot| {
                    snapshot.version == version && snapshot.data.iter().any(|row| row.id == id)
                })
            });
        if !known {
            return Err("Refresh the catalog before opening this image.".into());
        }
        if let Some(number) = skin {
            let supported = std::fs::read_dir(&dir)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().starts_with("detail-"))
                .any(|entry| {
                    storage::read::<Snapshot<ChampionDetail>>(&entry.path(), 8 * 1024 * 1024)
                        .ok()
                        .flatten()
                        .is_some_and(|detail| {
                            detail.version == version
                                && detail.data.champion.id == id
                                && detail.data.skins.iter().any(|row| row.num == number)
                        })
                });
            if !supported {
                return Err("Open this champion before requesting its preview.".into());
            }
        }
        let filename = skin
            .map(|number| format!("skin-{number}.jpg"))
            .unwrap_or_else(|| "portrait.png".into());
        let cache = dir.join("media").join(&version).join(&id).join(filename);
        if let Ok(file) = File::open(&cache) {
            let mut bytes = Vec::new();
            file.take(MAX_IMAGE + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 <= MAX_IMAGE {
                if let Ok(url) = image_url(bytes, skin.is_none()) {
                    return Ok(url);
                }
            }
        }
        let path = skin
            .map(|number| format!("cdn/img/champion/loading/{id}_{number}.jpg"))
            .unwrap_or_else(|| format!("cdn/{version}/img/champion/{id}.png"));
        let response = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?
            .get(format!("https://ddragon.leagueoflegends.com/{path}"))
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        response
            .take(MAX_IMAGE + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_IMAGE {
            return Err("Catalog image exceeds its size limit.".into());
        }
        let result = image_url(bytes.clone(), skin.is_none())?;
        if CACHE_EPOCH.load(std::sync::atomic::Ordering::SeqCst) == epoch {
            storage::write_bytes(&cache, &bytes)?;
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
