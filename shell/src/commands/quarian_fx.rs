use quarian_voice_filter::{process_wav_bytes, QuarianVoiceFilterParams};

#[tauri::command]
pub fn quarian_fx(
    wav: Vec<u8>,
    params: Option<QuarianVoiceFilterParams>,
) -> Result<Vec<u8>, String> {
    let params = params.unwrap_or_default();
    process_wav_bytes(&wav, &params).map_err(|e| e.to_string())
}
