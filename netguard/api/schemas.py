from dataclasses import asdict
from datetime import datetime
from ipaddress import IPv4Address, ip_network
from typing import Literal

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator,
)

from netguard.domain import (
    Alert, AlertStatus, AnomalyType, DetectionConfig, DetectionResult, Flow, Priority,
)


class FlowInput(BaseModel):
    """Network flow representation accepted by the HTTP API."""

    source_ip: IPv4Address
    destination_ip: IPv4Address
    source_port: int | None = Field(default=None, ge=0, le=65535)
    destination_port: int | None = Field(default=None, ge=0, le=65535)
    protocol: Literal["TCP", "UDP", "ICMP"]
    packet_count: int = Field(ge=1)
    byte_count: int = Field(ge=1)
    start_time: AwareDatetime
    end_time: AwareDatetime
    duration_ms: float = Field(ge=0)
    syn_count: int = Field(default=0, ge=0)
    ack_count: int = Field(default=0, ge=0)
    rst_count: int = Field(default=0, ge=0)
    fin_count: int = Field(default=0, ge=0)
    fwd_packets: int = Field(default=0, ge=0)
    fwd_bytes: int = Field(default=0, ge=0)
    bwd_packets: int = Field(default=0, ge=0)
    bwd_bytes: int = Field(default=0, ge=0)
    source_type: str = ""
    source_name: str = ""

    @model_validator(mode="after")
    def validate_flow(self):
        if self.end_time < self.start_time:
            raise ValueError("end_time must not precede start_time")

        if self.protocol in ("TCP", "UDP") and (
            self.source_port is None or self.destination_port is None
        ):
            raise ValueError(
                "TCP/UDP flows must include source and destination ports"
            )

        if self.protocol == "ICMP" and (
            self.source_port is not None or self.destination_port is not None
        ):
            raise ValueError("ICMP flows must not include ports")

        return self

    def to_domain(self) -> Flow:
        data = self.model_dump()
        data["source_ip"] = str(self.source_ip)
        data["destination_ip"] = str(self.destination_ip)
        return Flow(**data)


class AnalysisRequest(BaseModel):
    flows: list[FlowInput] = Field(min_length=1, max_length=1000)


class DetectionOut(BaseModel):
    source_ip: str
    destination_ip: str
    detection_method: str
    anomaly_type: str | None
    severity: str | None
    confidence: float
    explanation: str
    risk_score: float
    window_start: datetime | None
    window_end: datetime | None

    @classmethod
    def from_result(cls, result: DetectionResult) -> "DetectionOut":
        return cls(
            source_ip=result.flow.source_ip,
            destination_ip=result.flow.destination_ip,
            detection_method=result.detection.detection_method,
            anomaly_type=result.detection.anomaly_type,
            severity=result.detection.severity,
            confidence=result.detection.confidence,
            explanation=result.detection.explanation,
            risk_score=result.risk_score,
            window_start=result.window_start,
            window_end=result.window_end,
        )


class AlertOut(BaseModel):
    id: int | None
    title: str
    description: str
    priority: Priority
    group_key: str
    detection_id: int | None
    risk_score: float
    status: AlertStatus

    @classmethod
    def from_domain(cls, alert: Alert) -> "AlertOut":
        return cls(**asdict(alert))


class AnalysisResponse(BaseModel):
    flow_count: int
    detection_count: int
    alert_count: int
    detections: list[DetectionOut]
    alerts: list[AlertOut]


# --- Alerts -----------------------------------------------------------------

class AlertCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    priority: Priority


class AlertUpdate(BaseModel):
    """Full replacement of the editable alert fields (PUT)."""
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=2000)
    priority: Priority


# --- Detection config -------------------------------------------------------

class _ThresholdFields(BaseModel):
    """Names and types of the tunable thresholds, shared by input and output models."""

    port_scan_min_ports: int
    host_sweep_min_hosts: int
    syn_flood_min_syns: int
    syn_flood_half_open_ratio: float
    ddos_min_sources: int
    exfiltration_min_bytes: int
    exfiltration_min_ratio: float
    z_threshold: float
    min_baseline_windows: int
    mad_floor: float
    window_seconds: int
    sliding_window_seconds: int
    ml_score_threshold: float


class ThresholdsIn(_ThresholdFields):
    """All tunable numeric thresholds; every field required (PUT)."""
    model_config = ConfigDict(extra="forbid")

    port_scan_min_ports: int = Field(ge=1)
    host_sweep_min_hosts: int = Field(ge=1)
    syn_flood_min_syns: int = Field(ge=1)
    syn_flood_half_open_ratio: float = Field(ge=0, le=1)
    ddos_min_sources: int = Field(ge=1)
    exfiltration_min_bytes: int = Field(ge=1)
    exfiltration_min_ratio: float = Field(gt=0)
    z_threshold: float = Field(gt=0)
    min_baseline_windows: int = Field(ge=0)
    mad_floor: float = Field(gt=0)
    window_seconds: int = Field(ge=1)
    sliding_window_seconds: int = Field(ge=1)
    ml_score_threshold: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def validate_windows(self):
        if self.sliding_window_seconds < self.window_seconds:
            raise ValueError("sliding_window_seconds must be >= window_seconds")
        return self


class ProtectedNetworksIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cidrs: list[str] = Field(max_length=256)

    @field_validator("cidrs")
    @classmethod
    def validate_cidrs(cls, value):
        for cidr in value:
            try:
                ip_network(cidr, strict=False)
            except ValueError as error:
                raise ValueError(f"invalid CIDR: {cidr}") from error
        return value


class ConfigOut(_ThresholdFields):
    impact: dict[AnomalyType, float]
    protected_cidrs: list[str]
    anomaly_types: list[AnomalyType]

    @classmethod
    def from_domain(cls, config: DetectionConfig) -> "ConfigOut":
        data = asdict(config)
        data["protected_cidrs"] = [str(n) for n in config.protected_cidrs]
        data["anomaly_types"] = list(AnomalyType)
        return cls(**data)
