import pytest
from sqlmodel import select
from netguard.model.network_flow import NetworkFlow
from netguard.services import DetectionService, InvalidConfigError
from tests.conftest import packet


def scan_packets(ports):
    return [packet(port, port * 0.01) for port in range(1, ports + 1)]


def test_detect_persists_flows_and_detections(session):
    detections = DetectionService().detect(session, scan_packets(150))
    assert len(detections) == 150 and all(d.id is not None for d in detections)
    assert len(session.exec(select(NetworkFlow)).all()) == 150


def test_detect_rejects_unknown_method(session):
    with pytest.raises(InvalidConfigError):
        DetectionService().detect(session, scan_packets(5), method="bogus")


def test_replace_parameters_changes_detection(session):
    service = DetectionService()
    assert service.detect(session, scan_packets(25)) == []
    service.replace_parameters(session, {"common": {"port_scan_min_ports": 20}})
    assert len(service.detect(session, scan_packets(25))) == 25


def test_replace_parameters_rejects_unknown_field(session):
    service = DetectionService()
    with pytest.raises(InvalidConfigError):
        service.replace_parameters(session, {"common": {"z_threshold": 4.0}})
    with pytest.raises(InvalidConfigError):
        service.replace_parameters(session, {"ml": {"impact": 1.0}})


def test_reset_restores_defaults(session):
    service = DetectionService()
    service.replace_parameters(session, {"statistical": {"z_threshold": 9.0}})
    rows = service.reset(session)
    stat_params = {r.parameter_name: r.parameter_value for r in rows if r.method == "statistical"}
    assert stat_params["z_threshold"] == "3.5"