use quarian_dsp::{process_wav_bytes, QuarianVoiceFilterParams};

#[tauri::command]
pub fn quarian_fx(
    wav: Vec<u8>,
    params: Option<QuarianVoiceFilterParams>,
) -> Result<Vec<u8>, String> {
    let params = params.unwrap_or_default();
    let header = wav
        .iter()
        .take(32)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ");

    log::info!(
        "quarian_fx input bytes={} params={params:?} header={header}",
        wav.len()
    );

    match process_wav_bytes(&wav, &params) {
        Ok(output) => {
            log::info!("quarian_fx output bytes={}", output.len());
            Ok(output)
        }
        Err(err) => {
            log::error!("quarian_fx failed: {err}");
            Err(err.to_string())
        }
    }
}
