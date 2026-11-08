import pytest
from sqlmodel import select
from netguard.detection.config import seed_default_config
from netguard.detection.detection_engine import DetectionEngine, build_strategy
from netguard.model.detection import Detection
from netguard.model.detection_config import DetectionConfig
from netguard.model.network_flow import NetworkFlow
from tests.conftest import packet


def scan_packets(ports=150):
    return [packet(dport=port, offset=port * 0.01) for port in range(1, ports + 1)]


@pytest.fixture
def seeded(session):
    seed_default_config(session)
    return session


def test_detect_saves_flows_and_detections(seeded):
    engine = DetectionEngine(build_strategy("rules", seeded), seeded)
    detections = list(engine.detect(scan_packets()))
    assert len(detections) == 150 and {d.anomaly_type for d in detections} == {"PORT_SCAN"}
    
    flows = seeded.exec(select(NetworkFlow)).all()
    stored = seeded.exec(select(Detection)).all()
    assert len(flows) == 150 and len(stored) == 150
    assert {d.flow_id for d in stored} == {f.id for f in flows}
    assert all(d.detected_at is not None for d in stored)


def test_batch_size_and_parameters_come_from_db(seeded):
    for row in seeded.exec(select(DetectionConfig)).all():
        if row.parameter_name == "batch_size":
            row.parameter_value = "50"
        if row.parameter_name == "port_scan_min_ports":
            row.parameter_value = "40"
    seeded.commit()

    engine = DetectionEngine(build_strategy("rules", seeded), seeded)
    detections = list(engine.detect(scan_packets(150)))
    
    assert len(detections) == 150
    assert len(seeded.exec(select(NetworkFlow)).all()) == 150


def test_normal_traffic_saves_flows_without_detections(seeded):
    packets = [packet(dport=80, offset=i, src=f"10.0.0.{i}", length=500) for i in range(1, 20)]
    engine = DetectionEngine(build_strategy("rules", seeded), seeded)
    detections = list(engine.detect(packets))
    
    assert detections == []
    assert len(seeded.exec(select(NetworkFlow)).all()) == 19
    assert seeded.exec(select(Detection)).all() == []


def test_unknown_method_rejected(seeded):
    with pytest.raises(ValueError):
        build_strategy("bogus", seeded)


def test_brute_force_detected(seeded):
    # 25 prób logowania na port 22 (SSH) z unikalnych portów źródłowych
    packets = [packet(dport=22, sport=50000 + i, offset=i * 0.1) for i in range(25)]
    engine = DetectionEngine(build_strategy("rules", seeded), seeded)
    detections = list(engine.detect(packets))
    
    assert len(detections) == 25
    assert {d.anomaly_type for d in detections} == {"BRUTE_FORCE"}


def test_ddos_detected(seeded):
    packets = [packet(dport=80, src=f"10.1.{i // 250}.{i % 250 + 1}", offset=i * 0.01) for i in range(210)]
    engine = DetectionEngine(build_strategy("rules", seeded), seeded)
    detections = list(engine.detect(packets))
    
    assert len(detections) == 210
    assert {d.anomaly_type for d in detections} == {"DDOS"}

def set_params(session, **values):
    for row in session.exec(select(DetectionConfig)).all():
        if row.parameter_name in values:
            row.parameter_value = str(values[row.parameter_name])
    session.commit()

def test_batches_are_evaluated_independently(seeded):
    set_params(seeded, batch_size=50)
    engine = DetectionEngine(build_strategy("rules", seeded), seeded)

    assert list(engine.detect(scan_packets(150))) == []
