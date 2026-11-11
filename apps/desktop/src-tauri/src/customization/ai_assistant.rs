use super::provider_support;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
    time::Duration,
};
use tauri::AppHandle;
static TASKS: LazyLock<Mutex<HashMap<String, Arc<tokio::sync::Notify>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
struct Task(String);
impl Drop for Task {
    fn drop(&mut self) {
        if let Ok(mut tasks) = TASKS.lock() {
            tasks.remove(&self.0);
        }
    }
}
fn task(id: &str) -> Result<(Task, Arc<tokio::sync::Notify>), String> {
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid request identity".into());
    }
    let mut tasks = TASKS
        .lock()
        .map_err(|_| "Provider task registry unavailable")?;
    if tasks.len() >= 2 || tasks.contains_key(id) {
        return Err("Another provider request is in progress".into());
    }
    let n = Arc::new(tokio::sync::Notify::new());
    tasks.insert(id.into(), n.clone());
    Ok((Task(id.into()), n))
}
#[tauri::command]
pub fn provider_cancel(request_id: String) -> Result<bool, String> {
    let tasks = TASKS.lock().map_err(|_| "Provider tasks unavailable")?;
    if let Some(n) = tasks.get(&request_id) {
        n.notify_one();
        return Ok(true);
    }
    Ok(false)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub message: String,
    pub model: String,
    pub tokens_used: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResponse {
    pub audio_base64: String,
    pub format: String,
    pub character_count: usize,
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())
}
async fn chat_request(
    client: &reqwest::Client,
    url: &str,
    provider: &str,
    key: &str,
    prompt: &str,
    model: &str,
) -> Result<AiResponse, String> {
    let instructions="Help with original creator assets, documentation and LAAP themes. Do not request account credentials or provide live competitive advice.";
    let (payload, header) = if provider == "openai" {
        (
            json!({"model":model,"instructions":instructions,"input":prompt,"max_output_tokens":800,"store":false}),
            "Authorization",
        )
    } else {
        (
            json!({"model":model,"input":prompt,"system_instruction":instructions,"generation_config":{"max_output_tokens":800},"store":false}),
            "x-goog-api-key",
        )
    };
    let mut request = client.post(url).json(&payload);
    request = if provider == "openai" {
        request.header(header, format!("Bearer {key}"))
    } else {
        request
            .header(header, key)
            .header("Api-Revision", "2026-05-20")
    };
    let response = request
        .send()
        .await
        .map_err(|_| "[NETWORK_ERROR] AI provider unavailable")?;
    let value: Value =
        serde_json::from_slice(&provider_support::bounded_body(response, 1024 * 1024).await?)
            .map_err(|_| "[INVALID_RESPONSE] Invalid AI JSON")?;
    if value["status"].as_str().is_some_and(|v| v != "completed") {
        return Err("[INCOMPLETE] Provider response did not complete within output limit".into());
    }
    let mut text = Vec::new();
    if provider == "openai" {
        if let Some(output) = value["output"].as_array() {
            for item in output {
                if let Some(content) = item["content"].as_array() {
                    for part in content {
                        if part["type"] == "output_text" {
                            if let Some(t) = part["text"].as_str() {
                                text.push(t.to_string());
                            }
                        }
                    }
                }
            }
        }
    } else if let Some(steps) = value["steps"].as_array() {
        for step in steps {
            if step["type"] == "model_output" {
                if let Some(content) = step["content"].as_array() {
                    for part in content {
                        if part["type"] == "text" {
                            if let Some(t) = part["text"].as_str() {
                                text.push(t.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    let message = text.join("\n");
    if message.trim().is_empty() {
        return Err("[INVALID_RESPONSE] Provider returned no answer".into());
    }
    Ok(AiResponse {
        message,
        model: model.into(),
        tokens_used: value["usage"]["total_tokens"]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok()),
    })
}
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    consent: bool,
    request_id: String,
) -> Result<AiResponse, String> {
    if !consent {
        return Err("Explicit consent to send the prompt to this provider is required".into());
    }
    if prompt.trim().is_empty() || prompt.chars().count() > 4000 {
        return Err("Prompt must contain 1–4000 characters".into());
    }
    if !matches!(
        (provider.as_str(), model.as_str()),
        ("openai", "gpt-4.1-mini") | ("gemini", "gemini-3.8-flash")
    ) {
        return Err("Unsupported provider/model pair".into());
    }
    let (_task, cancel) = task(&request_id)?;
    let key = provider_support::load(&app, &provider)?;
    let client = client()?;
    let url = if provider == "openai" {
        "https://api.openai.com/v1/responses"
    } else {
        "https://generativelanguage.googleapis.com/v1beta/interactions"
    };
    tokio::select! {_ = cancel.notified()=>Err("[CANCELLED] Request cancelled; provider may still bill already processed work".into()),result=chat_request(&client,url,&provider,&key,&prompt,&model)=>result}
}
fn validate_mp3(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    use symphonia::core::{
        audio::SampleBuffer, codecs::DecoderOptions, formats::FormatOptions, io::MediaSourceStream,
        meta::MetadataOptions, probe::Hint,
    };
    let source = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes.clone())),
        Default::default(),
    );
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "[INVALID_AUDIO] Invalid MP3 stream")?
        .format;
    let track = format
        .default_track()
        .ok_or("[INVALID_AUDIO] No audio track")?;
    let id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "[INVALID_AUDIO] Unsupported MP3 codec")?;
    let mut samples = 0usize;
    let mut peak = 0f32;
    let mut seconds = 0f64;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(_) => return Err("[INVALID_AUDIO] Corrupt MP3 packet".into()),
        };
        if packet.track_id() != id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|_| "[INVALID_AUDIO] MP3 decoding failed")?;
        seconds += decoded.frames() as f64 / decoded.spec().rate as f64;
        if seconds > 120.0 {
            return Err("[INVALID_AUDIO] Audio exceeds two-minute budget".into());
        }
        let mut pcm = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        pcm.copy_interleaved_ref(decoded);
        for &sample in pcm.samples() {
            if !sample.is_finite() {
                return Err("[INVALID_AUDIO] Non-finite audio sample".into());
            }
            peak = peak.max(sample.abs());
            samples += 1;
        }
    }
    if samples < 1000 || peak < 0.00001 {
        return Err("[INVALID_AUDIO] Empty or silent audio rejected".into());
    }
    Ok(bytes)
}
async fn speech_request(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    text: &str,
) -> Result<TtsResponse, String> {
    let response = client
        .post(url)
        .header("xi-api-key", key)
        .header("Accept", "audio/mpeg")
        .json(&json!({"text":text,"model_id":"eleven_multilingual_v2"}))
        .send()
        .await
        .map_err(|_| "[NETWORK_ERROR] Voice provider unavailable")?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = provider_support::bounded_body(response, 8 * 1024 * 1024).await?;
    if !mime.starts_with("audio/mpeg")
        || bytes.len() < 32
        || !(bytes.starts_with(b"ID3") || (bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0))
    {
        return Err("[INVALID_AUDIO] Provider did not return MP3 audio".into());
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || validate_mp3(bytes))
        .await
        .map_err(|e| e.to_string())??;
    Ok(TtsResponse {
        audio_base64: STANDARD.encode(bytes),
        format: "audio/mpeg".into(),
        character_count: text.chars().count(),
    })
}
#[tauri::command]
pub async fn elevenlabs_tts(
    app: AppHandle,
    text: String,
    voice_id: String,
    consent: bool,
    request_id: String,
) -> Result<TtsResponse, String> {
    if !consent {
        return Err("Consent to send text to ElevenLabs is required".into());
    }
    if text.trim().is_empty()
        || text.chars().count() > 1000
        || voice_id.len() > 64
        || voice_id.is_empty()
        || !voice_id.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err("Enter 1–1000 characters and a valid authorized voice ID".into());
    }
    let (_task, cancel) = task(&request_id)?;
    let key = provider_support::load(&app, "elevenlabs")?;
    let client = client()?;
    let url = format!(
        "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    );
    tokio::select! {_ = cancel.notified()=>Err("[CANCELLED] Voice request cancelled".into()),result=speech_request(&client,&url,&key,&text)=>result}
}
#[tauri::command]
pub async fn streamelements_tts() -> Result<TtsResponse, String> {
    Err("StreamElements speech is unavailable: no supported authorized API contract has been configured. Use ElevenLabs with your own key.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn real_http_fixtures_enforce_ai_schema_output_bounds_and_audio_type() {
        use axum::{routing::post, Json, Router};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let app=Router::new().route("/responses",post(|Json(v):Json<Value>|async move{assert_eq!(v["max_output_tokens"],800);assert_eq!(v["store"],false);Json(json!({"status":"completed","output":[{"content":[{"type":"output_text","text":"Fixture authoring answer"}]}],"usage":{"total_tokens":19}}))})).route("/bad-audio",post(||async{([("content-type","audio/mpeg")],"this is not audio")})).route("/voice",post(||async{let mut bytes=b"ID3".to_vec();bytes.extend([0;61]);([("content-type","audio/mpeg")],bytes)}));
        let handle = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let c = client().unwrap();
        let result = chat_request(
            &c,
            &format!("{base}/responses"),
            "openai",
            "fixture-key",
            "Original assets",
            "gpt-4.1-mini",
        )
        .await
        .unwrap();
        assert_eq!(result.tokens_used, Some(19));
        assert!(
            speech_request(&c, &format!("{base}/bad-audio"), "fixture-key", "hello")
                .await
                .is_err()
        );
        assert!(
            speech_request(&c, &format!("{base}/voice"), "fixture-key", "hello")
                .await
                .is_err()
        );
        handle.abort();
    }
    #[tokio::test]
    async fn cancellation_registry_is_bounded_and_released() {
        let id = "a".repeat(32);
        let (guard, cancel) = task(&id).unwrap();
        assert!(task(&id).is_err());
        assert!(provider_cancel(id.clone()).unwrap());
        cancel.notified().await;
        drop(guard);
        assert!(!provider_cancel(id).unwrap());
    }
}
