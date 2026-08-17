"""Yerel ses: sentez (Piper) ve tanima (Whisper)."""

from __future__ import annotations

import asyncio
import base64
import logging

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..providers.stt.whisper_stt import whisper_stt
from ..providers.tts.gemini_tts import gemini_tts
from ..providers.tts.piper_tts import piper_tts
from ..providers.tts.registry import resolve_tts, unavailable_reason

log = logging.getLogger("abi.voice")
router = APIRouter()


class TtsBody(BaseModel):
    text: str
    voice: str | None = None
    # Duyguya gore konusma hizi; 1.0 normal.
    rate: float = 1.0
    pitch: float = 1.0
    # Soyleyis tonunu belirler (Gemini stil yonergesi).
    emotion: str = "IDLE"


@router.post("/tts")
async def tts(body: TtsBody) -> JSONResponse:
    text = body.text.strip()
    if not text:
        return JSONResponse({"error": "text bos olamaz"}, status_code=400)
    provider = resolve_tts()
    if provider is None:
        return JSONResponse(
            {"error": "sunucu sesi yok", "reason": unavailable_reason()}, status_code=503
        )

    try:
        if provider is gemini_tts:
            audio, phonemes = await provider.synthesize(
                text, voice_id=body.voice, rate=body.rate, emotion=body.emotion
            )
        else:
            # Piper CPU'yu bloklar; olay dongusu takilmasin diye is parcaciginda.
            audio, phonemes = await asyncio.to_thread(
                provider.synthesize, text, voice_id=body.voice, rate=body.rate, pitch=body.pitch
            )
    except Exception as err:
        log.exception("%s sentezi basarisiz: %s", provider.id, err)
        return JSONResponse({"error": "ses uretilemedi"}, status_code=500)

    # Ses ve fonem zamanlamasi birlikte doner: agiz hareketi tahmine degil
    # modelin kendi zamanlamasina baglanir.
    return JSONResponse(
        {
            "mime": "audio/wav",
            "audio": base64.b64encode(audio).decode("ascii"),
            "phonemes": phonemes,
        }
    )


@router.get("/voices")
async def voices() -> JSONResponse:
    provider = resolve_tts()
    voices: list[dict[str, str]] = []
    if provider is gemini_tts:
        voices = gemini_tts.available_voices()
    elif provider is piper_tts:
        voices = [{"id": v.id, "label": v.label} for v in piper_tts.available_voices()]

    return JSONResponse(
        {
            "available": provider is not None,
            "engine": provider.id if provider else "client",
            "reason": "" if provider else unavailable_reason(),
            "voices": voices,
        }
    )


@router.post("/stt")
async def stt(audio: UploadFile = File(...), mime: str = Form("audio/webm")) -> JSONResponse:
    if not whisper_stt.available():
        return JSONResponse({"error": "yerel tanima yok", "reason": whisper_stt.reason}, status_code=503)

    payload = await audio.read()
    if len(payload) < 1200:
        # Cok kisa kayit: tanima denemeye degmez.
        return JSONResponse({"text": ""})

    suffix = ".webm" if "webm" in mime else ".ogg" if "ogg" in mime else ".wav"
    try:
        text = await asyncio.to_thread(whisper_stt.transcribe, payload, suffix)
    except Exception as err:
        log.exception("whisper tanimasi basarisiz: %s", err)
        return JSONResponse({"error": "tanima yapilamadi"}, status_code=500)

    return JSONResponse({"text": text})
