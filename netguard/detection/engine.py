from collections import defaultdict, deque
from typing import Iterable, Iterator, Optional

from netguard.detection import scoring
from netguard.detection.baseline import Baseline
from netguard.detection.detectors.base import DetectionContext
from netguard.detection.detectors.rules import RulesDetector
from netguard.detection.detectors.statistical import (
    HOST_FEATURES, SERVICE_FEATURES, log_value, service_key, StatisticalDetector,
)
from netguard.detection.explanation import build_explanation
from netguard.detection.windowing import build_context, group_by_window, window_bounds
from netguard.domain import Detection, DetectionConfig, DetectionResult, Flow


class DetectionEngine:
    def __init__(self, config: Optional[DetectionConfig] = None, detectors=None,
                 storage=None, data_quality: float = 1.0):
        self.config = config or DetectionConfig()
        self.detectors = detectors if detectors is not None else [RulesDetector(), StatisticalDetector()]
        self.storage = storage
        self.data_quality = data_quality
        self.baseline = Baseline()
        self._history = deque()

    def detect(self, flows: Iterable[Flow]) -> Iterator[DetectionResult]:
        for index, window_flows in group_by_window(flows, self.config.window_seconds):
            yield from self._process_window(index, window_flows)

    def _process_window(self, index, flows):
        cfg = self.config
        window = window_bounds(index, cfg.window_seconds)

        sliding_windows = max(1, cfg.sliding_window_seconds // cfg.window_seconds)
        history = [f for i, fs in self._history if index - i < sliding_windows for f in fs]
        tumbling = build_context(flows)
        context = DetectionContext(cfg, self.baseline, tumbling, build_context(history + flows))

        if self.storage is not None:
            self.storage.save_flows(flows)
        for detector in self.detectors:
            detector.prepare(context, flows)

        results, flagged = [], []
        for flow in flows:
            decision = self._classify(flow, context, window)
            if decision is not None:
                results.append(DetectionResult(decision[0], flow, decision[1], *window))
                flagged.append(flow)

        if self.storage is not None:
            self.storage.save_detections([r.detection for r in results])

        self._update_baseline(flows, tumbling, flagged)
        self._history.append((index, flows))
        while self._history and index - self._history[0][0] >= sliding_windows:
            self._history.popleft()
        yield from results

    def _classify(self, flow, context, window):
        cfg = self.config
        verdicts = [v for d in self.detectors if (v := d.evaluate(flow, context)) is not None]
        if not verdicts:
            return None

        merged = scoring.merge(verdicts, cfg.impact)
        risk = scoring.risk_score(merged.anomaly_type, merged.magnitude, flow.destination_ip, cfg)
        baseline_windows = self.baseline.n_windows(("host", flow.source_ip))
        covering = sum(1 for d in self.detectors if d.covers(flow, context))
        conf = scoring.confidence(
            merged.margin, len(merged.methods), max(covering, len(merged.methods)),
            merged.maturity, self.data_quality,
        )
        return Detection(
            flow_id=flow.id,
            detection_method="+".join(merged.methods),
            is_anomaly=True,
            anomaly_type=merged.anomaly_type,
            confidence=conf,
            severity=scoring.severity(risk).value,
            explanation=build_explanation(flow, merged, risk, window, baseline_windows, self.data_quality),
        ), risk

    def _update_baseline(self, flows, tumbling, flagged_flows):
        flagged_services = {service_key(f) for f in flagged_flows}
        flagged_hosts = {f.source_ip for f in flagged_flows}
        flagged_dsts = {f.destination_ip for f in flagged_flows}

        by_service = defaultdict(lambda: defaultdict(list))
        for flow in flows:
            key = service_key(flow)
            if key in flagged_services:
                continue
            for name in SERVICE_FEATURES:
                by_service[key][name].append(log_value(getattr(flow, name)))
        for key, features in by_service.items():
            self.baseline.update(key, features)

        for host, stats in tumbling.src.items():
            if host not in flagged_hosts:
                self.baseline.update(
                    ("host", host), {n: [log_value(stats[n])] for n in HOST_FEATURES}
                )

        for dst, stats in tumbling.dst.items():
            if dst not in flagged_dsts:
                self.baseline.update(("dst", dst), {"packets": [log_value(stats["packets"])]})
