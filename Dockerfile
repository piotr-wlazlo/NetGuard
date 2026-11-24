# Backend NetGuard: FastAPI + silnik detekcji
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Najpierw zależności (osobna warstwa cache), bez pakietów potrzebnych tylko do testów
COPY requirements.txt .
RUN grep -vE '^(pytest|httpx2)\b' requirements.txt > requirements-runtime.txt \
    && pip install -r requirements-runtime.txt

COPY netguard ./netguard
COPY data ./data

# Pliki z repo mogą mieć uprawnienia tylko dla właściciela; użytkownik aplikacji musi je czytać
RUN chmod -R a+rX /app \
    && useradd --create-home --uid 1000 netguard
USER netguard

EXPOSE 8000

# Liczbę procesów roboczych ustawia zmienna WEB_CONCURRENCY (domyślnie 1)
CMD ["uvicorn", "netguard.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
