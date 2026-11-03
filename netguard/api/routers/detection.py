from typing import Annotated

from fastapi import APIRouter, Depends, status

from netguard.api.dependencies import get_analysis_service, get_detection_service
from netguard.api.schemas import ConfigOut, ProtectedNetworksIn, ThresholdsIn
from netguard.services import AnalysisService, DetectionService


router = APIRouter(
    prefix="/api/v1/detection",
    tags=["detection"]
)

Detection = Annotated[DetectionService, Depends(get_detection_service)]


@router.get("/config", response_model=ConfigOut)
def get_detection_config(service: Detection):
    return ConfigOut.from_domain(service.config)


@router.put("/config", response_model=ConfigOut)
def replace_detection_config(payload: ThresholdsIn, service: Detection):
    return ConfigOut.from_domain(service.replace_thresholds(payload.model_dump()))


@router.put("/protected-networks", response_model=ConfigOut)
def replace_protected_networks(payload: ProtectedNetworksIn, service: Detection):
    return ConfigOut.from_domain(service.set_protected_networks(payload.cidrs))


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_detection(service: Annotated[AnalysisService, Depends(get_analysis_service)]):
    service.reset()
