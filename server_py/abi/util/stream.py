"""Akan metni karakterin konusabilecegi parcalara donusturen yardimcilar."""

from __future__ import annotations

import re
from dataclasses import dataclass

EMOTIONS = {
    "IDLE",
    "AMUSED",
    "ANNOYED",
    "SERIOUS",
    "SUSPICIOUS",
    "EXCITED",
    "SURPRISED",
    "MISSION",
    "ALERT",
}

_EMOTION_TAG = re.compile(r"^\s*\[([A-ZÇĞİÖŞÜ_]+)\]\s*")
_MEMORY_MARK = re.compile(r"<<\s*hatirla\s*:\s*([^>]{3,240})>>", re.IGNORECASE)
_MISSION_START = re.compile(r"<<\s*gorev\s*:\s*([^|>]{2,80})(?:\|\s*(\d{1,2}))?\s*>>", re.IGNORECASE)
_MISSION_STEP = re.compile(r"<<\s*gorev-adim\s*>>", re.IGNORECASE)
_MISSION_DONE = re.compile(r"<<\s*gorev-bitti\s*>>", re.IGNORECASE)

_SENTENCE_END = set(".!?…")
_CLAUSE_END = set(",;:")


def extract_emotion(text: str) -> tuple[str | None, str]:
    """Cevabin basindaki [DUYGU] etiketini ayirir."""
    match = _EMOTION_TAG.match(text)
    if not match:
        return None, text
    candidate = match.group(1).upper()
    if candidate not in EMOTIONS:
        return None, text
    return candidate, text[match.end() :]


def extract_memories(text: str) -> tuple[str, list[str]]:
    """<<hatirla: ...>> isaretlerini metinden cikarip toplar."""
    facts: list[str] = []

    def take(match: re.Match[str]) -> str:
        facts.append(match.group(1).strip())
        return ""

    return _MEMORY_MARK.sub(take, text), facts


@dataclass
class MissionSignal:
    kind: str
    title: str | None = None
    total: int | None = None


def extract_missions(text: str) -> tuple[str, list[MissionSignal]]:
    """<<gorev...>> isaretlerini metinden cikarip toplar."""
    signals: list[MissionSignal] = []

    def start(match: re.Match[str]) -> str:
        total_raw = match.group(2)
        total = 1
        if total_raw:
            try:
                total = max(1, min(20, int(total_raw)))
            except ValueError:
                total = 1
        signals.append(MissionSignal("start", match.group(1).strip(), total))
        return ""

    clean = _MISSION_START.sub(start, text)

    def step(_match: re.Match[str]) -> str:
        signals.append(MissionSignal("step"))
        return ""

    clean = _MISSION_STEP.sub(step, clean)

    def done(_match: re.Match[str]) -> str:
        signals.append(MissionSignal("done"))
        return ""

    clean = _MISSION_DONE.sub(done, clean)
    return clean, signals


_CODE_BLOCK = re.compile(r"```.*?```", re.DOTALL)
_MARKDOWN = re.compile(r"[*_`#>]+")
_BULLET = re.compile(r"^\s*[-•]\s+", re.MULTILINE)
_EMOJI = re.compile(
    "[\U0001f300-\U0001faff\U00002600-\U000027bf\U0001f1e6-\U0001f1ff]", flags=re.UNICODE
)
_SPACES = re.compile(r"[ \t]{2,}")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.!?…:;])")


def speakable(text: str) -> str:
    """Seslendirilecek metni temizler: markdown, emoji ve susleme konusulmaz."""
    out = _CODE_BLOCK.sub(" ", text)
    out = _MARKDOWN.sub("", out)
    out = _BULLET.sub("", out)
    out = _EMOJI.sub("", out)
    out = _SPACES.sub(" ", out)
    out = _SPACE_BEFORE_PUNCT.sub(r"\1", out)
    return out.strip()


class PhraseSplitter:
    """
    Akan token'lari konusulabilir parcalara boler.

    Ilk parca bilerek kisa tutulur: seslendirmenin cumle tamamlanmadan
    baslamasi toplam gecikmeyi belirgin dusuruyor.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._emitted = 0

    def push(self, token: str) -> list[str]:
        self._buffer += token
        out: list[str] = []
        while True:
            cut = self._find_cut()
            if cut < 0:
                break
            phrase = self._buffer[:cut].strip()
            self._buffer = self._buffer[cut:]
            if phrase:
                out.append(phrase)
                self._emitted += 1
        return out

    def flush(self) -> str | None:
        rest = self._buffer.strip()
        self._buffer = ""
        if not rest:
            return None
        self._emitted += 1
        return rest

    def _find_cut(self) -> int:
        min_length = 14 if self._emitted == 0 else 40
        max_length = 90 if self._emitted == 0 else 170

        for index, char in enumerate(self._buffer):
            is_end = char in _SENTENCE_END
            is_clause = char in _CLAUSE_END
            if not is_end and not is_clause:
                continue

            # "3.5" gibi sayilarda nokta cumle sonu degil.
            nxt = self._buffer[index + 1 : index + 2]
            if is_end and nxt.isdigit():
                continue

            length = index + 1
            if is_end and length >= min_length:
                return length
            if is_clause and length >= max_length:
                return length

        # Noktalama gelmiyorsa cok uzamadan bosluktan bol.
        if len(self._buffer) > max_length + 60:
            space = self._buffer.rfind(" ", 0, max_length + 40)
            if space > min_length:
                return space + 1
        return -1
