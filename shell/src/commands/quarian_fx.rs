use quarian_dsp::{process_pcm_bytes, process_wav_bytes, QuarianVoiceFilterParams};

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

    let is_pcm = wav.len() < 4 || &wav[..4] != b"RIFF";

    log::info!(
        "quarian_fx input bytes={} pcm={is_pcm} params={params:?} header={header}",
        wav.len()
    );

    let result = if is_pcm {
        process_pcm_bytes(&wav, 24_000, 1, &params)
    } else {
        process_wav_bytes(&wav, &params)
    };

    match result {
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
