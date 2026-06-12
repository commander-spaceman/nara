use crate::commands::sidecar::Sidecar;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FxParams {
    pub pitch_semitones: f64,
    pub dry_gain: f64,
    pub wet_gain: f64,
    pub hpf: f64,
    pub lpf: f64,
    pub notch: f64,
    pub drive: f64,
}

impl Default for FxParams {
    fn default() -> Self {
        Self {
            pitch_semitones: 2.0,
            dry_gain: 0.80,
            wet_gain: 0.35,
            hpf: 200.0,
            lpf: 4000.0,
            notch: 900.0,
            drive: 0.10,
        }
    }
}

#[tauri::command]
pub fn quarian_fx(
    sidecar: State<'_, Option<Sidecar>>,
    wav: Vec<u8>,
    params: Option<FxParams>,
) -> Result<Vec<u8>, String> {
    let sidecar = sidecar
        .as_ref()
        .ok_or_else(|| "sidecar not available".to_string())?;

    let p = params.unwrap_or_default();

    sidecar.process(&wav, &p)
}
