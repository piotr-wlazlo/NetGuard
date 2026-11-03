import pytest

from netguard.domain import AnomalyType
from netguard.services import AlertService, AnalysisService, DetectionService, InvalidConfigError, InvalidTransitionError, NotFoundError
from tests.helpers import make_flow


def port_scan(ports, dst="192.168.10.50"):
    return [make_flow(dst=dst, dport=p, offset=1 + p * 0.01) for p in range(1, ports + 1)]


def make_analysis():
    return AnalysisService(DetectionService(), AlertService())


def test_alerts_persist_across_requests():
    service = make_analysis()

    service.analyze(port_scan(150))
    second = service.analyze([make_flow(dport=80, syn=1, ack=5, rst=0, packets=10, offset=120)])

    assert second.alerts == []
    assert len(service.alerts.list()) == 1


def test_patch_thresholds_changes_detection():
    service = make_analysis()
    assert service.analyze(port_scan(25)).alerts == []

    service.detection.patch_thresholds({"port_scan_min_ports": 20})
    service.reset()

    assert len(service.analyze(port_scan(25)).alerts) == 1


def test_patch_thresholds_rejects_unknown_field():
    with pytest.raises(InvalidConfigError):
        DetectionService().patch_thresholds({"impact": {}})


def test_patch_thresholds_rejects_window_inversion():
    service = DetectionService()
    before = service.config

    with pytest.raises(InvalidConfigError):
        service.patch_thresholds({"window_seconds": 600})

    assert service.config == before


def test_window_change_clears_history_but_keeps_other_changes():
    service = make_analysis()
    service.detection.patch_thresholds({"z_threshold": 5.0})
    service.analyze(port_scan(150))
    assert len(service.alerts.list()) == 1

    config = service.detection.patch_thresholds({"window_seconds": 30})
    duplicate = service.analyze(port_scan(150))

    assert config.z_threshold == 5.0 and config.window_seconds == 30
    assert duplicate.detections  # fresh engine: earlier history no longer applies


def test_protected_networks_raise_risk():
    plain, protected = make_analysis(), make_analysis()
    protected.detection.set_protected_networks(["192.168.10.0/24"])

    plain_risk = plain.analyze(port_scan(150)).detections[0].risk_score
    protected_risk = protected.analyze(port_scan(150)).detections[0].risk_score

    assert protected_risk > plain_risk


def test_patch_impact_keeps_other_weights():
    service = DetectionService()
    before = dict(service.config.impact)

    config = service.patch_impact({"PORT_SCAN": 0.1})

    assert config.impact[AnomalyType.PORT_SCAN] == 0.1
    assert config.impact[AnomalyType.DDOS] == before[AnomalyType.DDOS]


def test_alert_service_errors():
    service = AlertService()
    alert = service.create("manual", "", "P3")
    service.change_status(alert.id, "RESOLVED")

    with pytest.raises(NotFoundError):
        service.get(99)
    with pytest.raises(InvalidTransitionError):
        service.change_status(alert.id, "NEW")


def test_concurrent_impact_patches_do_not_lose_updates():
    import threading

    service = DetectionService()
    types = [AnomalyType.PORT_SCAN, AnomalyType.DDOS, AnomalyType.SYN_FLOOD, AnomalyType.HOST_SWEEP]
    threads = [
        threading.Thread(target=service.patch_impact, args=({t.value: 0.1 + i / 100},))
        for i, t in enumerate(types)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(service.config.impact[t] == 0.1 + i / 100 for i, t in enumerate(types))
