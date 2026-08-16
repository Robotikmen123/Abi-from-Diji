#!/usr/bin/env python3
"""
ABİ sunucusunu baslatir.

Proje sanal ortami varsa kendini onun icinde yeniden calistirir; boylece
`npm run dev` sanal ortami elle etkinlestirmeden calisir.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _venv_python() -> Path | None:
    candidates = (
        ROOT / ".venv" / "bin" / "python",
        ROOT / ".venv" / "Scripts" / "python.exe",
    )
    return next((path for path in candidates if path.exists()), None)


def main() -> None:
    venv = _venv_python()
    # Zaten sanal ortamdaysak tekrar calistirma (sonsuz dongu olmasin).
    if venv is not None and Path(sys.executable).resolve() != venv.resolve():
        os.execv(str(venv), [str(venv), __file__, *sys.argv[1:]])

    sys.path.insert(0, str(ROOT / "server_py"))
    try:
        from abi.main import run
    except ImportError as err:
        print(f"Bagimliliklar eksik: {err}")
        print("Kurulum:  npm run setup")
        raise SystemExit(1)
    run()


if __name__ == "__main__":
    main()
