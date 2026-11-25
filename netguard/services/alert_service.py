from typing import Optional, Sequence

from sqlmodel import Session, select

from netguard.alert_engine import ALERT_STATUSES, OPEN_STATUSES, build_alerts, group_key_for
from netguard.model.alert import Alert
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow
from netguard.services.errors import InvalidConfigError


def _check_status(status: str) -> None:
    if status not in ALERT_STATUSES:
        raise InvalidConfigError(f"Unknown alert status: {status}. Allowed: {list(ALERT_STATUSES)}.")


class AlertService:
    def generate(self, session: Session, detections: Sequence[Detection]) -> list[Alert]:
        """Turns detections returned by the detection engine into alerts."""
        ids = {d.id for d in detections if d.id is not None}
        if not ids:
            return []

        rows = session.exec(
            select(Detection, NetworkFlow)
            .join(NetworkFlow, Detection.flow_id == NetworkFlow.id)
            .where(Detection.id.between(min(ids), max(ids)))
        ).all()
        pairs = [(d, f) for d, f in rows if d.id in ids]

        # Tylko klucze grup z bieżących detekcji, a nie wszystkie otwarte alerty w bazie
        candidate_keys = {group_key_for(d, f) for d, f in pairs}
        open_group_keys = set(session.exec(
            select(Alert.group_key).where(
                Alert.status.in_(OPEN_STATUSES), Alert.group_key.in_(candidate_keys)
            )
        ).all()) if candidate_keys else set()

        alerts = build_alerts(pairs, open_group_keys)
        session.add_all(alerts)
        session.commit()
        return alerts

    def list(self, session: Session, status: Optional[str] = None) -> list[Alert]:
        statement = select(Alert)
        if status is not None:
            _check_status(status)
            statement = statement.where(Alert.status == status)
        return list(session.exec(statement.order_by(Alert.id.desc())).all())

    def get(self, session: Session, alert_id: int) -> Alert:
        alert = session.get(Alert, alert_id)
        if alert is None:
            raise LookupError(f"Alert {alert_id} not found.")
        return alert

    def set_status(self, session: Session, alert_id: int, status: str) -> Alert:
        _check_status(status)
        alert = self.get(session, alert_id)
        alert.status = status
        session.commit()
        session.refresh(alert)
        return alert

    def delete(self, session: Session, alert_id: int) -> None:
        session.delete(self.get(session, alert_id))
        session.commit()
