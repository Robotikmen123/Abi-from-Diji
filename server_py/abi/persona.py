"""Karakter promptunu kurar. Prompt dosyasi calisma aninda okunur."""

from __future__ import annotations

import logging
from typing import Literal

from .config import config
from .providers.memory.file_memory import memory

log = logging.getLogger("abi.persona")

PersonaIntensity = Literal["calm", "normal", "abi"]

_INTENSITY_NOTES: dict[str, str] = {
    "calm": (
        "Bu oturumda tonun daha sakin. Sertligini azalt, alayi minimumda tut. "
        "Karakterin kaybolmasin."
    ),
    "normal": "Bu oturumda normal tonundasin.",
    "abi": (
        "Bu oturumda tam abi modundasin. Daha otoriter, daha lafini sakinmayan, "
        "daha alayci. Yine de kisa konus."
    ),
}

_FALLBACK = """Sen ABİ'sin. Bir chatbot gibi degil, kullanicinin yaninda bulunan bagimsiz bir
dijital karakter gibi davranirsin. Konusmalarin kisa, dogal ve sesli iletisime uygundur.
Kendine ait fikirlerin vardir. Kullaniciya surekli katilmazsin. Gerektiginde karsi cikarsin,
saka yaparsin, sasirirsin, kizarsin veya ciddilesirsin. Cevabinin basina [IDLE] gibi bir
duygu etiketi koyarsin. En fazla uc kisa cumle kurarsin."""

_cache: tuple[str, float] | None = None


def _base_prompt() -> str:
    global _cache
    try:
        mtime = config.prompt_file.stat().st_mtime
        if _cache is not None and _cache[1] == mtime:
            return _cache[0]
        text = config.prompt_file.read_text("utf-8")
        _cache = (text, mtime)
        return text
    except OSError:
        log.warning("persona dosyasi okunamadi (%s), gomulu prompt kullaniliyor", config.prompt_file)
        return _FALLBACK


async def build_system_prompt(intensity: str = "normal", user_name: str | None = None) -> str:
    parts = [_base_prompt()]
    parts.append(f"\n---\n\n## Oturum notlari\n\nAdın: {config.character_name}.")
    parts.append(_INTENSITY_NOTES.get(intensity, _INTENSITY_NOTES["normal"]))

    if user_name:
        parts.append(f"Karsindaki kisinin adi: {user_name}.")

    facts = await memory.list()
    if facts:
        top = sorted(facts, key=lambda f: (f.hits, f.created_at), reverse=True)[:24]
        lines = "\n".join(f"- {fact.text}" for fact in top)
        parts.append(
            f"\n### Hatirladiklarin\n{lines}\n\nBunlari dogal sekilde kullan, liste gibi okuma."
        )

    parts.append(
        "\nUnutma: cevabin sesli okunacak. En fazla uc kisa cumle. Basta duygu etiketi olsun."
    )
    return "\n".join(parts)
