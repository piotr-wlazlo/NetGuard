import math

from netguard.detection.detectors.base import Verdict
from netguard.detection.windowing import is_half_open, is_probe
from netguard.domain import AnomalyType

DDOS_RATE_FACTOR = 10.0
DDOS_MAX_PACKETS = 3
DDOS_MAX_DURATION_MS = 1000.0


def _margin(magnitude):
    return 1 - math.exp(-(magnitude - 1))


class RulesDetector:
    name = "rules"

    def prepare(self, context, flows=()):
        pass

    def covers(self, flow, context):
        return True

    def _verdict(self, anomaly_type, observed, threshold, summary, evidence):
        magnitude = observed / threshold
        return Verdict(anomaly_type.value, magnitude, self.name, _margin(magnitude), summary, evidence)

    def evaluate(self, flow, context):
        cfg = context.config
        candidates = []

        tumbling, sliding = context.tumbling, context.sliding

        if flow.fwd_bytes / max(flow.bwd_bytes, 1) >= cfg.exfiltration_min_ratio:
            pair = (flow.source_ip, flow.destination_ip)
            sent, received = max(wc.pair_bytes.get(pair, (0, 0)) for wc in (tumbling, sliding))
            sent = max(sent, flow.fwd_bytes)
            ratio = sent / max(received, 1)
            if sent >= cfg.exfiltration_min_bytes and ratio >= cfg.exfiltration_min_ratio:
                candidates.append(self._verdict(
                    AnomalyType.EXFILTRATION, sent, cfg.exfiltration_min_bytes,
                    f"{flow.source_ip} sent {sent} bytes to {flow.destination_ip} (out/in ratio {ratio:.0f})",
                    {"fwd_bytes": sent, "bwd_bytes": received, "flow_fwd_bytes": flow.fwd_bytes,
                     "threshold": cfg.exfiltration_min_bytes},
                ))

        if is_probe(flow):
            for scale, wc in (("tumbling", tumbling), ("sliding", sliding)):
                ports = wc.pair_ports.get((flow.source_ip, flow.destination_ip), 0)
                if ports >= cfg.port_scan_min_ports:
                    candidates.append(self._verdict(
                        AnomalyType.PORT_SCAN, ports, cfg.port_scan_min_ports,
                        f"Source {flow.source_ip} contacted {ports} ports of {flow.destination_ip} ({scale} window)",
                        {"distinct_dst_ports": ports, "threshold": cfg.port_scan_min_ports, "scale": scale},
                    ))
                if flow.destination_port is not None:
                    hosts = wc.port_hosts.get((flow.source_ip, flow.destination_port), 0)
                    if hosts >= cfg.host_sweep_min_hosts:
                        candidates.append(self._verdict(
                            AnomalyType.HOST_SWEEP, hosts, cfg.host_sweep_min_hosts,
                            f"Source {flow.source_ip} contacted {hosts} hosts on port {flow.destination_port} ({scale} window)",
                            {"distinct_dst_ips": hosts, "port": flow.destination_port,
                             "threshold": cfg.host_sweep_min_hosts, "scale": scale},
                        ))

        dst = tumbling.dst.get(flow.destination_ip)
        if dst is not None:
            if (
                is_half_open(flow)
                and dst["syn_count"] >= cfg.syn_flood_min_syns
                and dst["half_open_ratio"] >= cfg.syn_flood_half_open_ratio
            ):
                candidates.append(self._verdict(
                    AnomalyType.SYN_FLOOD, dst["syn_count"], cfg.syn_flood_min_syns,
                    f"{flow.destination_ip} received {int(dst['syn_count'])} SYNs, {dst['half_open_ratio']:.0%} half-open",
                    {"syn_count": dst["syn_count"], "half_open_ratio": dst["half_open_ratio"],
                     "threshold": cfg.syn_flood_min_syns},
                ))

            if (
                dst["distinct_src"] >= cfg.ddos_min_sources
                and self._looks_like_flood_flow(flow)
                and self._ddos_rate_ok(flow, dst, context)
            ):
                candidates.append(self._verdict(
                    AnomalyType.DDOS, dst["distinct_src"], cfg.ddos_min_sources,
                    f"{flow.destination_ip} received traffic from {int(dst['distinct_src'])} sources",
                    {"distinct_src": dst["distinct_src"], "packets": dst["packets"],
                     "threshold": cfg.ddos_min_sources},
                ))

        if not candidates:
            return None
        impact = cfg.impact
        return max(candidates, key=lambda v: (impact[AnomalyType(v.anomaly_type)], v.magnitude))

    @staticmethod
    def _looks_like_flood_flow(flow):
        return flow.packet_count <= DDOS_MAX_PACKETS or flow.duration_ms < DDOS_MAX_DURATION_MS

    @staticmethod
    def _ddos_rate_ok(flow, dst, context):
        stats = context.baseline.stats(("dst", flow.destination_ip), "packets")
        if stats is None:
            return True
        return dst["packets"] >= DDOS_RATE_FACTOR * max(math.expm1(stats.median), 1.0)
