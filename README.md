# NetGuard

System wykrywania anomalii w ruchu sieciowym.

## Uruchomienie całego systemu (Docker)

Wymagany Docker Desktop (lub Docker Engine z Compose v2).

```bash
docker compose up --build
```

| Usługa | Adres | Opis |
|---|---|---|
| frontend | http://localhost:8080 | interfejs (nginx, build produkcyjny); `/api` przekierowane do backendu |
| backend | http://localhost:8000/docs | REST API (FastAPI), tabele tworzone przy starcie |
| postgres | localhost:5433 | baza danych |
| redis | localhost:6379 | strumień pakietów |

Kolejność startu pilnują healthchecki: backend czeka na bazę i Redisa, frontend na backend.

Import pliku PCAP przez API (analiza w tle, przez strumień Redis, z tworzeniem alertów):

```bash
curl -F "file=@data/monday_sample.pcap" "http://localhost:8000/api/v1/analysis/pcap?method=rules"
# -> 202 {"job_id": "...", "status": "queued", ...}
curl http://localhost:8000/api/v1/analysis/pcap/<job_id>
# -> status: queued | processing | done | failed, liczba pakietów, detekcje wg typu, utworzone alerty
```

Limit pliku: 200 MB (`PCAP_MAX_BYTES`). Import z konsoli bez API: `docker compose exec backend python -m netguard.main`.

Zatrzymanie: `docker compose down` (dane zostają w wolumenach), pełne wyczyszczenie danych: `docker compose down -v`.

Konfiguracja backendu przez zmienne środowiskowe: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `NETGUARD_INIT_DB` (1 = tworzenie tabel przy starcie), `WEB_CONCURRENCY` (liczba procesów uvicorn).

Tryb deweloperski (backend i frontend uruchamiane lokalnie) opisuje `frontend/README.md`; wtedy wystarczy `docker compose up -d postgres redis`.
