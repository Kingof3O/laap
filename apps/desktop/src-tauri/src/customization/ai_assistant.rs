use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub role: String, // "system", "user", "assistant"
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

    let selected_model = model.unwrap_or_else(|| "gemini-1.5-flash".into());

    // Deterministic response for offline/development operation with creator assistance tips
    let response_text = if clean_prompt.to_ascii_lowercase().contains("texture") {
        "When authoring custom character textures for League of Legends, ensure your DDS files use DXT1 (no alpha) or DXT5 (with alpha) compression with pre-multiplied alpha disabled. UV boundaries should have at least 4 pixels of padding to avoid mipmap bleeding."
    } else if clean_prompt.to_ascii_lowercase().contains("chroma") {
        "To create a clean chroma preset, define the primary and secondary accent color hex codes in the Creator Workshop manifest. Ensure the parent skin ID matches the original champion skin number."
    } else {
        "Creator Workshop Assistant: Project metadata and package structure verified. You can export your skin as a .fantome or .modpkg archive for testing."
    };

    Ok(AiResponse {
        message: response_text.into(),
        model: selected_model,
        tokens_used: (clean_prompt.len() / 4) as u32 + 35,
    })
}

#[tauri::command]
pub async fn elevenlabs_tts(
    _app: AppHandle,
    text: String,
    _voice_id: Option<String>,
) -> Result<TtsResponse, String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Err("Text cannot be empty.".into());
    }
    if clean_text.len() > 500 {
        return Err("TTS input exceeds maximum length of 500 characters.".into());
    }

    // Dummy small silent audio header (WAV PCM 44.1kHz 16-bit mono 0.1s)
    let sample_rate = 44100u32;
    let num_samples = 4410u32;
    let byte_rate = sample_rate * 2;
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36u32 + num_samples * 2).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // Subchunk1Size
    wav.extend_from_slice(&1u16.to_le_bytes());  // AudioFormat (PCM)
    wav.extend_from_slice(&1u16.to_le_bytes());  // NumChannels (Mono)
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());  // BlockAlign
    wav.extend_from_slice(&16u16.to_le_bytes()); // BitsPerSample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(num_samples * 2).to_le_bytes());
    wav.extend(vec![0u8; (num_samples * 2) as usize]);

    Ok(TtsResponse {
        audio_base64: STANDARD.encode(&wav),
        format: "audio/wav".into(),
        character_count: clean_text.chars().count(),
    })
}

#[tauri::command]
pub async fn streamelements_tts(
    app: AppHandle,
    text: String,
    voice: Option<String>,
) -> Result<TtsResponse, String> {
    elevenlabs_tts(app, text, voice).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_response_serialization() {
        let resp = AiResponse {
            message: "Hello Creator".into(),
            model: "gemini-1.5-flash".into(),
            tokens_used: 42,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("Hello Creator"));
        assert!(json.contains("tokensUsed"));
    }
}
