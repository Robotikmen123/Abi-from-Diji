"""Sohbet akisi (SSE). Karakterin gecikmesi burada belirleniyor."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..config import config
from ..persona import build_system_prompt
from ..providers.llm.base import ChatTurn, LlmRequest, VisionFrame
from ..providers.llm.registry import fallback_provider, resolve_llm
from ..providers.memory.file_memory import memory
from ..util.stream import (
    PhraseSplitter,
    extract_emotion,
    extract_memories,
    extract_missions,
    speakable,
)

log = logging.getLogger("abi.chat")
router = APIRouter()


class Turn(BaseModel):
    role: str
    text: str


class Frame(BaseModel):
    source: str = "camera"
    mime: str = "image/jpeg"
    data: str


class ChatBody(BaseModel):
    message: str = ""
    history: list[Turn] = Field(default_factory=list)
    intensity: str = "normal"
    userName: str | None = None
    trigger: str | None = None
    frames: list[Frame] = Field(default_factory=list)


def _event(name: str, data: dict[str, Any]) -> bytes:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


@router.post("/chat")
async def chat(body: ChatBody, request: Request) -> StreamingResponse:
    message = body.message.strip()
    if not message:
        return StreamingResponse(
            iter([_event("error", {"message": "message bos olamaz"})]),
            media_type="text/event-stream",
        )

    async def generate() -> AsyncIterator[bytes]:
        started = time.monotonic()
        state = {"first_token": False, "emitted": 0, "emotion_sent": False}

        # Karelerin boyutu sinirli: gecikme dogrudan istek govdesine bagli.
        frames = [
            VisionFrame(source=f.source, mime=f.mime, data=f.data)  # type: ignore[arg-type]
            for f in body.frames[:2]
            if f.data and len(f.data) < 3_000_000
        ]
        history = [
            ChatTurn(role="user" if t.role == "user" else "abi", text=t.text)
            for t in body.history[-12:]
            if t.text.strip()
        ]

        def emit_phrase(phrase: str) -> list[bytes]:
            out: list[bytes] = []
            no_memory, facts = extract_memories(phrase)
            for fact in facts:
                asyncio.create_task(memory.remember(fact))

            clean, signals = extract_missions(no_memory)
            for signal in signals:
                payload: dict[str, Any] = {"kind": signal.kind}
                if signal.title:
                    payload["title"] = signal.title
                if signal.total:
                    payload["total"] = signal.total
                out.append(_event("mission", payload))

            text = speakable(clean)
            if text:
                state["emitted"] += 1
                out.append(_event("phrase", {"index": state["emitted"], "text": text}))
            return out

        async def run(provider: Any, system: str) -> AsyncIterator[bytes]:
            splitter = PhraseSplitter()
            raw = ""

            llm_request = LlmRequest(
                system=system,
                message=message,
                history=history,
                frames=frames if getattr(provider, "vision", False) else [],
                temperature=config.temperature,
                max_tokens=config.max_tokens,
            )

            async for token in provider.stream(llm_request):
                if await request.is_disconnected():
                    return
                if not state["first_token"]:
                    state["first_token"] = True
                    yield _event(
                        "latency", {"firstToken": int((time.monotonic() - started) * 1000)}
                    )

                raw += token

                # Duygu etiketi cevabin basinda; ilk parcadan once yakalanmali.
                if not state["emotion_sent"]:
                    emotion, rest = extract_emotion(raw)
                    if emotion:
                        state["emotion_sent"] = True
                        raw = rest
                        yield _event("emotion", {"emotion": emotion})
                        for phrase in splitter.push(rest):
                            for chunk in emit_phrase(phrase):
                                yield chunk
                        continue
                    # Etiket gelmeyecekse akisi daha fazla bekletme.
                    if len(raw) > 16 and not raw.lstrip().startswith("["):
                        state["emotion_sent"] = True
                        yield _event("emotion", {"emotion": "IDLE"})
                        for phrase in splitter.push(raw):
                            for chunk in emit_phrase(phrase):
                                yield chunk
                    continue

                for phrase in splitter.push(token):
                    for chunk in emit_phrase(phrase):
                        yield chunk

            if not state["emotion_sent"]:
                emotion, rest = extract_emotion(raw)
                state["emotion_sent"] = True
                yield _event("emotion", {"emotion": emotion or "IDLE"})
                for phrase in splitter.push(rest):
                    for chunk in emit_phrase(phrase):
                        yield chunk

            tail = splitter.flush()
            if tail:
                for chunk in emit_phrase(tail):
                    yield chunk

        try:
            provider = await resolve_llm()
            system = await build_system_prompt(body.intensity, body.userName)
            yield _event(
                "start",
                {
                    "provider": provider.id,
                    "character": config.character_name,
                    "vision": bool(getattr(provider, "vision", False)),
                },
            )

            try:
                async for chunk in run(provider, system):
                    yield chunk
            except asyncio.CancelledError:
                raise
            except Exception as err:  # zeka saglayicisi coktu
                # Tek kelime bile cikmadiysa karakter sessiz kalmasin.
                if state["emitted"] > 0 or provider.id == fallback_provider.id:
                    raise
                log.warning("%s coktu, yerel karakter motoruna dusuluyor: %s", provider.id, err)
                async for chunk in run(fallback_provider, system):
                    yield chunk

            yield _event(
                "done",
                {
                    "totalMs": int((time.monotonic() - started) * 1000),
                    "phrases": state["emitted"],
                },
            )
        except asyncio.CancelledError:
            # Barge-in: istemci baglantiyi kesti, uretimi birak.
            raise
        except Exception as err:
            log.exception("chat akisi basarisiz: %s", err)
            yield _event("error", {"message": "Ses hattinda bir sorun var."})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            "x-accel-buffering": "no",
        },
    )
