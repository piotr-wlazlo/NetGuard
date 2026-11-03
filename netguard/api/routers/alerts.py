from fastapi import APIRouter


router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["alerts"]
)
