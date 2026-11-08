def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_detection_config(client):
    response = client.get("/api/v1/detection/config")
    assert response.status_code == 200
    body = response.json()
    assert body["batch_size"] == 5000
    assert body["parameters"]["common"]["port_scan_min_ports"] == 100.0
    assert body["parameters"]["common"]["brute_force_min_attempts"] == 20.0
    assert body["parameters"]["common"]["ddos_min_sources"] == 200.0
    assert set(body["anomaly_types"]) == {"PORT_SCAN", "BRUTE_FORCE", "DDOS"}


def test_replace_detection_config(client):
    payload = {
        "common": {"port_scan_min_ports": 25, "batch_size": 1000},
        "statistical": {"z_threshold": 4.5},
    }
    response = client.put("/api/v1/detection/config", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["batch_size"] == 1000
    assert body["parameters"]["common"]["port_scan_min_ports"] == 25.0
    assert body["parameters"]["statistical"]["z_threshold"] == 4.5


def test_replace_detection_config_rejects_unknown_parameter(client):
    response = client.put(
        "/api/v1/detection/config", json={"common": {"non_existent_param": 10}}
    )
    assert response.status_code == 422


def test_replace_detection_config_rejects_negative_value(client):
    response = client.put(
        "/api/v1/detection/config", json={"common": {"port_scan_min_ports": -5}}
    )
    assert response.status_code == 422


def test_reset_detection_config(client):
    client.put("/api/v1/detection/config", json={"common": {"port_scan_min_ports": 15}})
    reset_resp = client.post("/api/v1/detection/reset")
    assert reset_resp.status_code == 204

    body = client.get("/api/v1/detection/config").json()
    assert body["parameters"]["common"]["port_scan_min_ports"] == 100.0