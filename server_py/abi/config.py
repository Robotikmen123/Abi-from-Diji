"""Tek yapilandirma kaynagi. Ortam degiskenleri disinda deger okunmaz."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class GeminiConfig:
    api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY"))
    model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-2.5-flash"))
    base_url: str = field(
        default_factory=lambda: _env(
            "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
        )
    )
    # Ilk tercih bulunamazsa sirayla denenir.
    fallback_models: tuple[str, ...] = (
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
        "gemini-1.5-flash",
    )


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str = field(default_factory=lambda: _env("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
    model: str = field(default_factory=lambda: _env("OLLAMA_MODEL", "llama3.2:3b"))


@dataclass(frozen=True)
class OpenAiConfig:
    api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    base_url: str = field(default_factory=lambda: _env("OPENAI_BASE_URL", "https://api.openai.com/v1"))
    model: str = field(default_factory=lambda: _env("OPENAI_MODEL", "gpt-4o-mini"))


@dataclass(frozen=True)
class TtsConfig:
    # auto: model varsa Piper, yoksa tarayici sesi
    provider: str = field(default_factory=lambda: _env("TTS_PROVIDER", "auto"))
    voices_dir: Path = field(default_factory=lambda: Path(_env("PIPER_VOICES_DIR", str(ROOT / "models" / "piper"))))
    voice: str = field(default_factory=lambda: _env("PIPER_VOICE", "tr_TR-fahrettin-medium"))
    # Piper hiz carpani (1.0 = normal). Duygulara gore calisma aninda oynatilir.
    length_scale: float = field(default_factory=lambda: _float("PIPER_LENGTH_SCALE", 1.0))
    noise_scale: float = field(default_factory=lambda: _float("PIPER_NOISE_SCALE", 0.667))
    noise_w: float = field(default_factory=lambda: _float("PIPER_NOISE_W", 0.8))


@dataclass(frozen=True)
class SttConfig:
    provider: str = field(default_factory=lambda: _env("STT_PROVIDER", "auto"))
    model: str = field(default_factory=lambda: _env("WHISPER_MODEL", "small"))
    models_dir: Path = field(
        default_factory=lambda: Path(_env("WHISPER_MODELS_DIR", str(ROOT / "models" / "whisper")))
    )
    # int8 CPU'da belirgin hizli ve kalite farki konusma icin ihmal edilebilir.
    compute_type: str = field(default_factory=lambda: _env("WHISPER_COMPUTE", "int8"))
    device: str = field(default_factory=lambda: _env("WHISPER_DEVICE", "cpu"))


@dataclass(frozen=True)
class Config:
    port: int = field(default_factory=lambda: _int("PORT", 8787))
    character_name: str = field(default_factory=lambda: _env("ABI_NAME", "ABİ"))

    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "auto"))
    temperature: float = field(default_factory=lambda: _float("LLM_TEMPERATURE", 0.9))
    max_tokens: int = field(default_factory=lambda: _int("LLM_MAX_TOKENS", 220))

    gemini: GeminiConfig = field(default_factory=GeminiConfig)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    openai: OpenAiConfig = field(default_factory=OpenAiConfig)
    tts: TtsConfig = field(default_factory=TtsConfig)
    stt: SttConfig = field(default_factory=SttConfig)

    memory_file: Path = field(
        default_factory=lambda: Path(_env("MEMORY_FILE", str(ROOT / "data" / "memory.json")))
    )
    memory_max_facts: int = field(default_factory=lambda: _int("MEMORY_MAX_FACTS", 120))
    prompt_file: Path = field(
        default_factory=lambda: Path(_env("ABI_PROMPT_FILE", str(ROOT / "prompts" / "abi-system.md")))
    )
    web_dist: Path = field(default_factory=lambda: ROOT / "web" / "dist")


config = Config()
