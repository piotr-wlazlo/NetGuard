import dataclasses
import threading
from ipaddress import ip_network
from typing import Callable, Iterable

from netguard.detection.engine import DetectionEngine
from netguard.domain import AnomalyType, DetectionConfig, DetectionResult, Flow
from netguard.services.errors import InvalidConfigError

_NON_THRESHOLD_FIELDS = {"impact", "protected_cidrs"}
_THRESHOLD_FIELDS = {f.name for f in dataclasses.fields(DetectionConfig)} - _NON_THRESHOLD_FIELDS
_WINDOW_FIELDS = ("window_seconds", "sliding_window_seconds")


class DetectionService:
    def __init__(self, config: DetectionConfig | None = None):
        self._lock = threading.Lock()
        self._engine = DetectionEngine(config or DetectionConfig())

    @property
    def config(self) -> DetectionConfig:
        with self._lock:
            return self._engine.config

    def detect(self, flows: Iterable[Flow]) -> tuple[list[DetectionResult], DetectionConfig]:
        with self._lock:
            config = self._engine.config
            return list(self._engine.detect(flows)), config

    def replace_thresholds(self, values: dict) -> DetectionConfig:
        return self.patch_thresholds(values)

    def patch_thresholds(self, values: dict) -> DetectionConfig:
        unknown = set(values) - _THRESHOLD_FIELDS
        if unknown:
            raise InvalidConfigError(f"Unknown threshold fields: {sorted(unknown)}.")
        return self._update(lambda old: values)

    def patch_impact(self, weights: dict) -> DetectionConfig:
        converted = {AnomalyType(k): float(v) for k, v in weights.items()}
        return self._update(lambda old: {"impact": {**old.impact, **converted}})

    def set_protected_networks(self, cidrs: list[str]) -> DetectionConfig:
        networks = tuple(ip_network(c, strict=False) for c in cidrs)
        return self._update(lambda old: {"protected_cidrs": networks})

    def reset(self) -> None:
        with self._lock:
            self._engine = DetectionEngine(self._engine.config)

    def _update(self, changes: Callable[[DetectionConfig], dict]) -> DetectionConfig:
        with self._lock:
            old = self._engine.config
            new = dataclasses.replace(old, **changes(old))
            if new.sliding_window_seconds < new.window_seconds:
                raise InvalidConfigError("sliding_window_seconds must be >= window_seconds")
            if any(getattr(old, f) != getattr(new, f) for f in _WINDOW_FIELDS):
                self._engine = DetectionEngine(new)
            else:
                self._engine.config = new
            return new
