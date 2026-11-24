"""Backend testowy NetGuard dla testów UI.

Uruchamia API z katalogu głównego projektu na JEDNORAZOWEJ bazie SQLite, więc testy nigdy nie
dotykają Postgresa ani żadnych prawdziwych danych. Baza jest tworzona od zera przy każdym starcie.

Zmienne środowiskowe:
  E2E_API_PORT  port API (domyślnie 8101)
  E2E_DB        ścieżka pliku bazy (domyślnie e2e/.tmp/e2e.db)
"""

import os
import sys
from pathlib import Path

E2E_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = E2E_DIR.parent

db_path = Path(os.environ.get("E2E_DB", E2E_DIR / ".tmp" / "e2e.db")).resolve()
db_path.parent.mkdir(parents=True, exist_ok=True)
for leftover in (db_path, Path(f"{db_path}-journal")):
    leftover.unlink(missing_ok=True)

# DATABASE_URL musi być ustawiony PRZED importem netguard.db (silnik powstaje przy imporcie)
os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
sys.path.insert(0, str(REPO_DIR))

from netguard.db import init_db  # noqa: E402

init_db()

import uvicorn  # noqa: E402

uvicorn.run(
    "netguard.api.main:app",
    host="127.0.0.1",
    port=int(os.environ.get("E2E_API_PORT", "8101")),
    log_level="warning",
)
