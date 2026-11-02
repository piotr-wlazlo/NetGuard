from dataclasses import dataclass
from ipaddress import ip_address
from typing import Sequence

from netguard.detection.detectors.base import Verdict
from netguard.domain import AnomalyType, Severity

SEVERITY_SATURATION = 3.0
EXPOSURE_PROTECTED = 1.0
EXPOSURE_OTHER = 0.7

CONFIDENCE_WEIGHTS = {"margin": 0.35, "agreement": 0.25, "maturity": 0.25, "quality": 0.15}


@dataclass(frozen=True)
class MergedVerdict:
    anomaly_type: str
    magnitude: float
    margin: float
    maturity: float
    methods: tuple
    verdicts: tuple


def merge(verdicts: Sequence[Verdict], impact) -> MergedVerdict:
    if not verdicts:
        raise ValueError("Nothing to merge.")
    chosen = max(verdicts, key=lambda v: (impact[AnomalyType(v.anomaly_type)], v.magnitude))
    return MergedVerdict(
        anomaly_type=chosen.anomaly_type,
        magnitude=chosen.magnitude,
        margin=chosen.margin,
        maturity=chosen.maturity,
        methods=tuple(v.method for v in verdicts if v.anomaly_type == chosen.anomaly_type),
        verdicts=tuple(verdicts),
    )


def exposure(destination_ip, protected_cidrs):
    address = ip_address(destination_ip)
    if any(address in network for network in protected_cidrs):
        return EXPOSURE_PROTECTED
    return EXPOSURE_OTHER


def risk_score(anomaly_type, magnitude, destination_ip, config):
    severity_factor = min(1.0, magnitude / SEVERITY_SATURATION)
    value = (
        100 * config.impact[AnomalyType(anomaly_type)] * severity_factor
        * exposure(destination_ip, config.protected_cidrs)
    )
    return round(min(100.0, value), 2)


def severity(risk) -> Severity:
    if risk < 20:
        return Severity.INFO
    if risk < 40:
        return Severity.LOW
    if risk < 60:
        return Severity.MEDIUM
    if risk < 80:
        return Severity.HIGH
    return Severity.CRITICAL


def confidence(margin, agreeing, covering, maturity, data_quality):
    w = CONFIDENCE_WEIGHTS
    agreement = min(1.0, agreeing / covering) if covering else 0.0
    value = (
        w["margin"] * min(1.0, max(0.0, margin)) + w["agreement"] * agreement
        + w["maturity"] * min(1.0, max(0.0, maturity)) + w["quality"] * min(1.0, max(0.0, data_quality))
    )
    return round(min(1.0, max(0.0, value)), 4)
