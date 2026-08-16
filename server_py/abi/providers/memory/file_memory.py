"""Uzun sureli hafiza: bagimliliksiz JSON dosyasi."""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import asdict, dataclass

from ...config import config


@dataclass
class MemoryFact:
    id: str
    text: str
    created_at: float
    hits: int


class FileMemory:
    id = "file"

    def __init__(self) -> None:
        self._facts: list[MemoryFact] | None = None
        # Es zamanli yazmalar dosyayi bozmasin.
        self._lock = asyncio.Lock()

    async def list(self) -> list[MemoryFact]:
        if self._facts is not None:
            return self._facts
        try:
            raw = json.loads(config.memory_file.read_text("utf-8"))
            self._facts = [
                MemoryFact(
                    id=str(item.get("id", "")),
                    text=str(item.get("text", "")),
                    created_at=float(item.get("created_at", item.get("createdAt", 0))),
                    hits=int(item.get("hits", 1)),
                )
                for item in raw.get("facts", [])
                if item.get("text")
            ]
        except (OSError, json.JSONDecodeError, ValueError):
            self._facts = []
        return self._facts

    async def remember(self, text: str) -> MemoryFact | None:
        clean = " ".join(text.split())
        if not 3 <= len(clean) <= 240:
            return None

        facts = await self.list()
        normalized = clean.casefold()
        for fact in facts:
            if fact.text.casefold() == normalized:
                fact.hits += 1
                await self._persist()
                return fact

        fact = MemoryFact(
            id=f"m_{secrets.token_hex(5)}", text=clean, created_at=time.time(), hits=1
        )
        facts.append(fact)
        if len(facts) > config.memory_max_facts:
            # Sinir asilirsa en az kullanilan ve en eski kayitlar dusurulur.
            facts.sort(key=lambda f: (f.hits, f.created_at), reverse=True)
            del facts[config.memory_max_facts :]
        await self._persist()
        return fact

    async def forget(self, fact_id: str) -> None:
        facts = await self.list()
        self._facts = [fact for fact in facts if fact.id != fact_id]
        await self._persist()

    async def clear(self) -> None:
        self._facts = []
        await self._persist()

    async def _persist(self) -> None:
        async with self._lock:
            payload = {"version": 1, "facts": [asdict(fact) for fact in self._facts or []]}
            config.memory_file.parent.mkdir(parents=True, exist_ok=True)
            config.memory_file.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), "utf-8"
            )


memory = FileMemory()
