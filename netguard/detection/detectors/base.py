from collections import defaultdict
from typing import Protocol, Sequence
from netguard.domain import AnomalyType, Severity
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow


class DetectionStrategy(Protocol):
    name: str
    params: dict[str, float]

    def detect_anomalies(self, flows: Sequence[NetworkFlow]) -> list[Detection]: ...

class FlowBatchStats:
    def __init__(self, flows: Sequence[NetworkFlow], small_flow_packets: int = 3):
        self.small_flow_packets = small_flow_packets
        self.pair_ports: dict[tuple[str, str], set[int]] = defaultdict(set)
        self.service_attempts: dict[tuple[str, str, int], int] = defaultdict(int)
        self.dst_sources: dict[str, set[str]] = defaultdict(set)

        for f in flows:
            pair = (f.source_ip, f.destination_ip)
            self.dst_sources[f.destination_ip].add(f.source_ip)
            if f.destination_port is not None:
                self.pair_ports[pair].add(f.destination_port)
                self.service_attempts[(f.source_ip, f.destination_ip, f.destination_port)] += 1

    def is_small(self, flow: NetworkFlow) -> bool:
        return (flow.packet_count or 0) <= self.small_flow_packets

    def classify(self, flow: NetworkFlow, params: dict[str, float]) -> tuple[AnomalyType, float] | None:
        pair = (flow.source_ip, flow.destination_ip)
        service = (flow.source_ip, flow.destination_ip, flow.destination_port)
        has_port = flow.destination_port is not None
        checks = [
            # wiele różnych portów na jednym hoście, krótkie flow
            (AnomalyType.PORT_SCAN, has_port and self.is_small(flow),
             len(self.pair_ports[pair]) / params["port_scan_min_ports"]),

            # wiele połączeń na ten sam host:port z jednego źródła
            (AnomalyType.BRUTE_FORCE, has_port,
             self.service_attempts.get(service, 0) / params["brute_force_min_attempts"]),

            # wiele różnych źródeł na jeden host docelowy
            (AnomalyType.DDOS, True,
             len(self.dst_sources[flow.destination_ip]) / params["ddos_min_sources"])
        ]
        for anomaly_type, applies, ratio in checks:
            if applies and ratio >= 1.0:
                return anomaly_type, ratio
        return None


def severity_from_score(score: float) -> Severity:
    if score >= 0.85:
        return Severity.CRITICAL
    if score >= 0.65:
        return Severity.HIGH
    if score >= 0.40:
        return Severity.MEDIUM
    return Severity.LOW


def make_detection(
    flow: NetworkFlow,
    method: str,
    anomaly_type: AnomalyType,
    confidence: float,
    explanation: str,
) -> Detection:
    confidence = round(max(0.01, min(0.99, confidence)), 4)
    return Detection(
        flow_id=flow.id,
        detection_method=method,
        is_anomaly=True,
        anomaly_type=anomaly_type.value,
        confidence=confidence,
        severity=severity_from_score(confidence).value,
        explanation=explanation,
    )