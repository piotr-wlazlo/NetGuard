
from datetime import datetime
from ipaddress import IPv4Address
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from netguard.domain import AlertStatus, Flow, Priority


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


class AlertOut(BaseModel):
    id: int | None
    title: str
    description: str
    priority: Priority
    group_key: str
    detection_id: int | None
    risk_score: float
    status: AlertStatus


class AnalysisResponse(BaseModel):
    flow_count: int
    detection_count: int
    alert_count: int
    detections: list[DetectionOut]
    alerts: list[AlertOut]
