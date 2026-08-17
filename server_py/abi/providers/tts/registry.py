"""Ses saglayici secimi: Gemini -> Piper -> tarayici."""

from __future__ import annotations

from typing import Any

from ...config import config
from .gemini_tts import gemini_tts
from .piper_tts import piper_tts


def resolve_tts() -> Any | None:
    """Kullanilabilir ilk saglayici; hicbiri yoksa None (istemci tarayici sesine doner)."""
    preference = config.tts.provider
    if preference == "client":
        return None
    if preference == "gemini":
        return gemini_tts if gemini_tts.available() else None
    if preference == "piper":
        return piper_tts if piper_tts.available() else None

    # auto: zekayla ayni ses tercih edilir, yoksa yerel model, o da yoksa tarayici.
    if gemini_tts.available():
        return gemini_tts
    if piper_tts.available():
        return piper_tts
    return None


def unavailable_reason() -> str:
    return gemini_tts.reason or piper_tts.reason or "yerel ses kapali"
