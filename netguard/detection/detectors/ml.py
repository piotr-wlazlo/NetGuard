import math

from netguard.detection.detectors.base import Verdict
from netguard.detection.windowing import build_context, group_by_window
from netguard.domain import AnomalyType

FLOW_FEATURES = ("packet_count", "byte_count", "duration_ms", "syn_count", "ack_count",
                 "rst_count", "fin_count", "fwd_bytes", "bwd_bytes")
SRC_FEATURES = ("flow_count", "distinct_dst_ips", "distinct_dst_ports",
                "small_flow_ratio", "syn_only_ratio")
DST_FEATURES = ("distinct_src", "packets", "syn_count", "half_open_ratio")


def _scaled(name, value):
    return float(value) if name.endswith("_ratio") else math.log1p(max(float(value), 0.0))


def feature_vector(flow, tumbling):
    src = tumbling.src.get(flow.source_ip, {})
    dst = tumbling.dst.get(flow.destination_ip, {})
    row = [_scaled(n, getattr(flow, n)) for n in FLOW_FEATURES]
    row += [_scaled(n, src.get(n, 0.0)) for n in SRC_FEATURES]
    row += [_scaled(n, dst.get(n, 0.0)) for n in DST_FEATURES]
    row.append((flow.destination_port or 0) / 65535)
    return row


def training_matrix(flows, window_seconds=60):
    rows = []
    for _, window_flows in group_by_window(flows, window_seconds):
        context = build_context(window_flows)
        rows.extend(feature_vector(f, context) for f in window_flows)
    return rows


def train_isolation_forest(flows, window_seconds=60, random_state=0, n_estimators=200,
                           contamination="auto"):
    from sklearn.ensemble import IsolationForest
    rows = training_matrix(flows, window_seconds)
    if len(rows) < 10:
        raise ValueError("Need at least 10 benign flows to train the model.")
    model = IsolationForest(n_estimators=n_estimators, random_state=random_state,
                            contamination=contamination)
    model.fit(rows)
    return model


class IsolationForestDetector:
    name = "ml"

    def __init__(self, model):
        self.model = model
        self._scores = {}

    @classmethod
    def load(cls, path):
        import joblib
        return cls(joblib.load(path))

    @staticmethod
    def save(model, path):
        import joblib
        joblib.dump(model, path)

    def covers(self, flow, context):
        return self.model is not None

    def prepare(self, context, flows=()):
        self._scores = {}
        if not flows:
            return
        rows = [feature_vector(f, context.tumbling) for f in flows]
        scores = -self.model.score_samples(rows)
        self._scores = {id(f): float(s) for f, s in zip(flows, scores)}

    def evaluate(self, flow, context):
        score = self._scores.get(id(flow))
        threshold = context.config.ml_score_threshold
        if score is None or score < threshold:
            return None
        return Verdict(
            AnomalyType.STAT_OUTLIER.value,
            score / threshold,
            self.name,
            min(1.0, (score - threshold) / (1 - threshold)),
            f"Isolation Forest anomaly score {score:.2f} (threshold {threshold:.2f})",
            {"score": score, "threshold": threshold},
        )
