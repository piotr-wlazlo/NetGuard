from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from netguard.api.routers import analysis, detection
from netguard.services import InvalidConfigError

app = FastAPI(
    title="NetGuard API",
    version="0.1.0",
    description="Network anomaly detection API",
)


@app.exception_handler(InvalidConfigError)
def invalid_config_handler(request: Request, error: InvalidConfigError):
    return JSONResponse(status_code=422, content={"detail": str(error)})


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(analysis.router)
app.include_router(detection.router)