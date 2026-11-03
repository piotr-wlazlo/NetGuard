import pytest

from netguard.services import AlertService, AnalysisService, DetectionService, InvalidConfigError, NotFoundError
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


def test_replace_thresholds_changes_detection():
    service = make_analysis()
    assert service.analyze(port_scan(25)).alerts == []

    service.detection.replace_thresholds({"port_scan_min_ports": 20})
    service.reset()

    assert len(service.analyze(port_scan(25)).alerts) == 1


def test_replace_thresholds_rejects_unknown_field():
    with pytest.raises(InvalidConfigError):
        DetectionService().replace_thresholds({"impact": {}})


def test_replace_thresholds_rejects_window_inversion():
    service = DetectionService()
    before = service.config

    with pytest.raises(InvalidConfigError):
        service.replace_thresholds({"window_seconds": 600})

    assert service.config == before


def test_window_change_clears_history_but_keeps_other_changes():
    service = make_analysis()
    service.detection.replace_thresholds({"z_threshold": 5.0})
    service.analyze(port_scan(150))
    assert len(service.alerts.list()) == 1

    config = service.detection.replace_thresholds({"window_seconds": 30})
    duplicate = service.analyze(port_scan(150))

    assert config.z_threshold == 5.0 and config.window_seconds == 30
    assert duplicate.detections  # fresh engine: earlier history no longer applies


def test_protected_networks_raise_risk():
    plain, protected = make_analysis(), make_analysis()
    protected.detection.set_protected_networks(["192.168.10.0/24"])

    plain_risk = plain.analyze(port_scan(150)).detections[0].risk_score
    protected_risk = protected.analyze(port_scan(150)).detections[0].risk_score

    assert protected_risk > plain_risk


def test_alert_service_delete():
    service = AlertService()
    alert = service.create("manual", "", "P3")

    service.delete(alert.id)

    assert service.list() == []
    with pytest.raises(NotFoundError):
        service.get(alert.id)
    with pytest.raises(NotFoundError):
        service.delete(alert.id)


def test_concurrent_threshold_updates_do_not_lose_updates():
    import threading

    service = DetectionService()
    updates = [{"z_threshold": 4.0}, {"ml_score_threshold": 0.7}, {"mad_floor": 0.2}, {"port_scan_min_ports": 50}]
    threads = [threading.Thread(target=service.replace_thresholds, args=(u,)) for u in updates]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    config = service.config
    assert all(getattr(config, field) == value for u in updates for field, value in u.items())
