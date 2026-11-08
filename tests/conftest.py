from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
import netguard.model  # noqa: F401
from netguard.model.network_flow import NetworkFlow

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def db_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(db_engine):
    with Session(db_engine) as session:
        yield session


@pytest.fixture
def client(db_engine):
    from fastapi.testclient import TestClient
    from netguard.api import dependencies
    from netguard.api.main import app
    from netguard.services import DetectionService

    detection = DetectionService()

    def override_get_session():
        with Session(db_engine) as session:
            yield session

    app.dependency_overrides = {
        dependencies.get_detection_service: lambda: detection,
        dependencies.get_session: override_get_session,
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides = {}

def packet(dport=80, offset=0.0, src="10.0.0.1", dst="192.168.10.50", sport=40000, length=60, protocol="TCP"):
    return {
        "source_type": "pcap",
        "source_name": "test.pcap",
        "protocol": protocol,
        "source_ip": src,
        "source_port": sport,
        "destination_ip": dst,
        "destination_port": dport,
        "timestamp": (T0 + timedelta(seconds=offset)).isoformat(),
        "packet_length": length,
    }


def make_flow(src="10.0.0.1", dst="192.168.10.50", sport=40000, dport=80, protocol="TCP",
              offset=0.0, packets=2, bytes_=120, duration=10.0):
    start = T0 + timedelta(seconds=offset)
    return NetworkFlow(
        source_type="pcap",
        source_name="test.pcap",
        source_ip=src,
        destination_ip=dst,
        source_port=sport,
        destination_port=dport,
        protocol=protocol,
        packet_count=packets,
        byte_count=bytes_,
        start_time=start,
        end_time=start + timedelta(milliseconds=duration),
        duration_ms=duration,
    )