"""Yerel ses: sentez (Piper) ve tanima (Whisper)."""

from __future__ import annotations

import asyncio
import base64
import logging

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..providers.stt.whisper_stt import whisper_stt
from ..providers.tts.piper_tts import piper_tts

log = logging.getLogger("abi.voice")
router = APIRouter()


class TtsBody(BaseModel):
    text: str
    voice: str | None = None
    # Duyguya gore konusma hizi; 1.0 normal.
    rate: float = 1.0
    pitch: float = 1.0


@router.post("/tts")
async def tts(body: TtsBody) -> JSONResponse:
    text = body.text.strip()
    if not text:
        return JSONResponse({"error": "text bos olamaz"}, status_code=400)
    if not piper_tts.available():
        return JSONResponse({"error": "yerel ses yok", "reason": piper_tts.reason}, status_code=503)

    try:
        # Sentez CPU'yu bloklar; olay dongusu takilmasin diye is parcaciginda.
        audio, phonemes = await asyncio.to_thread(
            piper_tts.synthesize, text, voice_id=body.voice, rate=body.rate, pitch=body.pitch
        )
    except Exception as err:
        log.exception("piper sentezi basarisiz: %s", err)
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
    return JSONResponse(
        {
            "available": piper_tts.available(),
            "reason": piper_tts.reason,
            "voices": [
                {"id": v.id, "label": v.label, "sampleRate": v.sample_rate}
                for v in piper_tts.available_voices()
            ],
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
