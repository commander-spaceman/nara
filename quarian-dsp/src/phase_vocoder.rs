use rustfft::num_complex::Complex;

use crate::stft::Spectrogram;

pub fn stretch(spectrogram: &Spectrogram, rate: f32) -> Spectrogram {
    if spectrogram.frames.is_empty() || !rate.is_finite() || rate <= 0.0 {
        return spectrogram.clone();
    }

    let frame_len = spectrogram.frames.len();
    let bin_count = spectrogram.frames[0].len();
    let time_steps = time_steps(frame_len, rate);
    let phi_advance = phase_advance(bin_count, spectrogram.n_fft, spectrogram.hop_length);
    let mut phase_acc = phases(&spectrogram.frames[0]);
    let polar = precompute_polar(&spectrogram.frames, bin_count);
    let mut stretched = Vec::with_capacity(time_steps.len());
    let mut output_frame = vec![Complex::new(0.0_f32, 0.0_f32); bin_count];

    for step in time_steps {
        let left = step.floor() as usize;
        let right = left + 1;
        let alpha = step.fract();
        let left_mag = &polar[left].magnitude;
        let right_mag = &polar[right].magnitude;
        let left_phase = &polar[left].phase;
        let right_phase = &polar[right].phase;

        for bin in 0..bin_count {
            let mag = left_mag[bin] * (1.0 - alpha) + right_mag[bin] * alpha;
            output_frame[bin] = Complex::from_polar(mag, phase_acc[bin]);

            let delta = wrap_phase(right_phase[bin] - left_phase[bin] - phi_advance[bin]);
            phase_acc[bin] += phi_advance[bin] + delta;
        }

        stretched.push(output_frame.clone());
    }

    Spectrogram {
        n_fft: spectrogram.n_fft,
        hop_length: spectrogram.hop_length,
        frames: stretched,
    }
}

struct FramePolar {
    magnitude: Vec<f32>,
    phase: Vec<f32>,
}

fn precompute_polar(frames: &[Vec<Complex<f32>>], bin_count: usize) -> Vec<FramePolar> {
    let zero = vec![0.0_f32; bin_count];
    let mut polar: Vec<FramePolar> = frames
        .iter()
        .map(|frame| {
            let mut mag = Vec::with_capacity(bin_count);
            let mut phs = Vec::with_capacity(bin_count);
            for bin in 0..bin_count {
                mag.push(magnitude(frame[bin]));
                phs.push(phase(frame[bin]));
            }
            FramePolar {
                magnitude: mag,
                phase: phs,
            }
        })
        .collect();
    polar.push(FramePolar {
        magnitude: zero.clone(),
        phase: zero.clone(),
    });
    polar.push(FramePolar {
        magnitude: zero,
        phase: vec![0.0_f32; bin_count],
    });
    polar
}

fn time_steps(frame_len: usize, rate: f32) -> Vec<f32> {
    let mut steps = Vec::new();
    let mut position = 0.0_f32;
    while position < frame_len as f32 {
        steps.push(position);
        position += rate;
    }
    steps
}

fn phase_advance(bin_count: usize, n_fft: usize, hop_length: usize) -> Vec<f32> {
    (0..bin_count)
        .map(|bin| hop_length as f32 * 2.0 * std::f32::consts::PI * bin as f32 / n_fft as f32)
        .collect()
}

fn phases(frame: &[Complex<f32>]) -> Vec<f32> {
    frame.iter().map(|value| phase(*value)).collect()
}

fn phase(value: Complex<f32>) -> f32 {
    value.arg()
}

fn magnitude(value: Complex<f32>) -> f32 {
    value.norm()
}

fn wrap_phase(value: f32) -> f32 {
    value - 2.0 * std::f32::consts::PI * (value / (2.0 * std::f32::consts::PI)).round()
}

#[cfg(test)]
mod tests {
    use rustfft::num_complex::Complex;

    use super::stretch;
    use crate::stft::Spectrogram;

    #[test]
    fn stretch_changes_frame_count() {
        let frame = vec![Complex::new(1.0_f32, 0.0_f32); 16];
        let spectrogram = Spectrogram {
            n_fft: 32,
            hop_length: 8,
            frames: vec![frame.clone(), frame.clone(), frame.clone(), frame],
        };

        let stretched = stretch(&spectrogram, 0.5);
        assert!(stretched.frames.len() > spectrogram.frames.len());
    }

    #[test]
    fn first_output_frame_keeps_initial_phase() {
        let spectrogram = Spectrogram {
            n_fft: 32,
            hop_length: 8,
            frames: vec![
                vec![Complex::from_polar(1.0_f32, 0.25_f32); 4],
                vec![Complex::from_polar(2.0_f32, 1.0_f32); 4],
            ],
        };

        let stretched = stretch(&spectrogram, 0.5);

        for bin in 0..4 {
            assert!((stretched.frames[0][bin].arg() - 0.25).abs() < 1e-6);
        }
    }
}
