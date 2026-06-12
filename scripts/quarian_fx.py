"""Quarian voice FX sidecar — stdin/stdout binary pipe protocol.

Reads WAV bytes from stdin, writes processed WAV to stdout.
First line of stdout is JSON status, then raw WAV bytes follow.
"""

import sys
import json
import traceback
import numpy as np
from scipy import signal
import soundfile as sf
import librosa
import io

DEFAULTS = {
    "pitch_semitones": 2,
    "dry_gain": 0.80,
    "wet_gain": 0.35,
    "hpf": 200,
    "lpf": 4000,
    "notch": 900,
    "drive": 0.10,
}


def apply(wav_bytes: bytes, params: dict) -> bytes:
    p = {**DEFAULTS, **params}

    y, sr = sf.read(io.BytesIO(wav_bytes))
    if y.ndim > 1:
        y = y.mean(axis=1)

    y_wet = y.copy()
    if p["pitch_semitones"] != 0:
        y_wet = librosa.effects.pitch_shift(y=y, sr=sr, n_steps=p["pitch_semitones"])

    if p["hpf"] > 0:
        sos_hp = signal.butter(4, p["hpf"], "hp", fs=sr, output="sos")
        y_wet = signal.sosfilt(sos_hp, y_wet)

    if p["lpf"] < sr / 2:
        sos_lp = signal.butter(4, p["lpf"], "lp", fs=sr, output="sos")
        y_wet = signal.sosfilt(sos_lp, y_wet)

    if p["notch"] > 0:
        b, a = signal.iirnotch(p["notch"], 30, fs=sr)
        y_wet = signal.lfilter(b, a, y_wet)

    if p["drive"] > 0:
        y_wet = np.tanh(y_wet * (1 + p["drive"] * 4))

    output = y * p["dry_gain"] + y_wet * p["wet_gain"]

    peak = float(np.max(np.abs(output)))
    if peak > 0.99:
        output = output / peak * 0.99

    buf = io.BytesIO()
    sf.write(buf, output.astype(np.float32), sr, format="WAV")
    return buf.getvalue()


if __name__ == "__main__":
    sys.stderr = open(sys.stderr.fileno(), "w", buffering=1)

    print(json.dumps({"status": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
            params = job.get("params", {})
            wav_bytes = sys.stdin.buffer.read(job["size"])
            result = apply(wav_bytes, params)
            meta = json.dumps({"status": "ok", "size": len(result)})
            sys.stdout.buffer.write(meta.encode() + b"\n" + result)
            sys.stdout.buffer.flush()
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "status": "error",
                        "message": str(exc),
                        "traceback": traceback.format_exc(),
                    }
                ),
                flush=True,
            )
