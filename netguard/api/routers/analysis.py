import os
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from redis.exceptions import RedisError
from sqlmodel import Session

from netguard.api.dependencies import get_alert_service, get_detection_service, get_pcap_service, get_session
from netguard.api.schemas import AlertOut, AnalysisRequest, AnalysisResponse, DetectionOut, PcapJobOut
from netguard.services.pcap_service import InvalidPcapError, PcapService, PcapTooLargeError, save_upload
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

PcapServiceDep = Annotated[
    PcapService,
    Depends(get_pcap_service)
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


@router.post("/pcap", response_model=PcapJobOut, status_code=status.HTTP_202_ACCEPTED)
def upload_pcap(
    background_tasks: BackgroundTasks,
    service: PcapServiceDep,
    file: UploadFile = File(..., description="Plik .pcap lub .pcapng"),
    method: Literal["rules", "statistical", "ml"] = "rules",
):
    """Przyjmuje plik PCAP i analizuje go w tle (przez strumień Redis). Zwraca od razu identyfikator
    zadania; postęp i wynik są dostępne pod GET /api/v1/analysis/pcap/{job_id}."""
    try:
        path, size = save_upload(file.file)
    except PcapTooLargeError as error:
        raise HTTPException(413, str(error)) from error
    except InvalidPcapError as error:
        raise HTTPException(422, str(error)) from error

    filename = file.filename or "upload.pcap"
    try:
        job = service.create_job(filename=filename, size_bytes=size, method=method)
    except RedisError as error:
        os.remove(path)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis jest niedostępny.") from error

    background_tasks.add_task(service.run, job["job_id"], path, filename, method)
    return job


@router.get("/pcap/{job_id}", response_model=PcapJobOut)
def get_pcap_job(job_id: str, service: PcapServiceDep):
    """Status zadania importu PCAP: queued, processing, done albo failed."""
    try:
        job = service.get_job(job_id)
    except RedisError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Redis jest niedostępny.") from error
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zadanie {job_id} nie istnieje albo wygasło.")
    return job
