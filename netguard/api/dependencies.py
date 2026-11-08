from netguard.db import get_session  # noqa: F401
from netguard.services import DetectionService

_detection_service = DetectionService()


def get_detection_service() -> DetectionService:
    return _detection_service