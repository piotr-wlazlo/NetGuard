import io

import pytest
from redis.exceptions import RedisError
from scapy.all import ICMP, IP, TCP, Ether, wrpcap
from sqlmodel import Session

from netguard.api.dependencies import get_pcap_service
from netguard.api.main import app
from netguard.data_processing.redis_conn import create_redis_client
from netguard.services import pcap_service as pcap_module
from netguard.services.pcap_service import PcapService

URL = "/api/v1/analysis/pcap"


@pytest.fixture(scope="module")
def redis_available():
    client = create_redis_client()
    client.connection_pool.connection_kwargs.update(socket_connect_timeout=1)
    try:
        client.ping()
    except RedisError:
        pytest.skip("Redis not available (docker compose up -d redis)")
    finally:
        client.close()


@pytest.fixture
def pcap_client(client, db_engine):
    app.dependency_overrides[get_pcap_service] = lambda: PcapService(session_factory=lambda: Session(db_engine))
    return client


def pcap_bytes(packets, tmp_path) -> bytes:
    path = tmp_path / "capture.pcap"
    wrpcap(str(path), packets)
    return path.read_bytes()


def port_scan_packets(ports=120):
    packets = []
    for i, port in enumerate(range(1000, 1000 + ports)):
        p = Ether() / IP(src="10.0.0.1", dst="192.168.1.10") / TCP(sport=40000, dport=port, flags="S")
        p.time = 1700000000 + i * 0.01
        packets.append(p)
    return packets


def upload(client, content: bytes, method="rules", name="capture.pcap"):
    return client.post(URL, params={"method": method}, files={"file": (name, io.BytesIO(content), "application/octet-stream")})


def test_pcap_port_scan_creates_detection_and_alert(pcap_client, redis_available, tmp_path):
    response = upload(pcap_client, pcap_bytes(port_scan_packets(), tmp_path))

    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "queued"
    assert job["filename"] == "capture.pcap"

    # TestClient uruchamia zadania w tle przed zwróceniem odpowiedzi, więc wynik jest już gotowy
    result = pcap_client.get(f"{URL}/{job['job_id']}").json()
    assert result["status"] == "done", result["error"]
    assert result["packets_sent"] == 120
    assert result["detections_by_type"] == {"PORT_SCAN": 120}
    assert result["alert_count"] == 1
    assert len(result["alert_ids"]) == 1
    assert result["duration_ms"] is not None

    alerts = pcap_client.get("/api/v1/alerts").json()
    assert [a["id"] for a in alerts] == result["alert_ids"]


def test_pcap_counts_skipped_packets_and_removes_stream(pcap_client, redis_available, tmp_path):
    packets = [Ether() / IP(src="10.0.0.1", dst="10.0.0.2") / ICMP()]
    packets += [Ether() / IP(src="10.0.0.1", dst="10.0.0.2", proto=47)]  # GRE: poza TCP/UDP/ICMP
    for i, p in enumerate(packets):
        p.time = 1700000000 + i

    job = upload(pcap_client, pcap_bytes(packets, tmp_path)).json()
    result = pcap_client.get(f"{URL}/{job['job_id']}").json()

    assert result["status"] == "done"
    assert result["packets_sent"] == 1
    assert result["packets_skipped"] == 1
    assert result["detection_count"] == 0
    client = create_redis_client()
    try:
        assert not client.exists(f"netguard:packets:{job['job_id']}")
    finally:
        client.close()


def test_pcap_rejects_non_pcap_file(pcap_client):
    response = upload(pcap_client, b"to nie jest plik pcap", name="notes.txt")

    assert response.status_code == 422
    assert "PCAP" in response.json()["detail"]


def test_pcap_rejects_too_large_file(pcap_client, tmp_path, monkeypatch):
    monkeypatch.setattr(pcap_module, "MAX_PCAP_BYTES", 10)
    monkeypatch.setattr(pcap_module.save_upload, "__defaults__", (10,))

    response = upload(pcap_client, pcap_bytes(port_scan_packets(5), tmp_path))

    assert response.status_code == 413


def test_pcap_rejects_unknown_method(pcap_client, tmp_path):
    response = upload(pcap_client, pcap_bytes(port_scan_packets(5), tmp_path), method="magic")

    assert response.status_code == 422


def test_pcap_unknown_job_returns_404(pcap_client, redis_available):
    response = pcap_client.get(f"{URL}/nie-ma-takiego")

    assert response.status_code == 404
