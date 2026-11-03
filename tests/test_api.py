from dataclasses import asdict

import pytest

from tests.conftest import to_json
from tests.helpers import make_flow

THRESHOLDS = {
    "port_scan_min_ports": 20,
    "host_sweep_min_hosts": 50,
    "syn_flood_min_syns": 1000,
    "syn_flood_half_open_ratio": 0.9,
    "ddos_min_sources": 200,
    "exfiltration_min_bytes": 50_000_000,
    "exfiltration_min_ratio": 20.0,
    "z_threshold": 3.5,
    "min_baseline_windows": 30,
    "mad_floor": 0.1,
    "window_seconds": 60,
    "sliding_window_seconds": 300,
    "ml_score_threshold": 0.65,
}


@pytest.fixture
def alert_id(client, port_scan_payload):
    response = client.post("/api/v1/analysis/flows", json=port_scan_payload)
    assert response.status_code == 200, response.text
    return response.json()["alerts"][0]["id"]


# --- GET ----------------------------------------------------------------------

def test_get_detection_config(client):
    response = client.get("/api/v1/detection/config")

    assert response.status_code == 200
    body = response.json()
    assert body["port_scan_min_ports"] == 100
    assert body["protected_cidrs"] == []
    assert {"PORT_SCAN", "SYN_FLOOD", "DDOS"} <= set(body["anomaly_types"])
    assert body["impact"]["EXFILTRATION"] == 1.0


def test_get_detection_config_invalid_method(client):
    assert client.post("/api/v1/detection/config").status_code == 405


def test_list_alerts(client, alert_id):
    response = client.get("/api/v1/alerts", params={"status": "NEW", "sort": "newest"})

    assert response.status_code == 200
    assert [a["id"] for a in response.json()] == [alert_id]


def test_list_alerts_invalid_sort(client):
    assert client.get("/api/v1/alerts", params={"sort": "bogus"}).status_code == 422


def test_get_alert(client, alert_id):
    response = client.get(f"/api/v1/alerts/{alert_id}")

    assert response.status_code == 200
    assert response.json()["title"].startswith("PORT_SCAN ")


def test_get_alert_not_found(client):
    response = client.get("/api/v1/alerts/999")

    assert response.status_code == 404
    assert "999" in response.json()["detail"]


# --- POST ---------------------------------------------------------------------

def test_analyze_port_scan(client, port_scan_payload):
    response = client.post("/api/v1/analysis/flows", json=port_scan_payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["flow_count"] == 150
    assert body["detection_count"] == 150
    assert body["alert_count"] == 1
    assert body["alerts"][0]["title"].startswith("PORT_SCAN ")
    assert len(client.get("/api/v1/alerts").json()) == 1


def test_analyze_invalid_flow_rejected(client):
    flow = to_json(asdict(make_flow()))
    flow["source_ip"] = "bad-ip"

    response = client.post("/api/v1/analysis/flows", json={"flows": [flow]})

    assert response.status_code == 422


def test_create_alert(client):
    response = client.post(
        "/api/v1/alerts",
        json={"title": "Suspicious login", "description": "analyst note", "priority": "P2"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["id"] == 1
    assert body["status"] == "NEW"
    assert body["group_key"] == "manual|1"


def test_create_alert_invalid_priority(client):
    response = client.post("/api/v1/alerts", json={"title": "x", "priority": "P9"})

    assert response.status_code == 422


def test_reset_detection(client, alert_id):
    response = client.post("/api/v1/detection/reset")

    assert response.status_code == 204
    assert client.get("/api/v1/alerts").json() == []


def test_reset_detection_invalid_method(client):
    assert client.get("/api/v1/detection/reset").status_code == 405


# --- PUT ----------------------------------------------------------------------

def test_replace_detection_config(client, port_scan_payload):
    response = client.put("/api/v1/detection/config", json=THRESHOLDS)

    assert response.status_code == 200, response.text
    assert response.json()["port_scan_min_ports"] == 20

    flows = port_scan_payload["flows"][:25]
    analysis = client.post("/api/v1/analysis/flows", json={"flows": flows}).json()
    assert analysis["alert_count"] == 1


def test_replace_detection_config_missing_field(client):
    payload = {k: v for k, v in THRESHOLDS.items() if k != "z_threshold"}

    response = client.put("/api/v1/detection/config", json=payload)

    assert response.status_code == 422
    assert any(e["loc"][-1] == "z_threshold" for e in response.json()["detail"])


def test_replace_protected_networks(client):
    response = client.put(
        "/api/v1/detection/protected-networks", json={"cidrs": ["192.168.10.0/24", "10.0.0.1"]}
    )

    assert response.status_code == 200, response.text
    assert response.json()["protected_cidrs"] == ["192.168.10.0/24", "10.0.0.1/32"]


def test_replace_protected_networks_invalid_cidr(client):
    response = client.put("/api/v1/detection/protected-networks", json={"cidrs": ["not-a-cidr"]})

    assert response.status_code == 422


def test_replace_alert(client, alert_id):
    response = client.put(
        f"/api/v1/alerts/{alert_id}",
        json={"title": "Port scan from lab", "description": "known scanner", "priority": "P4"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Port scan from lab"
    assert body["priority"] == "P4"
    assert client.get(f"/api/v1/alerts/{alert_id}").json()["description"] == "known scanner"


def test_replace_alert_not_found(client):
    response = client.put(
        "/api/v1/alerts/999", json={"title": "x", "description": "", "priority": "P1"}
    )

    assert response.status_code == 404


# --- PATCH --------------------------------------------------------------------

def test_patch_detection_config(client):
    response = client.patch("/api/v1/detection/config", json={"z_threshold": 4.0})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["z_threshold"] == 4.0
    assert body["port_scan_min_ports"] == 100


def test_patch_detection_config_invalid_value(client):
    response = client.patch("/api/v1/detection/config", json={"port_scan_min_ports": 0})

    assert response.status_code == 422


def test_patch_impact(client):
    response = client.patch("/api/v1/detection/impact", json={"PORT_SCAN": 0.8})

    assert response.status_code == 200, response.text
    impact = response.json()["impact"]
    assert impact["PORT_SCAN"] == 0.8
    assert impact["DDOS"] == 0.9


def test_patch_impact_unknown_anomaly_type(client):
    response = client.patch("/api/v1/detection/impact", json={"TELEPORT": 0.5})

    assert response.status_code == 422


def test_change_alert_status(client, alert_id):
    url = f"/api/v1/alerts/{alert_id}/status"

    assert client.patch(url, json={"status": "ACKNOWLEDGED"}).json()["status"] == "ACKNOWLEDGED"
    response = client.patch(url, json={"status": "RESOLVED"})

    assert response.status_code == 200
    assert response.json()["status"] == "RESOLVED"


def test_change_alert_status_invalid_transition(client, alert_id):
    url = f"/api/v1/alerts/{alert_id}/status"
    client.patch(url, json={"status": "RESOLVED"})

    response = client.patch(url, json={"status": "NEW"})

    assert response.status_code == 409
    assert "RESOLVED" in response.json()["detail"]
