from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from netguard.domain import AnomalyType
from netguard.model.detection_config import DetectionConfig

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