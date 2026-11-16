from itertools import batched
from typing import Iterable, Iterator

from sqlmodel import Session

from netguard.detection.config import load_parameters
from netguard.detection.detectors.base import DetectionStrategy
from netguard.detection.detectors.ml import IsolationForestDetector
from netguard.detection.detectors.rules import RulesDetector
from netguard.detection.detectors.statistical import StatisticalDetector
from netguard.data_processing.flow_processor import extract_flow
from netguard.model.detection import Detection

STRATEGIES = {s.name: s for s in (RulesDetector, StatisticalDetector, IsolationForestDetector)}


def build_strategy(method: str, session: Session) -> DetectionStrategy:
    if method not in STRATEGIES:
        raise ValueError(f"Unknown detection method: {method}.")
    return STRATEGIES[method](load_parameters(session, method))


class DetectionEngine:
    def __init__(self, strategy: DetectionStrategy, session: Session):
        self.strategy = strategy
        self.session = session

    def detect(self, packets: Iterable[dict]) -> Iterator[Detection]:
        params = load_parameters(self.session, self.strategy.name)
        for batch in batched(extract_flow(packets), int(params["batch_size"])):
            self.session.add_all(batch)
            self.session.flush()
            detections = self.strategy.detect_anomalies(batch)
            self.session.add_all(detections)
            self.session.commit()
            yield from detections
