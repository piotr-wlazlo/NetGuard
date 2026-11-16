from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from netguard.api.dependencies import get_alert_service, get_session
from netguard.api.schemas import AlertOut, AlertStatusIn
from netguard.model.alert import Alert
from netguard.services.alert_service import AlertService

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

Alerts = Annotated[AlertService, Depends(get_alert_service)]
DbSession = Annotated[Session, Depends(get_session)]


def _existing(service: AlertService, session: Session, alert_id: int) -> Alert:
    try:
        return service.get(session, alert_id)
    except LookupError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("", response_model=list[AlertOut])
def list_alerts(
    service: Alerts,
    session: DbSession,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
):
    """Lists alerts, newest first."""
    return service.list(session, status_filter)


@router.get("/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, service: Alerts, session: DbSession):
    return _existing(service, session, alert_id)


@router.put("/{alert_id}/status", response_model=AlertOut)
def set_alert_status(alert_id: int, payload: AlertStatusIn, service: Alerts, session: DbSession):
    _existing(service, session, alert_id)
    return service.set_status(session, alert_id, payload.status)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: int, service: Alerts, session: DbSession):
    _existing(service, session, alert_id)
    service.delete(session, alert_id)
