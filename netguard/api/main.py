from fastapi import FastAPI

from netguard.api.routers import (
    analysis,
    detection,
    alerts,
    statistics
)

app = FastAPI(
    title="NetGuard API",
    version="0.1.0",
    description="Network anomaly detection API"
)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(analysis.router)
app.include_router(detection.router)
app.include_router(alerts.router)
app.include_router(statistics.router)