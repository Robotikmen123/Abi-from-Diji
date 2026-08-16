#!/usr/bin/env python3
"""
Yerel ses modellerini indirir.

  python scripts/fetch_models.py            # ses + tanima
  python scripts/fetch_models.py --voice    # sadece Turkce ses (Piper)
  python scripts/fetch_models.py --stt      # sadece tanima (Whisper)
  python scripts/fetch_models.py --voice-id tr_TR-dfki-medium

Modeller Hugging Face'ten iner ve `models/` altina yazilir. Bir kez indirilir,
sonrasinda her sey cevrimdisi calisir.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPER_DIR = ROOT / "models" / "piper"
WHISPER_DIR = ROOT / "models" / "whisper"

PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

#: Turkce sesler. Hepsi erkek; fahrettin en tok ve dogal olani.
PIPER_VOICES: dict[str, str] = {
    "tr_TR-fahrettin-medium": "tr/tr_TR/fahrettin/medium",
    "tr_TR-dfki-medium": "tr/tr_TR/dfki/medium",
    "tr_TR-fettah-medium": "tr/tr_TR/fettah/medium",
}


def _download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        print(f"  atlandi (var): {target.name}")
        return

    print(f"  iniyor: {target.name}")
    temp = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "abi-model-fetcher"})
    with urllib.request.urlopen(request) as response, temp.open("wb") as handle:
        total = int(response.headers.get("content-length") or 0)
        done = 0
        while chunk := response.read(1 << 16):
            handle.write(chunk)
            done += len(chunk)
            if total:
                percent = done * 100 // total
                print(f"\r    %{percent} ({done // 1024} KB)", end="", flush=True)
    print()
    temp.replace(target)


def fetch_voice(voice_id: str) -> None:
    path = PIPER_VOICES.get(voice_id)
    if path is None:
        print(f"Bilinmeyen ses: {voice_id}")
        print("Secenekler: " + ", ".join(PIPER_VOICES))
        sys.exit(1)

    print(f"Türkçe ses indiriliyor: {voice_id}")
    _download(f"{PIPER_BASE}/{path}/{voice_id}.onnx", PIPER_DIR / f"{voice_id}.onnx")
    _download(f"{PIPER_BASE}/{path}/{voice_id}.onnx.json", PIPER_DIR / f"{voice_id}.onnx.json")
    print(f"Tamam: {PIPER_DIR}")


def fetch_whisper(model: str) -> None:
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("huggingface_hub gerekli:  pip install huggingface_hub")
        sys.exit(1)

    target = WHISPER_DIR / model
    if target.is_dir() and any(target.iterdir()):
        print(f"Whisper modeli zaten var: {target}")
        return

    print(f"Whisper modeli indiriliyor: {model} (birkaç yüz MB olabilir)")
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=f"Systran/faster-whisper-{model}",
        local_dir=str(target),
        allow_patterns=["*.bin", "*.json", "*.txt", "*.model"],
    )
    print(f"Tamam: {target}")


def main() -> None:
    parser = argparse.ArgumentParser(description="ABİ yerel ses modelleri")
    parser.add_argument("--voice", action="store_true", help="sadece Türkçe sesi indir")
    parser.add_argument("--stt", action="store_true", help="sadece tanıma modelini indir")
    parser.add_argument("--voice-id", default="tr_TR-fahrettin-medium", help="Piper ses kimliği")
    parser.add_argument("--whisper", default="small", help="tiny | base | small | medium")
    args = parser.parse_args()

    # Bayrak verilmediyse ikisini de indir.
    want_voice = args.voice or not args.stt
    want_stt = args.stt or not args.voice

    if want_voice:
        fetch_voice(args.voice_id)
    if want_stt:
        fetch_whisper(args.whisper)

    if shutil.disk_usage(ROOT).free < 512 * 1024 * 1024:
        print("Uyarı: disk alanı azalıyor.")


if __name__ == "__main__":
    main()
