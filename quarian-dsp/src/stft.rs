use std::sync::LazyLock;

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

pub const DEFAULT_N_FFT: usize = 1024;
pub const DEFAULT_HOP_LENGTH: usize = DEFAULT_N_FFT / 4;

#[derive(Debug, Clone)]
pub struct StftConfig {
    pub n_fft: usize,
    pub hop_length: usize,
    pub window: Vec<f32>,
}

static CONFIG: LazyLock<StftConfig> = LazyLock::new(StftConfig::default);

impl Default for StftConfig {
    fn default() -> Self {
        let n_fft = DEFAULT_N_FFT;
        Self {
            n_fft,
            hop_length: DEFAULT_HOP_LENGTH,
            window: hann_window(n_fft),
        }
    }
}

pub fn config() -> &'static StftConfig {
    &CONFIG
}

#[derive(Debug, Clone)]
pub struct Spectrogram {
    pub n_fft: usize,
    pub hop_length: usize,
    pub frames: Vec<Vec<Complex<f32>>>,
}

pub fn stft(samples: &[f32], config: &StftConfig) -> Spectrogram {
    let sample_len = samples.len();
    let frame_count = if sample_len == 0 {
        0
    } else {
        1 + (sample_len.saturating_sub(1)) / config.hop_length
    };

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(config.n_fft);
    let bins = config.n_fft / 2 + 1;
    let mut frames = Vec::with_capacity(frame_count);
    let mut buffer = vec![Complex::new(0.0_f32, 0.0_f32); config.n_fft];
    let pad = config.n_fft as isize / 2;

    for frame_index in 0..frame_count {
        let center = (frame_index * config.hop_length) as isize;

        for index in 0..config.n_fft {
            let offset = center + index as isize - pad;
            let sample = if offset >= 0 && (offset as usize) < sample_len {
                samples[offset as usize]
            } else {
                0.0
            };
            buffer[index].re = sample * config.window[index];
            buffer[index].im = 0.0;
        }

        fft.process(&mut buffer);
        frames.push(buffer[..bins].to_vec());
    }

    Spectrogram {
        n_fft: config.n_fft,
        hop_length: config.hop_length,
        frames,
    }
}

pub fn istft(spectrogram: &Spectrogram, config: &StftConfig, length: usize) -> Vec<f32> {
    if spectrogram.frames.is_empty() {
        return vec![0.0; length];
    }

    let frame_count = spectrogram.frames.len();
    let mut planner = FftPlanner::<f32>::new();
    let ifft = planner.plan_fft_inverse(config.n_fft);
    let overlap_len = config.n_fft + config.hop_length * frame_count.saturating_sub(1);
    let mut output = vec![0.0_f32; overlap_len];
    let mut window_sum = vec![0.0_f32; overlap_len];
    let mut buffer = vec![Complex::new(0.0_f32, 0.0_f32); config.n_fft];

    for (frame_index, frame_bins) in spectrogram.frames.iter().enumerate() {
        rebuild_full_spectrum_into(frame_bins, &mut buffer);
        ifft.process(&mut buffer);
        let start = frame_index * config.hop_length;

        for (index, sample) in buffer.iter().enumerate() {
            let value = sample.re / config.n_fft as f32 * config.window[index];
            output[start + index] += value;
            window_sum[start + index] += config.window[index] * config.window[index];
        }
    }

    for (sample, weight) in output.iter_mut().zip(window_sum.iter()) {
        if *weight > 1e-8 {
            *sample /= *weight;
        }
    }

    // Librosa's centered ISTFT keeps a little more of the reconstructed head
    // than a plain n_fft/2 trim, which avoids an audible early shift.
    let start = config
        .n_fft
        .saturating_div(2)
        .saturating_sub(config.hop_length / 2)
        .min(output.len());
    fix_length(&output[start..], length)
}

pub fn fix_length(samples: &[f32], length: usize) -> Vec<f32> {
    if samples.len() >= length {
        return samples[..length].to_vec();
    }

    let mut output = samples.to_vec();
    output.resize(length, 0.0);
    output
}

fn hann_window(size: usize) -> Vec<f32> {
    if size <= 1 {
        return vec![1.0; size.max(1)];
    }

    let scale = 2.0 * std::f32::consts::PI / size as f32;
    (0..size)
        .map(|index| 0.5 - 0.5 * (scale * index as f32).cos())
        .collect()
}

fn rebuild_full_spectrum_into(half_spectrum: &[Complex<f32>], full: &mut [Complex<f32>]) {
    let n_fft = full.len();
    let bins = n_fft / 2 + 1;
    full[..bins].copy_from_slice(&half_spectrum[..bins]);

    for index in 1..(n_fft / 2) {
        full[n_fft - index] = half_spectrum[index].conj();
    }
}

#[cfg(test)]
mod tests {
    use super::{istft, stft, StftConfig};

    #[test]
    fn stft_round_trip_preserves_length() {
        let config = StftConfig::default();
        let input: Vec<f32> = (0..4096).map(|i| (i as f32 * 0.01).sin()).collect();
        let spectrum = stft(&input, &config);
        let reconstructed = istft(&spectrum, &config, input.len());

        assert_eq!(reconstructed.len(), input.len());
    }
}
