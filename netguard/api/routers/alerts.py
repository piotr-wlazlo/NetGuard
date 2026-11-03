from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from netguard.api.dependencies import get_alert_service
from netguard.api.schemas import AlertCreate, AlertOut, AlertStatusPatch, AlertUpdate
from netguard.domain import AlertSort, AlertStatus
from netguard.services import AlertService


router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["alerts"]
)

Alerts = Annotated[AlertService, Depends(get_alert_service)]


@router.get("", response_model=list[AlertOut])
def list_alerts(
    service: Alerts,
    status_filter: Annotated[AlertStatus | None, Query(alias="status")] = None,
    sort: AlertSort = AlertSort.PRIORITY,
):
    return [AlertOut.from_domain(a) for a in service.list(status_filter, sort)]


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, service: Alerts):
    return AlertOut.from_domain(service.get(alert_id))


@router.post("", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
def create_alert(payload: AlertCreate, service: Alerts):
    return AlertOut.from_domain(service.create(payload.title, payload.description, payload.priority))


@router.put("/{alert_id}", response_model=AlertOut)
def replace_alert(alert_id: int, payload: AlertUpdate, service: Alerts):
    return AlertOut.from_domain(
        service.replace(alert_id, payload.title, payload.description, payload.priority)
    )


@router.patch("/{alert_id}/status", response_model=AlertOut)
def change_alert_status(alert_id: int, payload: AlertStatusPatch, service: Alerts):
    return AlertOut.from_domain(service.change_status(alert_id, payload.status))
