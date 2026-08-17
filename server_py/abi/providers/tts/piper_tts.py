"""
Yerel Turkce erkek ses (Piper).

Neden sunucuda: tarayicinin Web Speech sesi isletim sistemine bagli — bazi
makinelerde hic Turkce ses yok, olanlarda da kadin sesi cikabiliyor ve ton
kontrolu yok. Piper cevrimdisi calisir, her makinede ayni sesi verir ve
duyguya gore hiz/ton oynatmaya izin verir.

Ses modeli yoksa saglayici "kullanilamaz" der; istemci tarayici sesine doner.
Karakter hicbir durumda susmaz.
"""

from __future__ import annotations

import io
import logging
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ...config import config

log = logging.getLogger("abi.tts")


@dataclass(frozen=True)
class VoiceInfo:
    id: str
    label: str
    sample_rate: int


class PiperTts:
    id = "piper"
    label = "Piper (yerel Türkçe)"
    client_side = False

    def __init__(self) -> None:
        self._voice: Any | None = None
        self._voice_id: str | None = None
        self._checked = False
        self._reason = ""

    # ------------------------------------------------------------ kesif

    def voices_dir(self) -> Path:
        return config.tts.voices_dir

    def available_voices(self) -> list[VoiceInfo]:
        """Diskte duran .onnx modelleri."""
        directory = self.voices_dir()
        if not directory.is_dir():
            return []
        found: list[VoiceInfo] = []
        for model in sorted(directory.glob("*.onnx")):
            if not model.with_suffix(".onnx.json").exists():
                continue
            found.append(VoiceInfo(model.stem, model.stem.replace("_", " "), 22050))
        return found

    def _model_path(self, voice_id: str | None = None) -> Path | None:
        directory = self.voices_dir()
        wanted = voice_id or config.tts.piper_voice
        candidate = directory / f"{wanted}.onnx"
        if candidate.exists():
            return candidate
        # Istenen ses yoksa elde ne varsa onu kullan.
        voices = self.available_voices()
        if voices:
            return directory / f"{voices[0].id}.onnx"
        return None

    def available(self) -> bool:
        if config.tts.provider not in ("auto", "piper"):
            return False
        if not self._checked:
            self._checked = True
            if self._model_path() is None:
                self._reason = (
                    f"Piper ses modeli yok ({self.voices_dir()}). "
                    "`npm run setup:offline && npm run voices` ile eklenebilir."
                )
                log.warning(self._reason)
        return self._model_path() is not None

    @property
    def reason(self) -> str:
        return self._reason

    # ------------------------------------------------------------ sentez

    def _load(self, voice_id: str | None) -> Any:
        model = self._model_path(voice_id)
        if model is None:
            raise RuntimeError("piper ses modeli bulunamadi")
        if self._voice is not None and self._voice_id == model.stem:
            return self._voice

        from piper import PiperVoice  # gec import: paket yoksa sunucu yine kalksin

        log.info("Piper sesi yukleniyor: %s", model.stem)
        self._voice = PiperVoice.load(str(model), config_path=str(model.with_suffix(".onnx.json")))
        self._voice_id = model.stem
        return self._voice

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        rate: float = 1.0,
        pitch: float = 1.0,
    ) -> tuple[bytes, list[dict[str, float | str]]]:
        """
        Metni WAV baytlarina cevirir ve fonem zamanlamalarini dondurur.

        Zamanlama, agiz hareketinin sesle gercekten senkron olmasini sagliyor:
        harften tahmin etmek yerine modelin kendi ureteci ne kadar ornek
        harcadigini bildiriyor.
        """
        voice = self._load(voice_id)

        from piper import SynthesisConfig

        # Piper'da length_scale buyudukce konusma yavaslar; hiz carpani tersidir.
        length_scale = config.tts.length_scale / max(0.35, rate)
        synthesis = SynthesisConfig(
            length_scale=length_scale,
            noise_scale=config.tts.noise_scale,
            noise_w_scale=config.tts.noise_w,
            # Ton kontrolu modelde yok; istemci Web Audio ile ince ayar yapar.
        )

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            alignments = voice.synthesize_wav(
                text, wav, syn_config=synthesis, include_alignments=True
            )
            sample_rate = wav.getframerate() or 22050

        timeline: list[dict[str, float | str]] = []
        elapsed = 0.0
        for item in alignments or []:
            seconds = item.num_samples / sample_rate
            timeline.append({"p": item.phoneme, "t": round(elapsed, 4), "d": round(seconds, 4)})
            elapsed += seconds

        del pitch  # model seviyesinde desteklenmiyor; imzada bilerek duruyor
        return buffer.getvalue(), timeline


piper_tts = PiperTts()
