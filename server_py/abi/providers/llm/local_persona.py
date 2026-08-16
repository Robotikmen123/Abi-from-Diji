"""
Anahtarsiz calisan son care.

Gercek zeka degil; karakterin ekranda yasadigini dogrulamak icin kisa,
karakterde replikler uretir. Gemini anahtari girilince devre disi kalir.
"""

from __future__ import annotations

import asyncio
import random
import re
from typing import AsyncIterator

from .base import LlmRequest

_RULES: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    (
        "selam",
        ("merhaba", "selam", "günaydın", "gunaydin", "iyi akşamlar", "naber", "nasılsın"),
        ("[IDLE] Buradayım. Ne var?", "[AMUSED] Hoş geldin. Anlat bakalım.", "[IDLE] Hmm? Söyle."),
    ),
    (
        "abi",
        ("abi", "abicim", "abiciğim"),
        ("[IDLE] Efendim. Dinliyorum.", "[AMUSED] Gel bakalım. Ne oldu?", "[SERIOUS] Buradayım. Söyle."),
    ),
    (
        "yardim",
        ("yardım", "yardim", "yapabilir misin", "hallet", "çöz", "coz"),
        (
            "[SERIOUS] Tamam, çekil. Ben hallederim.",
            "[SUSPICIOUS] Bir dakika. Önce ne yapmaya çalışıyorsun?",
            "[SERIOUS] Göster. Bakayım şuna.",
        ),
    ),
    (
        "oyun",
        ("oyun", "maç", "mac", "kaybettim", "yendim", "rakip"),
        (
            "[ANNOYED] Aynı şeyi kaçıncı kez yapıyorsun? Taktik değiştiriyoruz.",
            "[EXCITED] Tamam, şimdi oldu. Devam et.",
            "[AMUSED] Ben sana söylemiştim.",
        ),
    ),
    (
        "itiraz",
        ("satın al", "satin al", "para gönder", "kredi", "yatırım", "yatirim"),
        ("[ALERT] Yok. Bence hiç bulaşma.", "[SUSPICIOUS] Dur bakalım. Sen ciddi misin?"),
    ),
    (
        "gorme",
        ("şuna bak", "suna bak", "ekrana bak", "görüyor musun", "goruyor musun"),
        (
            "[SUSPICIOUS] Göremiyorum. Gemini anahtarı olmadan gözlerim kapalı.",
            "[SERIOUS] Bakamıyorum şu an. Anahtarı bir tak da göreyim.",
        ),
    ),
    (
        "tesekkur",
        ("teşekkür", "tesekkur", "sağ ol", "sag ol", "eyvallah"),
        ("[AMUSED] Ne demek. Devam.", "[IDLE] Tamam tamam."),
    ),
    (
        "kimsin",
        ("kimsin", "nesin", "yapay zeka mısın", "bot musun"),
        ("[SERIOUS] Abinim. Bu kadarı yeter.", "[AMUSED] Buradayım işte. Başka?"),
    ),
]

_QUESTION = (
    "[SUSPICIOUS] Bir saniye. Tam olarak neyi soruyorsun?",
    "[SERIOUS] Bak şimdi. Önce şunu netleştirelim.",
    "[IDLE] Hmm. Biraz daha aç bakalım.",
)

_GENERIC = (
    "[IDLE] Tamam, dinliyorum. Devam et.",
    "[SUSPICIOUS] Dur. Nereye varmaya çalışıyorsun?",
    "[AMUSED] Haydaa. Bunu bir daha söyle.",
    "[SERIOUS] Anladım. Göster bakalım.",
)

_WORD = re.compile(r"\S+\s*")


class LocalPersonaProvider:
    id = "local"
    label = "Yerel karakter motoru (anahtarsiz)"
    vision = False

    def __init__(self) -> None:
        self._last: dict[str, int] = {}

    async def available(self) -> bool:
        return True

    async def stream(self, request: LlmRequest) -> AsyncIterator[str]:
        reply = self._compose(request.message)
        # Gercek streaming hissi: kelime kelime, insan temposunda.
        for word in _WORD.findall(reply):
            yield word
            await asyncio.sleep(0.018 + random.random() * 0.026)

    def _compose(self, message: str) -> str:
        text = message.casefold()
        for key, hints, replies in _RULES:
            if any(hint in text for hint in hints):
                return self._pick(key, replies)
        if text.strip().endswith("?"):
            return self._pick("soru", _QUESTION)
        return self._pick("genel", _GENERIC)

    def _pick(self, key: str, options: tuple[str, ...]) -> str:
        if not options:
            return "[IDLE] Hmm."
        index = random.randrange(len(options))
        # Ust uste ayni repligi verme.
        if len(options) > 1 and index == self._last.get(key, -1):
            index = (index + 1) % len(options)
        self._last[key] = index
        return options[index]
