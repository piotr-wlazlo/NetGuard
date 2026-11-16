from typing import Sequence

from netguard.detection.detectors.base import FlowBatchStats, make_detection
from netguard.detection.detectors.statistical import feature_matrix
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow

MIN_FLOWS = 10


class IsolationForestDetector:
    name = "ml"

    def __init__(self, params: dict[str, float], model=None):
        self.params = params
        self.model = model

    def detect_anomalies(
        self, flows: Sequence[NetworkFlow], context: Sequence[NetworkFlow] | None = None
    ) -> list[Detection]:
        if len(flows) < MIN_FLOWS:
            return []

        from sklearn.ensemble import IsolationForest

        stats = FlowBatchStats(context or flows, int(self.params.get("small_flow_packets", 3)))
        rows = feature_matrix(flows, stats)
        threshold = self.params["ml_score_threshold"]
        model = self.model or IsolationForest(n_estimators=100, random_state=0).fit(rows)
        scores = -model.score_samples(rows)

        detections = []
        for flow, score in zip(flows, scores):
            score = float(score)
            if score < threshold:
                continue
            result = stats.classify(flow, self.params)
            if result is None:
                continue
            anomaly_type, ratio = result
            detections.append(make_detection(
                flow, self.name, anomaly_type, (score - threshold) / (1.0 - threshold),
                f"[ml] {anomaly_type.value} (IsolationForest score={score:.2f})",
            ))
        return detections
