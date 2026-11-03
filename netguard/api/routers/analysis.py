from typing import Annotated

from fastapi import APIRouter, Depends

from netguard.api.dependencies import get_analysis_service
from netguard.api.schemas import AlertOut, AnalysisRequest, AnalysisResponse, DetectionOut
from netguard.services import AnalysisService


router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"]
)


@router.post("/flows", response_model=AnalysisResponse)
def analyze_flows(
    payload: AnalysisRequest,
    service: Annotated[AnalysisService, Depends(get_analysis_service)],
):
    result = service.analyze([flow.to_domain() for flow in payload.flows])

    return AnalysisResponse(
        flow_count=result.flow_count,
        detection_count=len(result.detections),
        alert_count=len(result.alerts),
        detections=[DetectionOut.from_result(r) for r in result.detections],
        alerts=[AlertOut.from_domain(a) for a in result.alerts],
    )
