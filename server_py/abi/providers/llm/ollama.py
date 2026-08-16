"""Ucretsiz/local alternatif. Gemini yoksa otomatik devreye girer."""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from ...config import config
from .base import LlmRequest


class OllamaProvider:
    id = "ollama"
    label = "Ollama (local)"
    vision = False

    async def available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=0.7) as client:
                response = await client.get(f"{config.ollama.base_url}/api/tags")
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def stream(self, request: LlmRequest) -> AsyncIterator[str]:
        messages = [{"role": "system", "content": request.system}]
        messages += [
            {"role": "user" if turn.role == "user" else "assistant", "content": turn.text}
            for turn in request.history
        ]
        messages.append({"role": "user", "content": request.message})

        body = {
            "model": config.ollama.model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
            async with client.stream("POST", f"{config.ollama.base_url}/api/chat", json=body) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    text = (chunk.get("message") or {}).get("content")
                    if text:
                        yield text
