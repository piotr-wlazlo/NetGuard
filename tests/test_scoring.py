import math

import pytest

from netguard.detection import scoring
from netguard.detection.detectors.base import Verdict
from netguard.domain import DetectionConfig, Severity


def verdict(kind, magnitude=5.0, method="rules"):
    return Verdict(kind, magnitude, method, 1 - math.exp(-(magnitude - 1)), "s")


def test_merge_picks_highest_impact_type_and_only_agreeing_methods():
    merged = scoring.merge([verdict("PORT_SCAN"), verdict("STAT_OUTLIER", 9, "statistical")],
                           DetectionConfig().impact)

    assert merged.anomaly_type == "PORT_SCAN"
    assert merged.methods == ("rules",) and len(merged.verdicts) == 2
    with pytest.raises(ValueError):
        scoring.merge([], DetectionConfig().impact)


def test_risk_score():
    from ipaddress import ip_network
    config = DetectionConfig(protected_cidrs=(ip_network("192.168.10.0/24"),))

    assert scoring.risk_score("PORT_SCAN", 9.8, "192.168.10.50", config) == 60.0
    assert scoring.risk_score("PORT_SCAN", 9.8, "8.8.8.8", config) == 42.0
    assert scoring.risk_score("SYN_FLOOD", 42, "192.168.10.50", config) == 90.0
    assert scoring.risk_score("PORT_SCAN", 1.0, "192.168.10.50", config) == 20.0


@pytest.mark.parametrize("risk, level", [
    (0, Severity.INFO), (20, Severity.LOW), (40, Severity.MEDIUM), (60, Severity.HIGH), (80, Severity.CRITICAL),
])
def test_severity_levels(risk, level):
    assert scoring.severity(risk) is level


@pytest.mark.parametrize("margin, agreeing, covering, maturity, quality, expected", [
    (1.0, 1, 1, 1.0, 1.0, 1.0),
    (0.8, 1, 2, 1.0, 1.0, 0.805),
    (0.4, 1, 2, 0.5, 1.0, 0.54),
    (0.1, 1, 2, 1.0, 0.5, 0.485),
    (0, 0, 0, 0, 0, 0.0),
])
def test_confidence(margin, agreeing, covering, maturity, quality, expected):
    assert scoring.confidence(margin, agreeing, covering, maturity, quality) == pytest.approx(expected, abs=1e-3)
