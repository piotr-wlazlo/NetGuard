from typing import Iterable, Iterator, Optional, Protocol, Sequence

from netguard.domain import Detection, DetectionResult, Flow


class FlowSource(Protocol):
    def __iter__(self) -> Iterator[Flow]: ...


class DetectionStorage(Protocol):
    def save_flows(self, flows: Sequence[Flow]) -> list: ...

    def save_detections(self, detections: Sequence[Detection]) -> list: ...


class DetectionResults(Protocol):
    def detect(self, flows: Iterable[Flow]) -> Iterator[DetectionResult]: ...
