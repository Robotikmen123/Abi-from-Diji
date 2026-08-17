"""
Yerel Turkce ses tanima (faster-whisper).

Tarayicinin Web Speech tanimasi Chrome disinda yok ve internet istiyor.
Whisper cevrimdisi calisir, Turkceyi iyi tanir ve gurultuye daha dayaniklidir.
Model yoksa saglayici "kullanilamaz" der; istemci tarayici tanimasina doner.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from ...config import config

log = logging.getLogger("abi.stt")


class WhisperStt:
    id = "whisper"
    label = "faster-whisper (yerel Türkçe)"

    def __init__(self) -> None:
        self._model: Any | None = None
        self._reason = ""

    @property
    def reason(self) -> str:
        return self._reason

    def _model_dir(self) -> Path:
        return config.stt.models_dir / config.stt.model

    def available(self) -> bool:
        if config.stt.provider not in ("auto", "whisper"):
            return False
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            self._reason = "Yerel tanima kurulu degil (npm run setup:offline)."
            return False
        if not self._model_dir().is_dir():
            self._reason = (
                f"Whisper modeli yok ({self._model_dir()}). `npm run voices` ile indirilebilir."
            )
            return False
        return True

    def _load(self) -> Any:
        if self._model is not None:
            return self._model
        from faster_whisper import WhisperModel

        log.info("Whisper modeli yukleniyor: %s", config.stt.model)
        # local_files_only: model diskte yoksa sessizce internete cikmasin.
        self._model = WhisperModel(
            str(self._model_dir()),
            device=config.stt.device,
            compute_type=config.stt.compute_type,
            local_files_only=True,
        )
        return self._model

    def transcribe(self, audio: bytes, suffix: str = ".webm") -> str:
        """Ses baytlarini metne cevirir. Bos donus, tanima yok demektir."""
        model = self._load()

        # faster-whisper dosya yolu istiyor; kayit kisa oldugu icin gecici dosya yeterli.
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as handle:
            handle.write(audio)
            handle.flush()
            segments, _info = model.transcribe(
                handle.name,
                language="tr",
                beam_size=1,  # konusma icin hiz kaliteden onemli
                vad_filter=True,
                condition_on_previous_text=False,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()


whisper_stt = WhisperStt()
