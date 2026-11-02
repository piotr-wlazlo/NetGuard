import random
from datetime import timedelta
from ipaddress import ip_network

import pytest

from netguard.detection.detectors.rules import RulesDetector
from netguard.detection.engine import DetectionEngine
from netguard.detection.factory import build_detectors
from netguard.domain import DetectionConfig
from tests.helpers import T0, make_flow

CONFIG = DetectionConfig(protected_cidrs=(ip_network("192.168.10.0/24"),))


def scan_flows(count=150, offset=1.0):
    return [make_flow(dport=p, offset=offset + p * 0.01) for p in range(1, count + 1)]


class FakeStorage:
    def __init__(self):
        self.flows, self.detections = [], []

    def save_flows(self, flows):
        for f in flows:
            self.flows.append(f)
            f.id = len(self.flows)

    def save_detections(self, detections):
        self.detections.extend(detections)


def test_port_scan_reports_scan_flows_only_and_stores_everything():
    dns = make_flow(protocol="UDP", dport=53, syn=0, rst=0, offset=5)
    storage = FakeStorage()
    results = list(DetectionEngine(CONFIG, storage=storage).detect(scan_flows() + [dns]))

    assert len(storage.flows) == 151 and len(storage.detections) == 150
    assert len(results) == 150 and {r.detection.anomaly_type for r in results} == {"PORT_SCAN"}
    first = results[0]
    assert first.detection.flow_id == first.flow.id
    assert first.detection.severity == "LOW"
    assert first.detection.detection_method == "rules"
    assert 0.7 < first.detection.confidence < 0.85
    text, _, evidence = first.detection.explanation.partition("\n")
    assert "150 ports" in text and '"group_key"' in evidence


def test_windows_are_processed_in_time_order_and_slow_scan_spans_them():
    flows = [make_flow(dport=m * 40 + p, offset=m * 60 + p * 0.1 + 1) for m in range(4) for p in range(1, 41)]
    results = list(DetectionEngine().detect(reversed(flows)))

    assert results and {r.detection.anomaly_type for r in results} == {"PORT_SCAN"}
    assert [r.window_start for r in results] == sorted(r.window_start for r in results)


def test_baseline_not_updated_from_anomalous_hosts():
    engine = DetectionEngine()
    list(engine.detect(scan_flows()))

    assert engine.baseline.n_windows(("host", "10.0.0.1")) == 0
    assert engine.baseline.n_windows(("svc", "TCP/80")) == 0


def test_benign_long_sessions_are_not_ddos_during_an_attack():
    flood = [make_flow(src=f"10.{i // 250}.{i % 250}.1", packets=1, offset=1 + i * 0.01) for i in range(1500)]
    benign = [make_flow(src=f"172.20.0.{i}", packets=20, syn=1, ack=19, rst=0, fin=1, duration=8000,
                        bwd_bytes=5000, bwd_packets=10, offset=5 + i) for i in range(1, 6)]
    results = list(DetectionEngine(CONFIG).detect(flood + benign))

    assert results and not any(r.flow.source_ip.startswith("172.20.") for r in results)


# ML strategy
def benign_flows(n=600, seed=0, span=600):
    rng = random.Random(seed)
    return [make_flow(src=f"10.0.0.{rng.randint(1, 5)}", sport=30000 + i, dport=80,
                      offset=rng.uniform(0, span), packets=rng.randint(8, 10), bytes_=rng.randint(1000, 1200),
                      syn=1, ack=5, rst=0, fin=1, fwd_bytes=600, bwd_bytes=1500, bwd_packets=4,
                      duration=rng.uniform(100, 150)) for i in range(n)]


def weird_flow():
    return make_flow(src="172.16.0.1", dport=31337, packets=90000, bytes_=90_000_000, syn=0, ack=0,
                     rst=0, fin=0, fwd_bytes=90_000_000, bwd_bytes=0, duration=900_000, offset=30)


@pytest.fixture(scope="module")
def model():
    pytest.importorskip("sklearn")
    from netguard.detection.detectors.ml import train_isolation_forest
    return train_isolation_forest(benign_flows())


def test_ml_scores_outlier_higher_and_validates_training(model):
    from netguard.detection.detectors.ml import IsolationForestDetector, train_isolation_forest
    from netguard.detection.baseline import Baseline
    from netguard.detection.detectors.base import DetectionContext
    from netguard.detection.windowing import build_context

    normal, weird = benign_flows(40, seed=5, span=59), weird_flow()
    tumbling = build_context(normal + [weird])
    context = DetectionContext(DetectionConfig(), Baseline(), tumbling, tumbling)
    detector = IsolationForestDetector(model)
    detector.prepare(context, normal + [weird])

    assert detector._scores[id(weird)] > max(detector._scores[id(f)] for f in normal)
    assert detector.evaluate(weird, context).anomaly_type == "STAT_OUTLIER"
    with pytest.raises(ValueError):
        train_isolation_forest(benign_flows(5))


def test_engine_with_ml_strategy_counts_only_same_type_as_agreement(model, tmp_path):
    from netguard.detection.detectors.ml import IsolationForestDetector
    path = tmp_path / "m.joblib"
    IsolationForestDetector.save(model, path)
    detectors = build_detectors(str(path))
    assert [d.name for d in detectors] == ["rules", "statistical", "ml"]

    engine = DetectionEngine(detectors=[RulesDetector(), detectors[2]])
    results = [r for r in engine.detect(benign_flows(40, seed=9, span=59) + [weird_flow()])
               if r.flow.source_ip == "172.16.0.1"]

    assert results
    assert results[0].detection.detection_method == "rules"
    assert '"method": "ml"' in results[0].detection.explanation
    assert results[0].detection.confidence < 0.8


def test_pipeline_packets_to_alerts():
    from netguard.flow_worker import analyze

    def syn(port, second):
        return {"source_type": "pcap", "source_name": "t", "protocol": "TCP", "source_ip": "10.0.0.1",
                "source_port": 40000, "destination_ip": "192.168.10.50", "destination_port": port,
                "timestamp": (T0 + timedelta(seconds=second)).isoformat(), "packet_length": 60, "tcp_flags": "S"}

    packets = [syn(port, port * 0.01) for port in range(1, 151)]

    flow_count, alerts = analyze(packets)

    assert flow_count == 150
    assert [a.title for a in alerts] == ["PORT_SCAN 10.0.0.1 → 192.168.10.50"]


def test_pipeline_orders_and_validates_stream_packets():
    from netguard.flow_worker import analyze

    def syn(port, second):
        return {"source_type": "pcap", "source_name": "t", "protocol": "TCP", "source_ip": "10.0.0.1",
                "source_port": 40000, "destination_ip": "192.168.10.50", "destination_port": port,
                "timestamp": (T0 + timedelta(seconds=second)).isoformat(), "packet_length": 60, "tcp_flags": "S"}

    packets = [syn(port, port * 0.01) for port in range(1, 151)]
    packets.reverse()
    packets.append({**packets[0], "source_ip": "not-an-ip"})
    packets.append({"type": "garbage"})

    flow_count, alerts = analyze(packets)

    assert flow_count == 150
    assert [a.title for a in alerts] == ["PORT_SCAN 10.0.0.1 → 192.168.10.50"]
