from dataclasses import asdict
from datetime import datetime

import pytest


def to_json(value):
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_json(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from netguard.api import dependencies
    from netguard.api.main import app
    from netguard.services import AlertService, AnalysisService, DetectionService

    detection = DetectionService()
    alerts = AlertService()
    analysis = AnalysisService(detection, alerts)
    app.dependency_overrides = {
        dependencies.get_detection_service: lambda: detection,
        dependencies.get_alert_service: lambda: alerts,
        dependencies.get_analysis_service: lambda: analysis,
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides = {}


@pytest.fixture
def port_scan_payload():
    from tests.helpers import make_flow

    return {"flows": [to_json(asdict(make_flow(dport=p, offset=1 + p * 0.01))) for p in range(1, 151)]}
