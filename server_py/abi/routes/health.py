"""Saglik ve yetenek bildirimi. Istemci hangi motorlarin acik oldugunu buradan ogrenir."""

from __future__ import annotations

from fastapi import APIRouter

from ..config import config
from ..providers.llm.registry import resolve_llm
from ..providers.stt.whisper_stt import whisper_stt
from ..providers.tts.registry import resolve_tts, unavailable_reason

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    provider = await resolve_llm()
    tts_provider = resolve_tts()
    stt_ready = whisper_stt.available()
    return {
        "ok": True,
        "character": config.character_name,
        "llm": {"id": provider.id, "label": provider.label, "vision": bool(provider.vision)},
        "tts": {
            # Sunucu sesi yoksa istemci tarayici sesine doner.
            "id": tts_provider.id if tts_provider else "client",
            "label": tts_provider.label if tts_provider else "Tarayıcı sesi (Web Speech)",
            "local": tts_provider is not None,
            "reason": "" if tts_provider else unavailable_reason(),
        },
        "stt": {
            "id": "whisper" if stt_ready else "client",
            "label": whisper_stt.label if stt_ready else "Tarayıcı tanıması (Web Speech)",
            "local": stt_ready,
            "reason": "" if stt_ready else whisper_stt.reason,
        },
    }
