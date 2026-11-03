import threading
from typing import Iterable

from netguard.alert_engine import AlertEngine
from netguard.domain import Alert, AlertSort, AlertStatus, DetectionResult, Priority
from netguard.services.errors import InvalidTransitionError, NotFoundError


class AlertService:
    def __init__(self):
        self._lock = threading.Lock()
        self._engine = AlertEngine()

    def process(self, results: Iterable[DetectionResult], window_seconds: int) -> list[Alert]:
        with self._lock:
            self._engine.window_seconds = window_seconds
            return list(self._engine.process(results))

    def list(self, status: AlertStatus | None = None, sort: AlertSort = AlertSort.PRIORITY) -> list[Alert]:
        with self._lock:
            return self._engine.list_alerts(status, sort)

    def get(self, alert_id: int) -> Alert:
        with self._lock:
            return self._get(alert_id)

    def create(self, title: str, description: str, priority: Priority) -> Alert:
        with self._lock:
            return self._engine.add_alert(title, description, priority)

    def replace(self, alert_id: int, title: str, description: str, priority: Priority) -> Alert:
        with self._lock:
            alert = self._get(alert_id)
            alert.title, alert.description, alert.priority = title, description, Priority(priority)
            return alert

    def change_status(self, alert_id: int, status: AlertStatus) -> Alert:
        with self._lock:
            try:
                return self._engine.set_status(alert_id, status)
            except KeyError as error:
                raise NotFoundError(f"Alert {alert_id} not found.") from error
            except ValueError as error:
                raise InvalidTransitionError(str(error)) from error

    def reset(self) -> None:
        with self._lock:
            self._engine.reset()

    def _get(self, alert_id: int) -> Alert:
        alert = self._engine.get_alert(alert_id)
        if alert is None:
            raise NotFoundError(f"Alert {alert_id} not found.")
        return alert
