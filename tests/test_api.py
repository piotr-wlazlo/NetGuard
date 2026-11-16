from sqlmodel import select

from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow


CONFIG_URL = "/api/v1/detection/config"
ANALYSIS_URL = "/api/v1/analysis/flows"
TYPES_URL = "/api/v1/detection/types"
RESET_URL = "/api/v1/detection/reset"


def make_api_flow(
    source_port=50000,
    destination_port=80,
    packet_count=10,
    source_ip="192.168.1.10",
    destination_ip="192.168.1.20",
):
    return {
        "source_type": "api",
        "source_name": "pytest",
        "source_ip": source_ip,
        "destination_ip": destination_ip,
        "source_port": source_port,
        "destination_port": destination_port,
        "protocol": "TCP",
        "packet_count": packet_count,
        "byte_count": 1200,
        "start_time": "2026-11-14T12:00:00+00:00",
        "end_time": "2026-11-14T12:00:01+00:00",
        "duration_ms": 1000,
    }


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_detection_config(client):
    response = client.get(CONFIG_URL)
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["batch_size"] == 5000
    assert body["parameters"]["common"]["port_scan_min_ports"] == 100.0
    assert body["parameters"]["common"]["brute_force_min_attempts"] == 20.0
    assert body["parameters"]["common"]["ddos_min_sources"] == 200.0
    assert set(body["anomaly_types"]) == {"PORT_SCAN", "BRUTE_FORCE", "DDOS"}


def test_get_anomaly_types(client):
    response = client.get(TYPES_URL)
    assert response.status_code == 200, response.text
    assert set(response.json()["types"]) == {"PORT_SCAN", "BRUTE_FORCE", "DDOS"}


def test_replace_detection_config(client):
    payload = {
        "common": {"port_scan_min_ports": 25, "batch_size": 1000},
        "statistical": {"z_threshold": 4.5},
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["batch_size"] == 1000
    assert body["parameters"]["common"]["port_scan_min_ports"] == 25.0
    assert body["parameters"]["statistical"]["z_threshold"] == 4.5

    saved = client.get(CONFIG_URL)
    assert saved.status_code == 200
    assert saved.json()["parameters"]["common"]["port_scan_min_ports"] == 25.0


def test_replace_detection_config_rejects_unknown_parameter(client):
    response = client.put(CONFIG_URL, json={"common": {"non_existent_param": 10}})
    assert response.status_code == 422


def test_replace_detection_config_rejects_negative_value(client):
    response = client.put(CONFIG_URL, json={"common": {"port_scan_min_ports": -5}})
    assert response.status_code == 422


def test_analyze_normal_flow(client, session):
    response = client.post(ANALYSIS_URL, json={"flows": [make_api_flow()]})
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 1
    assert body["detection_count"] == 0
    assert body["detections"] == []

    assert len(session.exec(select(NetworkFlow)).all()) == 1
    assert session.exec(select(Detection)).all() == []


def test_analyze_port_scan(client, session):
    update = client.put(CONFIG_URL, json={"common": {"port_scan_min_ports": 2}})
    assert update.status_code == 200, update.text

    flows = [
        make_api_flow(source_port=50000, destination_port=80, packet_count=2),
        make_api_flow(source_port=50001, destination_port=443, packet_count=2),
    ]
    response = client.post(ANALYSIS_URL, params={"method": "rules"}, json={"flows": flows})
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 2
    assert body["detection_count"] == 2
    assert len(body["detections"]) == 2
    assert {item["anomaly_type"] for item in body["detections"]} == {"PORT_SCAN"}
    assert all(item["detection_method"] == "rules" for item in body["detections"])

    stored_flows = session.exec(select(NetworkFlow)).all()
    stored_detections = session.exec(select(Detection)).all()
    assert len(stored_flows) == 2
    assert len(stored_detections) == 2
    assert {d.flow_id for d in stored_detections} == {f.id for f in stored_flows}


def test_analyze_brute_force(client, session):
    update = client.put(CONFIG_URL, json={"common": {"brute_force_min_attempts": 3}})
    assert update.status_code == 200, update.text

    flows = [
        make_api_flow(
            source_port=50000 + i,
            destination_port=22,
            packet_count=2,
        )
        for i in range(3)
    ]
    response = client.post(ANALYSIS_URL, params={"method": "rules"}, json={"flows": flows})
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 3
    assert body["detection_count"] == 3
    assert len(body["detections"]) == 3
    assert {item["anomaly_type"] for item in body["detections"]} == {"BRUTE_FORCE"}
    assert all(item["detection_method"] == "rules" for item in body["detections"])

    stored = session.exec(select(Detection)).all()
    assert len(stored) == 3
    assert {item.anomaly_type for item in stored} == {"BRUTE_FORCE"}


def test_analyze_ddos(client, session):
    update = client.put(CONFIG_URL, json={"common": {"ddos_min_sources": 3}})
    assert update.status_code == 200, update.text

    flows = [
        make_api_flow(
            source_ip=f"192.168.1.{10 + i}",
            source_port=50000 + i,
            destination_port=80,
            packet_count=10,
        )
        for i in range(3)
    ]
    response = client.post(ANALYSIS_URL, params={"method": "rules"}, json={"flows": flows})
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 3
    assert body["detection_count"] == 3
    assert len(body["detections"]) == 3
    assert {item["anomaly_type"] for item in body["detections"]} == {"DDOS"}
    assert all(item["detection_method"] == "rules" for item in body["detections"])

    stored = session.exec(select(Detection)).all()
    assert len(stored) == 3
    assert {item.anomaly_type for item in stored} == {"DDOS"}


def test_reset_detection_config(client):
    update = client.put(CONFIG_URL, json={"common": {"port_scan_min_ports": 15}})
    assert update.status_code == 200, update.text

    reset_resp = client.post(RESET_URL)
    assert reset_resp.status_code == 204, reset_resp.text

    response = client.get(CONFIG_URL)
    assert response.status_code == 200
    assert response.json()["parameters"]["common"]["port_scan_min_ports"] == 100.0
