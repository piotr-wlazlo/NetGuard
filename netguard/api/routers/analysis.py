from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session

from netguard.api.dependencies import get_detection_service, get_session
from netguard.api.schemas import AnalysisRequest, AnalysisResponse, DetectionOut
from netguard.services import DetectionService


router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"]
)


DetectionServiceDep = Annotated[
    DetectionService,
    Depends(get_detection_service)
]

DbSession = Annotated[
    Session,
    Depends(get_session)
]


@router.post("/flows", response_model=AnalysisResponse)
def analyze_flows(
    payload: AnalysisRequest,
    service: DetectionServiceDep,
    session: DbSession,
    method: Literal["rules", "statistical", "ml"] = "rules",
):
    """Analyzes network flows and returns detections."""

    flows = [
        flow.to_network_flow()
        for flow in payload.flows
    ]

    detections = service.detect_flows(
        session,
        flows,
        method=method,
    )

    return AnalysisResponse(
        flow_count=len(flows),
        detection_count=len(detections),
        detections=[
            DetectionOut.model_validate(d)
            for d in detections
        ],
    )
