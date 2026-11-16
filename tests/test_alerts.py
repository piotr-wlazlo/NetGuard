import pytest
from sqlmodel import select

from netguard.alert_engine import build_alerts, confidence_label, group_key_for
from netguard.model.alert import Alert
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow
from netguard.services import DetectionService, InvalidConfigError
from netguard.services.alert_service import AlertService
from tests.conftest import packet


def flow(flow_id, src="10.0.0.1", dst="192.168.10.50"):
    return NetworkFlow(id=flow_id, source_ip=src, destination_ip=dst, destination_port=80, protocol="TCP")


def detection(det_id, flow_id, kind="PORT_SCAN", severity="HIGH", confidence=0.5):
    return Detection(id=det_id, flow_id=flow_id, detection_method="rules", is_anomaly=True,
                     anomaly_type=kind, severity=severity, confidence=confidence,
                     explanation=f"{kind} summary")


def scan_packets(ports=150):
    return [packet(dport=port, offset=port * 0.01) for port in range(1, ports + 1)]


# --- alert_engine (bez bazy) ---

def test_confidence_label():
    assert confidence_label(0.7) == "high"
    assert confidence_label(0.4) == "medium"
    assert confidence_label(0.39) == "low"


def test_one_alert_per_group_from_strongest_detection():
    pairs = [(detection(i, i), flow(i)) for i in range(1, 6)]
    pairs[3] = (detection(99, 4, severity="CRITICAL", confidence=0.95), flow(4))

    alerts = build_alerts(pairs, set())

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.detection_id == 99
    assert alert.priority == "CRITICAL"
    assert alert.status == "NEW"
    assert alert.created_at is not None
    assert alert.group_key == "PORT_SCAN|10.0.0.1|192.168.10.50"
    assert alert.title == "PORT_SCAN 10.0.0.1 → 192.168.10.50"
    assert alert.description == "5 flows, PORT_SCAN summary, confidence high (0.95)"


def test_ddos_groups_all_sources_together():
    pairs = [(detection(1, 1, kind="DDOS"), flow(1, src="1.1.1.1")),
             (detection(2, 2, kind="DDOS"), flow(2, src="2.2.2.2"))]

    alerts = build_alerts(pairs, set())

    assert [a.title for a in alerts] == ["DDOS multiple sources → 192.168.10.50"]
    assert group_key_for(*pairs[0]) == "DDOS|*|192.168.10.50"


def test_group_with_open_alert_is_skipped():
    pairs = [(detection(1, 1), flow(1)), (detection(2, 2), flow(2, dst="10.9.9.9"))]

    alerts = build_alerts(pairs, {"PORT_SCAN|10.0.0.1|192.168.10.50"})

    assert [a.group_key for a in alerts] == ["PORT_SCAN|10.0.0.1|10.9.9.9"]


def test_no_detections_no_alerts():
    assert build_alerts([], set()) == []


# --- alert_service (baza + dane z silnika detekcji) ---

def detect_scan(session):
    return DetectionService().detect(session, scan_packets())


def test_generate_creates_alert_from_engine_detections(session):
    detections = detect_scan(session)

    alerts = AlertService().generate(session, detections)

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.id is not None
    assert alert.group_key == "PORT_SCAN|10.0.0.1|192.168.10.50"
    assert alert.status == "NEW"
    assert alert.detection_id in {d.id for d in detections}
    assert alert.description.startswith("150 flows")
    assert session.exec(select(Alert)).all() == [alert]


def test_generate_ignores_detections_outside_given_list(session):
    service = AlertService()
    first = detect_scan(session)
    other = DetectionService().detect(
        session, [packet(dport=p, offset=p * 0.01, src="10.0.0.2") for p in range(1, 151)]
    )
    later = detect_scan(session)

    alerts = service.generate(session, [first[0], later[-1]])

    assert len(other) == 150
    assert [a.group_key for a in alerts] == ["PORT_SCAN|10.0.0.1|192.168.10.50"]
    assert alerts[0].description.startswith("2 flows")


def test_open_alert_prevents_duplicate(session):
    service = AlertService()
    service.generate(session, detect_scan(session))

    assert service.generate(session, detect_scan(session)) == []
    assert len(service.list(session)) == 1


def test_resolved_alert_allows_new_one(session):
    service = AlertService()
    first = service.generate(session, detect_scan(session))[0]

    resolved = service.set_status(session, first.id, "RESOLVED")
    second = service.generate(session, detect_scan(session))

    assert resolved.status == "RESOLVED"
    assert len(second) == 1
    assert [a.id for a in service.list(session, "RESOLVED")] == [first.id]
    assert [a.id for a in service.list(session, "NEW")] == [second[0].id]
    assert [a.id for a in service.list(session)] == [second[0].id, first.id]


def test_generate_without_detections(session):
    assert AlertService().generate(session, []) == []


def test_invalid_status_rejected(session):
    service = AlertService()
    alert = service.generate(session, detect_scan(session))[0]

    with pytest.raises(InvalidConfigError):
        service.set_status(session, alert.id, "DONE")
    with pytest.raises(InvalidConfigError):
        service.list(session, "DONE")


def test_get_and_delete(session):
    service = AlertService()
    alert = service.generate(session, detect_scan(session))[0]

    assert service.get(session, alert.id) is alert
    service.delete(session, alert.id)

    with pytest.raises(LookupError):
        service.get(session, alert.id)
    with pytest.raises(LookupError):
        service.delete(session, alert.id)
