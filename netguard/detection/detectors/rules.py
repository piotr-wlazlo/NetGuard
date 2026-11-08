import math
from typing import Sequence
from netguard.detection.detectors.base import FlowBatchStats, make_detection
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow


class RulesDetector:
    name = "rules"

    def __init__(self, params: dict[str, float]):
        self.params = params

    def detect_anomalies(
        self, flows: Sequence[NetworkFlow], context: Sequence[NetworkFlow] | None = None
    ) -> list[Detection]:
        stats = FlowBatchStats(context or flows, int(self.params.get("small_flow_packets", 3)))
        detections = []
        for flow in flows:
            result = stats.classify(flow, self.params)
            if result is None:
                continue
            anomaly_type, ratio = result
            confidence = 1.0 - math.exp(-max(0.1, ratio - 1.0))
            detections.append(
                make_detection(
                    flow,
                    self.name,
                    anomaly_type,
                    confidence,
                    f"[rules] {anomaly_type.value}: {flow.source_ip} -> {flow.destination_ip} "
                    f"(above threshold x{ratio:.2f})",
                )
            )
        return detections