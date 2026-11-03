from netguard.services import AlertService, AnalysisService, DetectionService

_detection_service = DetectionService()
_alert_service = AlertService()
_analysis_service = AnalysisService(_detection_service, _alert_service)


def get_detection_service() -> DetectionService:
    return _detection_service


def get_alert_service() -> AlertService:
    return _alert_service


def get_analysis_service() -> AnalysisService:
    return _analysis_service
