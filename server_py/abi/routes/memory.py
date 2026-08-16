"""Uzun sureli hafiza uc noktalari."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..providers.memory.file_memory import memory

router = APIRouter()


class FactBody(BaseModel):
    text: str


@router.get("/memory")
async def list_facts() -> dict:
    return {"facts": [asdict(fact) for fact in await memory.list()]}


@router.post("/memory")
async def remember(body: FactBody) -> JSONResponse:
    fact = await memory.remember(body.text)
    if fact is None:
        return JSONResponse({"error": "gecersiz bilgi"}, status_code=400)
    return JSONResponse({"fact": asdict(fact)})


@router.delete("/memory/{fact_id}")
async def forget(fact_id: str) -> dict:
    await memory.forget(fact_id)
    return {"ok": True}


@router.delete("/memory")
async def clear() -> dict:
    await memory.clear()
    return {"ok": True}
