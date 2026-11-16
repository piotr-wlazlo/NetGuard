from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from netguard.domain import AnomalyType
from netguard.model.detection_config import DetectionConfig
from datetime import datetime
from ipaddress import IPv4Address
from typing import Literal
from pydantic import AwareDatetime, ConfigDict, model_validator

from netguard.model.network_flow import NetworkFlow
COMMON = "common"
PositiveValues = dict[str, Annotated[float, Field(gt=0)]]


class ParametersIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    common: PositiveValues = Field(default_factory=dict)
    statistical: PositiveValues = Field(default_factory=dict)
    ml: PositiveValues = Field(default_factory=dict)

    def to_values(self) -> dict[str, dict[str, float]]:
        return {COMMON: self.common, "statistical": self.statistical, "ml": self.ml}


class ConfigOut(BaseModel):
    batch_size: int
    parameters: dict[str, dict[str, float]]
    anomaly_types: list[AnomalyType]

    @classmethod
    def from_rows(cls, rows: list[DetectionConfig]) -> "ConfigOut":
        parameters: dict[str, dict[str, float]] = {}
        for row in rows:
            parameters.setdefault(row.method or COMMON, {})[row.parameter_name] = float(
                row.parameter_value
            )
        return cls(
            batch_size=int(parameters[COMMON]["batch_size"]),
            parameters=parameters,
            anomaly_types=list(AnomalyType),
        )


class FlowInput(BaseModel):
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

    source_type: str = "api"
    source_name: str = "manual"

    @model_validator(mode="after")
    def validate_flow(self):
        if self.end_time < self.start_time:
            raise ValueError("end_time must not precede start_time")

        if self.protocol in ("TCP", "UDP") and (
            self.source_port is None or self.destination_port is None
        ):
            raise ValueError("TCP/UDP flows must include ports")

        if self.protocol == "ICMP" and (
            self.source_port is not None or self.destination_port is not None
        ):
            raise ValueError("ICMP flows must not include ports")

        return self

    def to_network_flow(self) -> NetworkFlow:
        data = self.model_dump()
        data["source_ip"] = str(self.source_ip)
        data["destination_ip"] = str(self.destination_ip)
        return NetworkFlow(**data)


class AnalysisRequest(BaseModel):
    flows: list[FlowInput] = Field(min_length=1, max_length=1000)


class DetectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None
    flow_id: int | None
    detection_method: str | None
    anomaly_type: str | None
    severity: str | None
    confidence: float | None
    explanation: str | None


class AnalysisResponse(BaseModel):
    flow_count: int
    detection_count: int
    detections: list[DetectionOut]