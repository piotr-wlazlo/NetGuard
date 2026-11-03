import threading
from dataclasses import dataclass
from typing import Sequence

from netguard.domain import Alert, DetectionResult, Flow
from netguard.services.alert_service import AlertService
from netguard.services.detection_service import DetectionService


@dataclass
class AnalysisResult:
    flow_count: int
    detections: list[DetectionResult]
    alerts: list[Alert]


class AnalysisService:
    def __init__(self, detection: DetectionService, alerts: AlertService):
        self.detection = detection
        self.alerts = alerts
        self._lock = threading.Lock()

    def analyze(self, flows: Sequence[Flow]) -> AnalysisResult:
        with self._lock:
            results, config = self.detection.detect(flows)
            alerts = self.alerts.process(results, config.window_seconds)
            return AnalysisResult(len(flows), results, alerts)

    def reset(self) -> None:
        with self._lock:
            self.detection.reset()
            self.alerts.reset()
