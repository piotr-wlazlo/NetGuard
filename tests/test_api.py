from dataclasses import asdict
from datetime import datetime

from fastapi.testclient import TestClient

from netguard.api.main import app
from tests.helpers import make_flow


client = TestClient(app)


def to_json(value):
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}

    if isinstance(value, list):
        return [to_json(v) for v in value]

    if isinstance(value, datetime):
        return value.isoformat()

    return value


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_normal_flow():
    flow = asdict(
        make_flow(dport=80, syn=1, ack=5, rst=0, packets=10)
    )

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": [to_json(flow)]}
    )

    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 1
    assert body["detection_count"] == 0
    assert body["alerts"] == []


def test_analyze_port_scan():
    flows = [
        to_json(asdict(make_flow(dport=p, offset=1 + p * 0.01)))
        for p in range(1, 151)
    ]

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": flows}
    )

    assert response.status_code == 200, response.text

    body = response.json()
    assert body["flow_count"] == 150
    assert body["detection_count"] == 150
    assert body["alert_count"] == 1
    assert body["alerts"][0]["title"].startswith("PORT_SCAN ")


def test_invalid_flow_rejected():
    flow = to_json(asdict(make_flow()))
    flow["source_ip"] = "bad-ip"

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": [flow]}
    )

    assert response.status_code == 422


def test_empty_batch_rejected():
    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": []}
    )

    assert response.status_code == 422


def test_end_time_before_start_time_rejected():
    flow = to_json(asdict(make_flow()))

    flow["end_time"] = "2025-12-31T23:59:59+00:00"

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": [flow]}
    )

    assert response.status_code == 422
    assert any(
        "end_time must not precede start_time" in error["msg"]
        for error in response.json()["detail"]
    )


def test_too_many_flows_rejected():
    flow = to_json(asdict(make_flow()))

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": [flow] * 1001}
    )

    assert response.status_code == 422
    assert any(
        "1000" in error["msg"]
        for error in response.json()["detail"]
    )


def test_invalid_port_rejected():
    flow = to_json(asdict(make_flow()))

    flow["destination_port"] = 70000

    response = client.post(
        "/api/v1/analysis/flows",
        json={"flows": [flow]}
    )

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == "destination_port"
        for error in response.json()["detail"]
    )


def test_get_detection_config():
    response = client.get("/api/v1/detection/config")

    assert response.status_code == 200

    body = response.json()
    assert body["window_seconds"] > 0
    assert body["port_scan_min_ports"] > 0
    assert body["syn_flood_min_syns"] > 0


def test_detection_config_invalid_method():
    response = client.post("/api/v1/detection/config")

    assert response.status_code == 405


def test_get_anomaly_types():
    response = client.get("/api/v1/detection/types")

    assert response.status_code == 200

    body = response.json()
    assert isinstance(body["types"], list)
    assert "PORT_SCAN" in body["types"]
    assert "SYN_FLOOD" in body["types"]
    assert "DDOS" in body["types"]


def test_anomaly_types_invalid_method():
    response = client.post("/api/v1/detection/types")

    assert response.status_code == 405
