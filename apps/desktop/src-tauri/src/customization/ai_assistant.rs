use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub message: String,
    pub model: String,
    pub tokens_used: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResponse {
    pub audio_base64: String,
    pub format: String,
    pub character_count: usize,
}

fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for b in input.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

#[tauri::command]
pub async fn ai_chat(
    _app: AppHandle,
    prompt: String,
    model: Option<String>,
) -> Result<AiResponse, String> {
    let clean_prompt = prompt.trim();
    if clean_prompt.is_empty() {
        return Err("Prompt cannot be empty.".into());
    }
    if clean_prompt.len() > 4000 {
        return Err("Prompt exceeds maximum length of 4000 characters.".into());
    }

    let openai_key = std::env::var("OPENAI_API_KEY").ok();
    let gemini_key = std::env::var("GEMINI_API_KEY").ok();

    if let Some(key) = openai_key {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        let selected_model = model.unwrap_or_else(|| "gpt-4o-mini".into());
        let payload = serde_json::json!({
            "model": selected_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are LAAP Studio AI Companion, an expert assistant for League of Legends custom skin creation, Fantome package authoring, 3D texturing, and asset management."
                },
                {
                    "role": "user",
                    "content": clean_prompt
                }
            ],
            "max_tokens": 1000
        });

        let resp = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {key}"))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("OpenAI API network error: {e}"))?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            let error_msg = body["error"]["message"].as_str().unwrap_or("Unknown OpenAI error");
            return Err(format!("OpenAI API rejected request ({status}): {error_msg}"));
        }

        let answer = body["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| "Missing content in OpenAI response.".to_string())?;

        let tokens = body["usage"]["total_tokens"].as_u64().unwrap_or(0) as u32;

        return Ok(AiResponse {
            message: answer.to_string(),
            model: selected_model,
            tokens_used: tokens,
        });
    }

    if let Some(key) = gemini_key {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
        );
        let payload = serde_json::json!({
            "contents": [{
                "parts": [{ "text": clean_prompt }]
            }]
        });

        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Gemini API network error: {e}"))?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            let error_msg = body["error"]["message"].as_str().unwrap_or("Unknown Gemini error");
            return Err(format!("Gemini API rejected request ({status}): {error_msg}"));
        }

        let text = body["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or_else(|| "Missing content in Gemini response.".to_string())?;

        return Ok(AiResponse {
            message: text.to_string(),
            model: "gemini-1.5-flash".into(),
            tokens_used: (clean_prompt.len() / 4) as u32 + (text.len() / 4) as u32,
        });
    }

    Err("AI Companion requires a configured API key. Please configure OPENAI_API_KEY or GEMINI_API_KEY in your environment or settings to enable live AI assistance.".into())
}

#[tauri::command]
pub async fn elevenlabs_tts(
    _app: AppHandle,
    text: String,
    voice_id: Option<String>,
) -> Result<TtsResponse, String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Err("Text cannot be empty.".into());
    }
    if clean_text.len() > 1000 {
        return Err("TTS input exceeds maximum length of 1000 characters.".into());
    }

    let elevenlabs_key = std::env::var("ELEVENLABS_API_KEY").ok();
    if let Some(key) = elevenlabs_key {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;

        let voice = voice_id.unwrap_or_else(|| "21m00Tcm4TlvDq8ikWAM".into()); // Default voice (Rachel)
        let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice}");

        let payload = serde_json::json!({
            "text": clean_text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        });

        let resp = client
            .post(&url)
            .header("xi-api-key", &key)
            .header("Content-Type", "application/json")
            .header("Accept", "audio/mpeg")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("ElevenLabs API network error: {e}"))?;

        let status = resp.status();
        if !status.is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs API rejected request ({status}): {err_text}"));
        }

        let audio_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        return Ok(TtsResponse {
            audio_base64: STANDARD.encode(&audio_bytes),
            format: "audio/mp3".into(),
            character_count: clean_text.chars().count(),
        });
    }

    Err("ElevenLabs voice synthesis requires an API key. Please configure ELEVENLABS_API_KEY in your settings to enable live TTS.".into())
}

#[tauri::command]
pub async fn streamelements_tts(
    _app: AppHandle,
    text: String,
    voice: Option<String>,
) -> Result<TtsResponse, String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Err("Text cannot be empty.".into());
    }
    if clean_text.len() > 500 {
        return Err("TTS input exceeds maximum length of 500 characters.".into());
    }

    let selected_voice = voice.unwrap_or_else(|| "Brian".into());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://api.streamelements.com/kappa/v2/speech?voice={}&text={}",
        url_encode(&selected_voice),
        url_encode(clean_text)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("StreamElements TTS network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("StreamElements TTS request failed ({status})"));
    }

    let audio_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(TtsResponse {
        audio_base64: STANDARD.encode(&audio_bytes),
        format: "audio/mp3".into(),
        character_count: clean_text.chars().count(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_response_serialization() {
        let resp = AiResponse {
            message: "Test response".into(),
            model: "test-model".into(),
            tokens_used: 42,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("Test response"));
    }

    #[test]
    fn test_tts_response_serialization() {
        let tts = TtsResponse {
            audio_base64: "AAA=".into(),
            format: "audio/mp3".into(),
            character_count: 5,
        };
        let json = serde_json::to_string(&tts).unwrap();
        assert!(json.contains("audio/mp3"));
    }
}
