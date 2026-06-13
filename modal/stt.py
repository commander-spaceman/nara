import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

import modal
from modal import Image, App, Secret, Volume, web_endpoint

app = App("nara-stt")

volume = Volume.from_name("whisper-model-cache", create_if_missing=True)

image = (
    Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi[standard]",
        "faster-whisper",
        "python-multipart",
    )
    .env({"HF_HUB_CACHE": "/models"})
)

WHISPER_MODEL = os.environ.get("WHISPER_MODEL_NAME", "large-v3")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")

_whisper = None


def get_model():
    from faster_whisper import WhisperModel

    global _whisper
    if _whisper is None:
        _whisper = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
            download_root="/models",
        )
    return _whisper


@asynccontextmanager
async def lifespan(api: FastAPI):
    get_model()
    yield


web = FastAPI(lifespan=lifespan)


def check_auth(request: Request):
    token = os.environ.get("WHISPER_AUTH_TOKEN", "")
    if not token:
        return
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@web.get("/health")
async def health(request: Request):
    check_auth(request)
    return JSONResponse(
        {
            "status": "ok",
            "model": WHISPER_MODEL,
            "device": WHISPER_DEVICE,
            "compute_type": WHISPER_COMPUTE,
            "auth_enabled": bool(os.environ.get("WHISPER_AUTH_TOKEN", "")),
        }
    )


@web.post("/v1/audio/transcriptions")
async def transcribe(request: Request):
    check_auth(request)

    form = await request.form()
    audio_field = form.get("file")
    if audio_field is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    audio_bytes = await audio_field.read()

    suffix = ".webm"
    content_type = audio_field.content_type or ""
    if "webm" in content_type:
        suffix = ".webm"
    elif "wav" in content_type or "wave" in content_type:
        suffix = ".wav"
    elif "ogg" in content_type or "opus" in content_type:
        suffix = ".ogg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model = get_model()
        language = form.get("language")
        prompt = form.get("prompt")

        transcribe_kwargs = {}
        if language:
            transcribe_kwargs["language"] = str(language)
        if prompt:
            transcribe_kwargs["initial_prompt"] = str(prompt)

        segments, info = model.transcribe(tmp_path, **transcribe_kwargs)

        text = " ".join(seg.text.strip() for seg in segments)

        return JSONResponse(
            {
                "text": text,
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
            }
        )
    finally:
        os.unlink(tmp_path)


@app.function(
    gpu="T4",
    cpu=4,
    memory=16384,
    timeout=900,
    allow_concurrent_inputs=1,
    volumes={"/models": volume},
    secrets=[Secret.from_name("whisper-api-auth")]
    if os.environ.get("WHISPER_AUTH_TOKEN") is None
    else [],
    image=image,
)
@web_endpoint(method="POST")
async def transcribe_webhook(request: Request):
    return await transcribe(request)


@app.function(
    gpu="T4",
    cpu=4,
    memory=16384,
    timeout=900,
    allow_concurrent_inputs=1,
    volumes={"/models": volume},
    secrets=[Secret.from_name("whisper-api-auth")]
    if os.environ.get("WHISPER_AUTH_TOKEN") is None
    else [],
    image=image,
)
@web_endpoint(method="GET")
async def health_webhook(request: Request):
    return await health(request)
