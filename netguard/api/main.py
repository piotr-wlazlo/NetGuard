from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from netguard.api.routers import alerts, analysis, detection
from netguard.services import InvalidConfigError, InvalidTransitionError, NotFoundError

app = FastAPI(
    title="NetGuard API",
    version="0.1.0",
    description="Network anomaly detection API"
)


@app.exception_handler(NotFoundError)
def not_found_handler(request: Request, error: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(InvalidTransitionError)
def invalid_transition_handler(request: Request, error: InvalidTransitionError):
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.exception_handler(InvalidConfigError)
def invalid_config_handler(request: Request, error: InvalidConfigError):
    return JSONResponse(status_code=422, content={"detail": str(error)})


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


app.include_router(analysis.router)
app.include_router(detection.router)
app.include_router(alerts.router)
