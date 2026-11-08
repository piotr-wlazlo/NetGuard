import math
from typing import Sequence

import numpy as np

from netguard.detection.detectors.base import FlowBatchStats, make_detection
from netguard.domain import AnomalyType
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow

MAD_SCALE = 0.6745  # stała ze wzoru na robust z-score

ANOMALY_TYPES = (
    AnomalyType.PORT_SCAN, AnomalyType.BRUTE_FORCE, AnomalyType.DDOS
)


def feature_matrix(flows: Sequence[NetworkFlow], stats: FlowBatchStats) -> np.ndarray:
    return np.array([
        [
            math.log1p(len(stats.pair_ports[(f.source_ip, f.destination_ip)])),
            math.log1p(stats.service_attempts[(f.source_ip, f.destination_ip, f.destination_port)]),
            math.log1p(len(stats.dst_sources[f.destination_ip]))
        ]
        for f in flows
    ])


class StatisticalDetector:
    name = "statistical"

    def __init__(self, params: dict[str, float]):
        self.params = params

    def detect_anomalies(
        self, flows: Sequence[NetworkFlow], context: Sequence[NetworkFlow] | None = None
    ) -> list[Detection]:
        if len(flows) < int(self.params["min_flows"]):
            return []

        stats = FlowBatchStats(context or flows, int(self.params["small_flow_packets"]))
        z_threshold = self.params["z_threshold"]
        matrix = feature_matrix(flows, stats)
        medians = np.median(matrix, axis=0)
        mads = np.maximum(np.median(np.abs(matrix - medians), axis=0), self.params["mad_floor"])
        z = MAD_SCALE * (matrix - medians) / mads

        detections = []
        for flow, row in zip(flows, z):
            idx = int(np.argmax(row))
            score = float(row[idx])
            if score < z_threshold:
                continue
            anomaly_type = ANOMALY_TYPES[idx]
            detections.append(make_detection(
                flow, self.name, anomaly_type,
                1.0 - math.exp(-max(0.1, score - z_threshold)),
                f"[statistical] {anomaly_type.value} (robust z={score:.2f}, threshold={z_threshold})",
            ))
        return detections