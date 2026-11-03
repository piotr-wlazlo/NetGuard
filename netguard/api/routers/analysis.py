from dataclasses import asdict

from fastapi import APIRouter

from netguard.alert_engine import AlertEngine
from netguard.api.schemas import (
    AlertOut,
    AnalysisRequest,
    AnalysisResponse,
    DetectionOut,
)
from netguard.detection.engine import DetectionEngine


router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"]
)


@router.post("/flows", response_model=AnalysisResponse)
def analyze_flows(payload: AnalysisRequest):
    """Analyzes a batch of network flows."""

    flows = [flow.to_domain() for flow in payload.flows]

    engine = DetectionEngine()
    results = list(engine.detect(flows))

    alerts = list(
        AlertEngine(
            window_seconds=engine.config.window_seconds
        ).process(results)
    )

    return AnalysisResponse(
        flow_count=len(flows),
        detection_count=len(results),
        alert_count=len(alerts),
        detections=[
            DetectionOut(
                source_ip=r.flow.source_ip,
                destination_ip=r.flow.destination_ip,
                detection_method=r.detection.detection_method,
                anomaly_type=r.detection.anomaly_type,
                severity=r.detection.severity,
                confidence=r.detection.confidence,
                explanation=r.detection.explanation,
                risk_score=r.risk_score,
                window_start=r.window_start,
                window_end=r.window_end,
            )
            for r in results
        ],
        alerts=[
            AlertOut(**asdict(a))
            for a in alerts
        ],
    )
