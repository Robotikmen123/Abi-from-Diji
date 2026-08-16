"""Saglayici secimi. Oncelik: Gemini -> local Ollama -> OpenAI uyumlu -> yedek."""

from __future__ import annotations

import logging

from ...config import config
from .base import LlmProvider
from .gemini import GeminiProvider
from .local_persona import LocalPersonaProvider
from .ollama import OllamaProvider
from .openai_compat import OpenAiCompatibleProvider

log = logging.getLogger("abi.llm")

_REGISTRY: dict[str, LlmProvider] = {
    "gemini": GeminiProvider(),
    "ollama": OllamaProvider(),
    "openai": OpenAiCompatibleProvider(),
    "local": LocalPersonaProvider(),
}

_AUTO_ORDER = ("gemini", "ollama", "openai", "local")

_active: LlmProvider | None = None

#: Zeka saglayicisi coktugunde karakterin susmamasi icin son care.
fallback_provider: LlmProvider = _REGISTRY["local"]


async def resolve_llm(force: bool = False) -> LlmProvider:
    global _active
    if _active is not None and not force:
        return _active

    if config.llm_provider != "auto":
        chosen = _REGISTRY.get(config.llm_provider)
        if chosen is not None and await chosen.available():
            _active = chosen
            log.info("LLM: %s", chosen.label)
            return _active
        log.warning("LLM: %s kullanilamiyor, otomatik secime dusuldu", config.llm_provider)

    for name in _AUTO_ORDER:
        provider = _REGISTRY[name]
        if await provider.available():
            _active = provider
            log.info("LLM: %s", provider.label)
            return _active

    _active = _REGISTRY["local"]
    return _active


def active_llm() -> LlmProvider | None:
    return _active
