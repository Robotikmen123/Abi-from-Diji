"""Google Gemini akisli uretim (streamGenerateContent, SSE)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator

import httpx

from ...config import config
from .base import LlmRequest

log = logging.getLogger("abi.gemini")

_MODEL_ISSUE = re.compile(r"model|not found|unsupported", re.IGNORECASE)


class GeminiError(Exception):
    def __init__(self, message: str, status: int | None = None, streamed: bool = False) -> None:
        super().__init__(message)
        self.status = status
        self.streamed = streamed


def _contents(request: LlmRequest) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = [
        {"role": "user" if turn.role == "user" else "model", "parts": [{"text": turn.text}]}
        for turn in request.history
    ]

    # Goruntuler son kullanici mesajina eklenir: model once bakar, sonra okur.
    parts: list[dict[str, Any]] = [
        {"inlineData": {"mimeType": frame.mime, "data": frame.data}} for frame in request.frames
    ]
    parts.append({"text": request.message})
    contents.append({"role": "user", "parts": parts})
    return contents


def _body(request: LlmRequest, *, thinking: bool) -> dict[str, Any]:
    generation: dict[str, Any] = {
        "temperature": request.temperature,
        "maxOutputTokens": request.max_tokens,
        "topP": 0.95,
    }
    if not thinking:
        # Karakter kisa konusuyor; dusunme butcesi gecikmeyi katliyor.
        generation["thinkingConfig"] = {"thinkingBudget": 0}

    return {
        "systemInstruction": {"parts": [{"text": request.system}]},
        "contents": _contents(request),
        "generationConfig": generation,
        "safetySettings": [
            {"category": category, "threshold": "BLOCK_ONLY_HIGH"}
            for category in (
                "HARM_CATEGORY_HARASSMENT",
                "HARM_CATEGORY_HATE_SPEECH",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "HARM_CATEGORY_DANGEROUS_CONTENT",
            )
        ],
    }


class GeminiProvider:
    id = "gemini"
    label = "Google Gemini"
    vision = True

    def __init__(self) -> None:
        # Calistigi dogrulanan model; sonraki isteklerde dogrudan kullanilir.
        self._resolved: str | None = None

    async def available(self) -> bool:
        return bool(config.gemini.api_key)

    def _model_chain(self) -> list[str]:
        if self._resolved:
            return [self._resolved]
        chain = [config.gemini.model, *config.gemini.fallback_models]
        seen: list[str] = []
        for model in chain:
            if model and model not in seen:
                seen.append(model)
        return seen

    async def stream(self, request: LlmRequest) -> AsyncIterator[str]:
        if not config.gemini.api_key:
            raise GeminiError("GEMINI_API_KEY tanimli degil")

        last: GeminiError | None = None
        for model in self._model_chain():
            try:
                produced = False
                async for piece in self._stream_model(model, request, thinking=False):
                    produced = True
                    yield piece
                self._resolved = model
                if not produced:
                    log.warning("%s bos cevap dondurdu", model)
                return
            except GeminiError as err:
                # Akis basladiktan sonra model degistirmek cevabi bozar.
                if err.streamed:
                    raise
                last = err
                retryable = err.status in (404, 429) or (
                    err.status == 400 and bool(_MODEL_ISSUE.search(str(err)))
                )
                log.warning("%s basarisiz (%s) %s", model, err.status, str(err)[:200])
                if not retryable:
                    break
        raise last or GeminiError("model bulunamadi")

    async def _stream_model(
        self, model: str, request: LlmRequest, *, thinking: bool
    ) -> AsyncIterator[str]:
        url = f"{config.gemini.base_url}/models/{model}:streamGenerateContent?alt=sse"
        headers = {"content-type": "application/json", "x-goog-api-key": config.gemini.api_key}

        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            async with client.stream(
                "POST", url, headers=headers, json=_body(request, thinking=thinking)
            ) as response:
                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", "replace")
                    # thinkingConfig eski modellerde reddediliyor; sade govdeyle tekrar dene.
                    if response.status_code == 400 and "thinking" in detail.lower() and not thinking:
                        async for piece in self._stream_model(model, request, thinking=True):
                            yield piece
                        return
                    raise GeminiError(detail[:300] or response.reason_phrase, response.status_code)

                started = False
                try:
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if not payload or payload == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(payload)
                        except json.JSONDecodeError:
                            continue

                        feedback = chunk.get("promptFeedback") or {}
                        if feedback.get("blockReason"):
                            log.warning("istek engellendi (%s)", feedback["blockReason"])

                        candidates = chunk.get("candidates") or []
                        if not candidates:
                            continue
                        for part in (candidates[0].get("content") or {}).get("parts") or []:
                            text = part.get("text")
                            if text:
                                started = True
                                yield text
                except httpx.HTTPError as err:
                    raise GeminiError(str(err), streamed=started) from err
