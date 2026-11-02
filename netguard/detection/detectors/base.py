from dataclasses import dataclass, field
from typing import Optional, Protocol

from netguard.detection.baseline import Baseline
from netguard.detection.windowing import WindowContext
from netguard.domain import DetectionConfig, Flow


@dataclass(frozen=True)
class Verdict:
    anomaly_type: str
    magnitude: float
    method: str
    margin: float
    summary: str
    evidence: dict = field(default_factory=dict)
    maturity: float = 1.0


@dataclass
class DetectionContext:
    config: DetectionConfig
    baseline: Baseline
    tumbling: WindowContext
    sliding: WindowContext


class Detector(Protocol):
    name: str

    def prepare(self, context: DetectionContext, flows=()) -> None: ...

    def covers(self, flow: Flow, context: DetectionContext) -> bool:
        ...

    def evaluate(self, flow: Flow, context: DetectionContext) -> Optional[Verdict]: ...
