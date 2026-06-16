pub fn decode_i16(input: &[u8], channels: usize) -> Vec<f32> {
    if input.len() < 2 || channels == 0 {
        return Vec::new();
    }

    let sample_count = input.len() / 2;
    let mut samples = Vec::with_capacity(sample_count);

    for chunk in input.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        samples.push(sample as f32 / i16::MAX as f32);
    }

    if channels > 1 {
        downmix_to_mono(&samples, channels)
    } else {
        samples
    }
}

pub fn encode_i16(samples: &[f32]) -> Vec<u8> {
    let mut output = Vec::with_capacity(samples.len() * 2);

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let value = if clamped <= -1.0 {
            i16::MIN
        } else {
            (clamped * i16::MAX as f32).round() as i16
        };
        output.extend_from_slice(&value.to_le_bytes());
    }

    output
}

fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
        .collect()
}
