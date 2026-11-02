import math

from netguard.detection.baseline import robust_z
from netguard.detection.detectors.base import Verdict
from netguard.domain import AnomalyType

SERVICE_FEATURES = ("packet_count", "byte_count", "duration_ms")
HOST_FEATURES = ("flow_count", "distinct_dst_ips", "distinct_dst_ports")


def service_key(flow):
    if flow.destination_port is None:
        return "svc", flow.protocol
    return "svc", f"{flow.protocol}/{flow.destination_port}"


def log_value(value):
    return math.log1p(max(float(value), 0.0))


class StatisticalDetector:
    name = "statistical"

    def __init__(self):
        self._host_outliers = {}

    def prepare(self, context, flows=()):
        self._host_outliers = {}
        cfg = context.config
        for host, features in context.tumbling.src.items():
            best = self._best(
                context, ("host", host),
                {name: features[name] for name in HOST_FEATURES}, cfg,
            )
            if best is not None:
                self._host_outliers[host] = best

    def covers(self, flow, context):
        minimum = context.config.min_baseline_windows
        return any(context.baseline.n_windows(entity) >= minimum
                   for entity in (service_key(flow), ("host", flow.source_ip)))

    def _best(self, context, entity, features, cfg):
        best = None
        for name, raw in features.items():
            stats = context.baseline.stats(entity, name)
            if stats is None or stats.n_windows < cfg.min_baseline_windows:
                continue
            z = robust_z(log_value(raw), stats, cfg.mad_floor)
            if abs(z) >= cfg.z_threshold and (best is None or abs(z) > abs(best[1])):
                best = (name, z, raw, stats)
        return best

    def evaluate(self, flow, context):
        cfg = context.config
        candidates = []

        features = {
            "packet_count": flow.packet_count,
            "byte_count": flow.byte_count,
            "duration_ms": flow.duration_ms,
        }
        best = self._best(context, service_key(flow), features, cfg)
        if best is not None:
            candidates.append((service_key(flow)[1], "service") + best)

        host = self._host_outliers.get(flow.source_ip)
        if host is not None:
            candidates.append((flow.source_ip, "host") + host)

        if not candidates:
            return None

        entity, scope, name, z, raw, stats = max(candidates, key=lambda c: abs(c[3]))
        magnitude = abs(z) / cfg.z_threshold
        return Verdict(
            AnomalyType.STAT_OUTLIER.value, magnitude, self.name,
            1 - math.exp(-(abs(z) - cfg.z_threshold)),
            f"{name} of {scope} {entity} is {raw:g} (robust z {z:.1f}, baseline median {math.expm1(stats.median):.1f})",
            {"feature": name, "scope": scope, "entity": entity, "value": float(raw), "z": z,
             "threshold": cfg.z_threshold,
             "baseline": {"median": stats.median, "mad": stats.mad, "n": stats.n_values,
                          "windows": stats.n_windows}},
            maturity=min(1.0, stats.n_windows / cfg.min_baseline_windows) if cfg.min_baseline_windows else 1.0,
        )
