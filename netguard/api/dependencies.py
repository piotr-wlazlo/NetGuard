from netguard.db import get_session  # noqa: F401
from netguard.services import DetectionService
from netguard.services.alert_service import AlertService

_detection_service = DetectionService()
_alert_service = AlertService()


def get_detection_service() -> DetectionService:
    return _detection_service


def get_alert_service() -> AlertService:
    return _alert_service
