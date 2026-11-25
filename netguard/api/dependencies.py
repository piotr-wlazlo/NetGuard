from netguard.db import get_session  # noqa: F401
from netguard.services import DetectionService
from netguard.services.alert_service import AlertService

_detection_service = DetectionService()
_alert_service = AlertService()


def get_detection_service() -> DetectionService:
    return _detection_service


def get_alert_service() -> AlertService:
    return _alert_service

from netguard.services.pcap_service import PcapService  # noqa: E402

_pcap_service = PcapService()


def get_pcap_service() -> PcapService:
    return _pcap_service
