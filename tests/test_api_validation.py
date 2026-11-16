URL = "/api/v1/analysis/flows"
CONFIG_URL = "/api/v1/detection/config"


def make_valid_flow():
    return {
        "source_type": "api",
        "source_name": "pytest",
        "source_ip": "192.168.1.10",
        "destination_ip": "192.168.1.20",
        "source_port": 50000,
        "destination_port": 80,
        "protocol": "TCP",
        "packet_count": 10,
        "byte_count": 1200,
        "start_time": "2026-11-14T12:00:00+00:00",
        "end_time": "2026-11-14T12:00:01+00:00",
        "duration_ms": 1000,
    }


def test_empty_batch_rejected(client):
    response = client.post(URL, json={"flows": []})

    assert response.status_code == 422


def test_end_time_before_start_time_rejected(client):
    flow = make_valid_flow()
    flow["end_time"] = "2026-11-14T11:59:59+00:00"

    response = client.post(URL, json={"flows": [flow]})

    assert response.status_code == 422
    assert any(
        "end_time must not precede start_time" in error["msg"]
        for error in response.json()["detail"]
    )


def test_too_many_flows_rejected(client):
    flow = make_valid_flow()

    response = client.post(URL, json={"flows": [flow] * 1001})

    assert response.status_code == 422
    assert any(
        "1000" in error["msg"]
        for error in response.json()["detail"]
    )


def test_invalid_port_rejected(client):
    flow = make_valid_flow()
    flow["destination_port"] = 70000

    response = client.post(URL, json={"flows": [flow]})

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == "destination_port"
        for error in response.json()["detail"]
    )


def test_replace_unknown_parameter_rejected_and_config_unchanged(client):
    before = client.get(CONFIG_URL)

    assert before.status_code == 200

    response = client.put(
        CONFIG_URL,
        json={"common": {"non_existent_param": 10}}
    )

    assert response.status_code == 422

    after = client.get(CONFIG_URL)

    assert after.status_code == 200
    assert after.json() == before.json()


def test_replace_detection_config_negative_value(client):
    response = client.put(
        CONFIG_URL,
        json={"common": {"port_scan_min_ports": -1}}
    )

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == "port_scan_min_ports"
        for error in response.json()["detail"]
    )
