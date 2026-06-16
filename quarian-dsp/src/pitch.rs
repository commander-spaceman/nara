use crate::phase_vocoder;
use crate::resample;
use crate::stft::{self};

pub fn pitch_shift(samples: &[f32], sample_rate: u32, semitones: f32) -> Vec<f32> {
    if samples.is_empty() || semitones.abs() < f32::EPSILON {
        return samples.to_vec();
    }

    let rate = 2.0_f32.powf(-semitones / 12.0);
    if !rate.is_finite() || rate <= 0.0 {
        return samples.to_vec();
    }

    let config = stft::config();

    let t0 = std::time::Instant::now();
    let spectrum = stft::stft(samples, config);
    let stft_ms = t0.elapsed().as_secs_f64() * 1_000.0;

    let t0 = std::time::Instant::now();
    let stretched = phase_vocoder::stretch(&spectrum, rate);
    let pv_ms = t0.elapsed().as_secs_f64() * 1_000.0;

    let stretched_length = ((samples.len() as f32) / rate).round() as usize;

    let t0 = std::time::Instant::now();
    let time_stretched = stft::istft(&stretched, config, stretched_length);
    let istft_ms = t0.elapsed().as_secs_f64() * 1_000.0;

    let resample_ratio = sample_rate as f32 / (sample_rate as f32 / rate);
    let t0 = std::time::Instant::now();
    let shifted = resample::resample_mono(&time_stretched, resample_ratio)
        .unwrap_or_else(|| fallback_resample(&time_stretched, resample_ratio));
    let resample_ms = t0.elapsed().as_secs_f64() * 1_000.0;

    let result = stft::fix_length(&shifted, samples.len());

    eprintln!(
        "[quarian-dsp] pitch stages stft={stft_ms:.1}ms pv={pv_ms:.1}ms istft={istft_ms:.1}ms resample={resample_ms:.1}ms",
    );

    result
}

fn fallback_resample(samples: &[f32], ratio: f32) -> Vec<f32> {
    let output_len = ((samples.len() as f32) * ratio).round().max(1.0) as usize;
    (0..output_len)
        .map(|index| {
            let source_pos = index as f32 / ratio;
            interpolate_linear(samples, source_pos)
        })
        .collect()
}

fn interpolate_linear(samples: &[f32], position: f32) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    if position <= 0.0 {
        return samples[0];
    }

    let max_index = samples.len() - 1;
    if position >= max_index as f32 {
        return samples[max_index];
    }

    let left_index = position.floor() as usize;
    let right_index = (left_index + 1).min(max_index);
    let fraction = position - left_index as f32;

    samples[left_index] * (1.0 - fraction) + samples[right_index] * fraction
}

#[cfg(test)]
mod tests {
    use super::pitch_shift;

    #[test]
    fn keeps_original_length() {
        let input = vec![0.0_f32; 2_048];
        let output = pitch_shift(&input, 24_000, 1.0);

        assert_eq!(output.len(), input.len());
    }

    #[test]
    fn zero_shift_is_identity() {
        let input = vec![0.25_f32, -0.5, 0.75, -1.0];
        let output = pitch_shift(&input, 24_000, 0.0);

        assert_eq!(output, input);
    }
}
