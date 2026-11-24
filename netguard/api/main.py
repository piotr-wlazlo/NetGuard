import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from netguard.api.routers import alerts, analysis, detection
from netguard.services import InvalidConfigError


@asynccontextmanager
async def lifespan(app: FastAPI):
    # W kontenerze (NETGUARD_INIT_DB=1) API samo tworzy tabele przy starcie.
    # Lokalnie i w testach nic się nie zmienia: tabele tworzy init_db() wywołane ręcznie.
    if os.getenv("NETGUARD_INIT_DB") == "1":
        from netguard.db import init_db

        init_db()
    yield


app = FastAPI(
    title="NetGuard API",
    version="0.1.0",
    description="Network anomaly detection API",
    lifespan=lifespan,
)


@app.exception_handler(InvalidConfigError)
def invalid_config_handler(request: Request, error: InvalidConfigError):
    return JSONResponse(status_code=422, content={"detail": str(error)})


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(analysis.router)
app.include_router(detection.router)
app.include_router(alerts.router)
