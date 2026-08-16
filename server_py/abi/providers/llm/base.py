"""LLM saglayici sozlesmesi. Yeni saglayici eklemek mevcut kodu degistirmez."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Literal, Protocol, runtime_checkable

Role = Literal["user", "abi"]


@dataclass
class ChatTurn:
    role: Role
    text: str


@dataclass
class VisionFrame:
    """Karaktere gosterilen kare: kamera veya ekran goruntusu."""

    source: Literal["camera", "screen"]
    mime: str
    data: str  # base64, veri onegi olmadan


@dataclass
class LlmRequest:
    system: str
    message: str
    history: list[ChatTurn] = field(default_factory=list)
    frames: list[VisionFrame] = field(default_factory=list)
    temperature: float = 0.9
    max_tokens: int = 220


@runtime_checkable
class LlmProvider(Protocol):
    id: str
    label: str
    vision: bool

    async def available(self) -> bool:
        ...

    def stream(self, request: LlmRequest) -> AsyncIterator[str]:
        ...
