from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session

from netguard.api.dependencies import get_alert_service, get_detection_service, get_session
from netguard.api.schemas import AlertOut, AnalysisRequest, AnalysisResponse, DetectionOut
from netguard.services import DetectionService
from netguard.services.alert_service import AlertService


router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"]
)


DetectionServiceDep = Annotated[
    DetectionService,
    Depends(get_detection_service)
]

AlertServiceDep = Annotated[
    AlertService,
    Depends(get_alert_service)
]

DbSession = Annotated[
    Session,
    Depends(get_session)
]


@router.post("/flows", response_model=AnalysisResponse)
def analyze_flows(
    payload: AnalysisRequest,
    service: DetectionServiceDep,
    alert_service: AlertServiceDep,
    session: DbSession,
    method: Literal["rules", "statistical", "ml"] = "rules",
):
    """Analyzes network flows and returns detections and the alerts they raised."""

    flows = [
        flow.to_network_flow()
        for flow in payload.flows
    ]

    detections = service.detect_flows(
        session,
        flows,
        method=method,
    )

    alerts = alert_service.generate(session, detections)

    return AnalysisResponse(
        flow_count=len(flows),
        detection_count=len(detections),
        detections=[
            DetectionOut.model_validate(d)
            for d in detections
        ],
        alert_count=len(alerts),
        alerts=[
            AlertOut.model_validate(a)
            for a in alerts
        ],
    )
