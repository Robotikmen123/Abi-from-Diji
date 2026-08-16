"""Saglik ve yetenek bildirimi. Istemci hangi motorlarin acik oldugunu buradan ogrenir."""

from __future__ import annotations

from fastapi import APIRouter

from ..config import config
from ..providers.llm.registry import resolve_llm
from ..providers.stt.whisper_stt import whisper_stt
from ..providers.tts.piper_tts import piper_tts

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    provider = await resolve_llm()
    tts_ready = piper_tts.available()
    stt_ready = whisper_stt.available()
    return {
        "ok": True,
        "character": config.character_name,
        "llm": {"id": provider.id, "label": provider.label, "vision": bool(provider.vision)},
        "tts": {
            # Yerel ses yoksa istemci tarayici sesine doner.
            "id": "piper" if tts_ready else "client",
            "label": piper_tts.label if tts_ready else "Tarayıcı sesi (Web Speech)",
            "local": tts_ready,
            "reason": "" if tts_ready else piper_tts.reason,
        },
        "stt": {
            "id": "whisper" if stt_ready else "client",
            "label": whisper_stt.label if stt_ready else "Tarayıcı tanıması (Web Speech)",
            "local": stt_ready,
            "reason": "" if stt_ready else whisper_stt.reason,
        },
    }
