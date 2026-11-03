from dataclasses import asdict

from tests.conftest import to_json
from tests.helpers import make_flow

URL = "/api/v1/analysis/flows"


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_normal_flow(client):
    flow = to_json(asdict(make_flow(dport=80, syn=1, ack=5, rst=0, packets=10)))

    response = client.post(URL, json={"flows": [flow]})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["flow_count"] == 1
    assert body["detection_count"] == 0
    assert body["alerts"] == []


def test_empty_batch_rejected(client):
    assert client.post(URL, json={"flows": []}).status_code == 422


def test_end_time_before_start_time_rejected(client):
    flow = to_json(asdict(make_flow()))
    flow["end_time"] = "2025-12-31T23:59:59+00:00"

    response = client.post(URL, json={"flows": [flow]})

    assert response.status_code == 422
    assert any("end_time must not precede start_time" in e["msg"] for e in response.json()["detail"])


def test_too_many_flows_rejected(client):
    flow = to_json(asdict(make_flow()))

    response = client.post(URL, json={"flows": [flow] * 1001})

    assert response.status_code == 422
    assert any("1000" in e["msg"] for e in response.json()["detail"])


def test_invalid_port_rejected(client):
    flow = to_json(asdict(make_flow()))
    flow["destination_port"] = 70000

    response = client.post(URL, json={"flows": [flow]})

    assert response.status_code == 422
    assert any(e["loc"][-1] == "destination_port" for e in response.json()["detail"])


CONFIG_URL = "/api/v1/detection/config"


def test_patch_window_inversion_rejected_and_config_unchanged(client):
    before = client.get(CONFIG_URL).json()

    response = client.patch(CONFIG_URL, json={"window_seconds": 600})

    assert response.status_code == 422
    after = client.get(CONFIG_URL)
    assert after.status_code == 200
    assert after.json() == before


def test_patch_null_value_rejected(client):
    assert client.patch(CONFIG_URL, json={"z_threshold": None}).status_code == 422


def test_patch_empty_body_rejected(client):
    assert client.patch(CONFIG_URL, json={}).status_code == 422


def test_replace_detection_config_negative_value(client):
    payload = client.get(CONFIG_URL).json()
    payload = {k: payload[k] for k in (
        "port_scan_min_ports", "host_sweep_min_hosts", "syn_flood_min_syns",
        "syn_flood_half_open_ratio", "ddos_min_sources", "exfiltration_min_bytes",
        "exfiltration_min_ratio", "z_threshold", "min_baseline_windows", "mad_floor",
        "window_seconds", "sliding_window_seconds", "ml_score_threshold",
    )}
    payload["port_scan_min_ports"] = -1

    response = client.put(CONFIG_URL, json=payload)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "port_scan_min_ports"
