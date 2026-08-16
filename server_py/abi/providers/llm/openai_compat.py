"""OpenAI uyumlu herhangi bir endpoint (OpenAI, Groq, LM Studio, vLLM...)."""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from ...config import config
from .base import LlmRequest


class OpenAiCompatibleProvider:
    id = "openai"
    label = "OpenAI uyumlu"
    vision = False

    async def available(self) -> bool:
        return bool(config.openai.api_key)

    async def stream(self, request: LlmRequest) -> AsyncIterator[str]:
        messages = [{"role": "system", "content": request.system}]
        messages += [
            {"role": "user" if turn.role == "user" else "assistant", "content": turn.text}
            for turn in request.history
        ]
        messages.append({"role": "user", "content": request.message})

        body = {
            "model": config.openai.model,
            "stream": True,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "messages": messages,
        }
        headers = {"authorization": f"Bearer {config.openai.api_key}"}

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            async with client.stream(
                "POST", f"{config.openai.base_url}/chat/completions", json=body, headers=headers
            ) as response:
                response.raise_for_status()
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
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    text = (choices[0].get("delta") or {}).get("content")
                    if text:
                        yield text
