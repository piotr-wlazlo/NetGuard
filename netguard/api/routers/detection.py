from typing import Annotated
from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from netguard.api.dependencies import get_detection_service, get_session
from netguard.api.schemas import ConfigOut, ParametersIn
from netguard.services import DetectionService

router = APIRouter(prefix="/api/v1/detection", tags=["detection"])

Detection = Annotated[DetectionService, Depends(get_detection_service)]
DbSession = Annotated[Session, Depends(get_session)]


@router.get("/config", response_model=ConfigOut)
def get_detection_config(service: Detection, session: DbSession):
    return ConfigOut.from_rows(service.get_config(session))


@router.put("/config", response_model=ConfigOut)
def replace_detection_config(payload: ParametersIn, service: Detection, session: DbSession):
    return ConfigOut.from_rows(service.replace_parameters(session, payload.to_values()))


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_detection(service: Detection, session: DbSession):
    service.reset(session)