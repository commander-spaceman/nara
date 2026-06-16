# quarian-dsp

Native Rust DSP engine for Quarian-style voice filtering. Powers Nara's TTS pipeline in-process via Tauri IPC.

> Based on [quarian-voice-filter](https://github.com/commander-spaceman/quarian-voice-filter), adapted specifically for Nara with additional optimizations and PCM-native I/O.
>
> The original library is inspired by the pitch-shifting model and DSP chain of [Librosa](https://librosa.org/).

## Architecture

```
Input (PCM i16 or WAV)
  │
  ├─ decode (pcm::decode_i16 or wav::decode_wav_bytes)
  │
  ├─ DSP pipeline (dsp::process_mono_f32)
  │   ├─ pitch shift (+1 semitone via phase vocoder)
  │   │   ├─ STFT (n_fft=1024, hop=256, Hann window)
  │   │   ├─ phase vocoder stretch (polar precompute, linear interpolation)
  │   │   ├─ ISTFT (overlap-add with window normalization)
  │   │   └─ resample (sinc filter, SINC_LEN=32, linear interpolation, f32-native)
  │   ├─ HPF (200 Hz, Butterworth 4th order)
  │   ├─ LPF (7000 Hz, Butterworth 4th order)
  │   ├─ notch (1000 Hz, Q=30)
  │   ├─ drive (tanh saturation)
  │   ├─ dry/wet mix
  │   └─ peak normalize (0.99 ceiling)
  │
  └─ encode (pcm::encode_i16 or wav::encode_wav_bytes)
  │
Output (PCM i16 or WAV)
```

## Modules

| Module          | Purpose                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `dsp`           | Pipeline orchestrator: pitch -> filters -> drive -> mix -> normalize       |
| `pitch`         | Pitch shift entry point, chains STFT -> phase vocoder -> ISTFT -> resample |
| `stft`          | Short-time Fourier transform / inverse with Hann window and overlap-add    |
| `phase_vocoder` | Time-scale modification via phase locking and polar interpolation          |
| `resample`      | Sinc-based resampling (rubato `SincFixedIn`)                               |
| `filters`       | IIR biquad filters: HPF, LPF, notch (Butterworth)                          |
| `wav`           | WAV decode/encode via hound, header normalization for OpenAI               |
| `pcm`           | Raw PCM i16 decode/encode, no container overhead                           |
| `params`        | `QuarianVoiceFilterParams` — 7 adjustable parameters with serde            |
| `error`         | Error types for WAV/PCM decode/encode failures                             |

## Public API

```rust
// Process WAV bytes (RIFF header required)
process_wav_bytes(input: &[u8], params: &QuarianVoiceFilterParams) -> Result<Vec<u8>>

// Process WAV bytes, force stereo output
process_wav_bytes_stereo(input: &[u8], params: &QuarianVoiceFilterParams) -> Result<Vec<u8>>

// Process raw PCM i16 bytes (no header)
process_pcm_bytes(input: &[u8], sample_rate: u32, channels: u16, params: &QuarianVoiceFilterParams) -> Result<Vec<u8>>

// Process f32 samples directly (no I/O)
process_mono_f32(samples: &[f32], sample_rate: u32, params: &QuarianVoiceFilterParams) -> Result<Vec<f32>>
```

## Parameters

```rust
QuarianVoiceFilterParams {
    pitch_semitones: 1.0,  // +1 semitone (quarian voice)
    dry_gain: 0.25,        // original voice level
    wet_gain: 0.15,        // processed voice level
    hpf: 200.0,            // high-pass cutoff (Hz)
    lpf: 7000.0,           // low-pass cutoff (Hz)
    notch: 1000.0,         // notch center (Hz)
    drive: 0.05,           // saturation amount
}
```

## Optimizations

> All optimizations preserve identical audible output. No parameter changes required.

### Phase vocoder (pitch shift)

| Opt                    | What                                                                 | Impact                                            |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `n_fft` 2048 -> 1024   | Halved FFT window size                                               | ~55% less FFT ops per frame                       |
| `SINC_LEN` 128 -> 32   | Resample filter length + linear interpolation                        | ~5x faster resample                               |
| Buffer reuse           | Single `Vec<Complex>` per STFT/ISTFT call instead of per-frame alloc | ~1200 allocs eliminated per call                  |
| Polar precompute       | Magnitude/phase cached per frame instead of recomputed per bin       | Eliminated redundant `sqrt`/`atan2` in inner loop |
| `LazyLock<StftConfig>` | Hann window computed once statically                                 | ~4KB allocation saved per call                    |
| `f32` resample         | Native f32 instead of f32->f64->f32 roundtrip                        | Halved memory, no conversion pass                 |
| `center_pad` removal   | Index math instead of allocating padded array                        | ~1.2MB allocation saved per call                  |

### Filters

| Opt                   | What                                                       | Impact                                                 |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| In-place coefficients | Both biquad stages computed once, single pass over samples | Eliminated redundant `Coefficients::from_params` calls |

### I/O

| Opt                  | What                                                            | Impact                       |
| -------------------- | --------------------------------------------------------------- | ---------------------------- |
| PCM native path      | `pcm::decode_i16` / `pcm::encode_i16` bypass hound WAV overhead | ~40ms saved on decode+encode |
| Header normalization | Early return when WAV header is already valid                   | No copy for non-OpenAI WAVs  |

## Nara Integration

```
OpenAI TTS (SSE+PCM streaming)
  -> accumulate PCM chunks in browser
  -> invoke("quarian_fx", { wav: pcmBytes, params })
  -> quarian-dsp processes PCM -> returns PCM
  -> AudioContext.createBuffer() for direct playback
```

The frontend avoids WAV entirely in the fast path. PCM flows from OpenAI -> Rust -> speakers with minimal overhead.

## Building

```powershell
# From nara/shell
cargo build -p quarian-dsp

# Run tests
cargo test -p quarian-dsp
```

## Dependencies

Pure Rust, no FFI, no system libraries:

- `rustfft` — FFT for STFT/ISTFT
- `rubato` — sinc resampling
- `biquad` — IIR filters
- `hound` — WAV I/O (fallback path)
- `serde` — parameter serialization for Tauri IPC
