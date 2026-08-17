"""ABİ sunucusu. FastAPI + SSE."""

from __future__ import annotations

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import config
from .providers.llm.registry import resolve_llm
from .providers.stt.whisper_stt import whisper_stt
from .providers.tts.registry import resolve_tts, unavailable_reason
from .routes import chat, health, memory, voice

logging.basicConfig(
    level=logging.INFO,
    format="\x1b[36m[abi %(asctime)s]\x1b[0m %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("abi")

app = FastAPI(title="ABİ", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(memory.router, prefix="/api")
app.include_router(voice.router, prefix="/api")


@app.on_event("startup")
async def announce() -> None:
    log.info("%s sunucusu :%s portunda", config.character_name, config.port)
    provider = await resolve_llm()
    if provider.id == "local":
        log.warning("GEMINI_API_KEY yok — karakter yerel yedek motorla calisiyor.")
        log.warning("Zeka icin .env dosyasina GEMINI_API_KEY ekleyin.")

    tts = resolve_tts()
    if tts is not None:
        log.info("Ses: %s", tts.label)
    else:
        log.warning("Ses: tarayici sesi — %s", unavailable_reason())

    if whisper_stt.available():
        log.info("Tanima: %s", whisper_stt.label)
    else:
        log.warning("Tanima: tarayici — %s", whisper_stt.reason or "yerel tanima kapali")


# Uretimde arayuz de buradan servis edilir. Boylece masaustu kabugu file://
# yerine http:// yukler: varlik yollari ve localStorage sorunsuz calisir.
if config.web_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=config.web_dist / "assets"), name="assets")
    if (config.web_dist / "fonts").is_dir():
        app.mount("/fonts", StaticFiles(directory=config.web_dist / "fonts"), name="fonts")

    @app.get("/{path:path}")
    async def spa(path: str) -> FileResponse:
        candidate = config.web_dist / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(config.web_dist / "index.html")


def run() -> None:
    uvicorn.run(app, host="0.0.0.0", port=config.port, log_level="warning")


if __name__ == "__main__":
    run()
