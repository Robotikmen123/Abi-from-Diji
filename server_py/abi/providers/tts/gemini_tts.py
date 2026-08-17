"""
Gemini ile seslendirme.

Zekayla ayni saglayici: tek anahtar, tek fatura, kurulum yok. Onemlisi, ses
dogal konusma tonunda ve **stil yonergesiyle** yonlendirilebiliyor — karakterin
duygu durumu dogrudan sese geciyor.

Ton: kalin, tok, yetiskin erkek. Bu hem ses secimiyle (varsayilan Charon) hem de
her istege eklenen stil cumlesiyle saglaniyor.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import wave
from collections import OrderedDict
from typing import Any

import httpx

from ...config import config

log = logging.getLogger("abi.tts.gemini")

#: Gemini'nin hazir sesleri. Karakter icin uygun olanlar; hepsi tek tek dinlendi
#: diye degil, Google'in tanimladigi karakter etiketlerine gore secildi.
VOICES: list[dict[str, str]] = [
    {"id": "Charon", "label": "Charon — kalın, tok (varsayılan)"},
    {"id": "Algenib", "label": "Algenib — çakıllı, sert"},
    {"id": "Gacrux", "label": "Gacrux — olgun"},
    {"id": "Alnilam", "label": "Alnilam — kararlı"},
    {"id": "Orus", "label": "Orus — sağlam"},
    {"id": "Rasalgethi", "label": "Rasalgethi — bilgili"},
    {"id": "Iapetus", "label": "Iapetus — net"},
    {"id": "Umbriel", "label": "Umbriel — sakin"},
    {"id": "Fenrir", "label": "Fenrir — hareketli"},
    {"id": "Puck", "label": "Puck — canlı"},
]

#: Her istege eklenen temel ton. "Kalin" istegi burada karsilaniyor.
BASE_STYLE = "Kalın, derin ve tok bir yetişkin erkek sesiyle, doğal konuşma temposunda"

#: Duygu -> soyleyis. Kisa tutuldu; uzun yonerge modeli metni okumaya itiyor.
EMOTION_STYLE: dict[str, str] = {
    "IDLE": "sakin ve kendinden emin",
    "AMUSED": "hafif alaycı, gülümseyerek",
    "ANNOYED": "sıkılmış ve sert",
    "SERIOUS": "ciddi ve ağır",
    "SUSPICIOUS": "şüpheli, alçak sesle",
    "EXCITED": "enerjik, biraz hızlı",
    "SURPRISED": "şaşırmış",
    "MISSION": "kararlı ve net",
    "ALERT": "keskin, uyarır gibi",
}

_PCM_RATE = re.compile(r"rate=(\d+)")


class GeminiTts:
    id = "gemini"
    label = "Gemini (kalın erkek ses)"
    client_side = False

    def __init__(self) -> None:
        self._reason = ""
        # Ayni cumle tekrar seslendirilmesin: acilis replikleri ve "bir saniye"
        # gibi dolgular sik tekrar ediyor.
        self._cache: OrderedDict[tuple[str, str, str], bytes] = OrderedDict()
        self._cache_limit = 48

    @property
    def reason(self) -> str:
        return self._reason

    def available(self) -> bool:
        if config.tts.provider not in ("auto", "gemini"):
            return False
        if not config.gemini.api_key:
            self._reason = "GEMINI_API_KEY yok; ses için de aynı anahtar kullanılıyor."
            return False
        return True

    def available_voices(self) -> list[dict[str, str]]:
        return VOICES

    def _style(self, emotion: str, rate: float) -> str:
        tone = EMOTION_STYLE.get(emotion.upper(), EMOTION_STYLE["IDLE"])
        pace = ""
        if rate >= 1.12:
            pace = ", biraz hızlı"
        elif rate <= 0.9:
            pace = ", biraz yavaş"
        return f"{BASE_STYLE} {tone}{pace} söyle:"

    async def synthesize(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        rate: float = 1.0,
        emotion: str = "IDLE",
    ) -> tuple[bytes, list[dict[str, float | str]]]:
        """
        Metni WAV baytlarina cevirir.

        Fonem zamanlamasi dondurmez — Gemini boyle bir cikis vermiyor. Istemci
        agiz hareketini metinden uretilen viseme dizisini gercek ses suresine
        yayarak ve anlik genlikle kapatarak suruyor.
        """
        voice = voice_id or config.tts.voice
        style = self._style(emotion, rate)
        key = (text, voice, style)

        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            return cached, []

        url = (
            f"{config.gemini.base_url}/models/"
            f"{config.tts.gemini_model}:generateContent"
        )
        body: dict[str, Any] = {
            "contents": [{"parts": [{"text": f"{style} {text}"}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
                },
            },
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            response = await client.post(
                url,
                json=body,
                headers={
                    "content-type": "application/json",
                    "x-goog-api-key": config.gemini.api_key,
                },
            )

        if response.status_code >= 400:
            detail = response.text[:300]
            self._reason = f"Gemini sesi cevap vermedi ({response.status_code})."
            raise RuntimeError(f"gemini tts {response.status_code}: {detail}")

        payload = response.json()
        candidates = payload.get("candidates") or []
        if not candidates:
            raise RuntimeError("gemini tts: bos cevap")

        inline: dict[str, Any] | None = None
        for part in (candidates[0].get("content") or {}).get("parts") or []:
            if "inlineData" in part:
                inline = part["inlineData"]
                break
        if inline is None:
            raise RuntimeError("gemini tts: seste veri yok")

        pcm = base64.b64decode(inline.get("data", ""))
        wav = _pcm_to_wav(pcm, _sample_rate(inline.get("mimeType", "")))

        self._cache[key] = wav
        if len(self._cache) > self._cache_limit:
            self._cache.popitem(last=False)
        return wav, []


def _sample_rate(mime: str) -> int:
    match = _PCM_RATE.search(mime or "")
    return int(match.group(1)) if match else 24000


def _pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Gemini ham 16-bit PCM donuyor; tarayici cozebilsin diye WAV basligi eklenir."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buffer.getvalue()


gemini_tts = GeminiTts()
