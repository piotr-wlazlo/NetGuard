import math

from netguard.detection.baseline import Baseline
from netguard.detection.detectors.base import DetectionContext
from netguard.detection.detectors.rules import RulesDetector
from netguard.detection.detectors.statistical import StatisticalDetector, log_value
from netguard.detection.windowing import build_context
from netguard.domain import DetectionConfig
from tests.helpers import make_flow


def ctx(flows, config=None, baseline=None, sliding=None):
    tumbling = build_context(flows)
    return DetectionContext(config or DetectionConfig(), baseline or Baseline(),
                            tumbling, sliding or tumbling)


def test_port_scan_flags_probe_flows_only():
    scan = [make_flow(dport=p, offset=p * 0.01) for p in range(1, 151)]
    dns = make_flow(protocol="UDP", dport=53, syn=0, rst=0, packets=2)
    context = ctx(scan + [dns])
    rules = RulesDetector()

    assert rules.evaluate(scan[0], context).anomaly_type == "PORT_SCAN"
    assert rules.evaluate(dns, context) is None


def test_slow_scan_detected_only_by_sliding_context():
    window_flows = [make_flow(dport=p) for p in range(1, 31)]
    context = DetectionContext(DetectionConfig(), Baseline(), build_context(window_flows),
                               build_context([make_flow(dport=p) for p in range(1, 121)]))

    verdict = RulesDetector().evaluate(window_flows[0], context)

    assert verdict.anomaly_type == "PORT_SCAN" and verdict.evidence["scale"] == "sliding"


def test_host_sweep():
    flows = [make_flow(dst=f"192.168.10.{i}", dport=22) for i in range(1, 61)]

    assert RulesDetector().evaluate(flows[0], ctx(flows)).anomaly_type == "HOST_SWEEP"


def test_syn_flood():
    flows = [make_flow(src=f"10.1.{i // 250}.{i % 250}", packets=1, rst=0) for i in range(1100)]
    config = DetectionConfig(ddos_min_sources=10**6)

    assert RulesDetector().evaluate(flows[0], ctx(flows, config)).anomaly_type == "SYN_FLOOD"


def test_ddos_requires_rate_over_baseline():
    flows = [make_flow(src=f"10.1.0.{i}", syn=0, rst=0, packets=5, ack=3, fin=1) for i in range(1, 221)]
    rules = RulesDetector()
    assert rules.evaluate(flows[0], ctx(flows)).anomaly_type == "DDOS"

    baseline = Baseline()
    baseline.update(("dst", "192.168.10.50"), {"packets": [log_value(1000)]})
    assert rules.evaluate(flows[0], ctx(flows, baseline=baseline)) is None


def test_exfiltration_not_download_and_fragments_use_sliding_window():
    rules = RulesDetector()
    big = make_flow(syn=0, rst=0, packets=50000, fwd_bytes=80_000_000, bwd_bytes=1000)
    chatty = make_flow(syn=0, rst=0, fwd_bytes=80_000_000, bwd_bytes=70_000_000)
    download = make_flow(syn=0, rst=0, packets=30000, fwd_bytes=1000, bwd_bytes=90_000_000)
    assert rules.evaluate(big, ctx([big])).anomaly_type == "EXFILTRATION"
    assert rules.evaluate(chatty, ctx([chatty])) is None
    assert rules.evaluate(download, ctx([download])) is None

    fragments = [make_flow(syn=0, rst=0, packets=30000, fwd_bytes=40_000_000, bwd_bytes=1000, offset=i * 120)
                 for i in range(3)]
    assert rules.evaluate(fragments[0], ctx(fragments[:1], sliding=build_context(fragments))).anomaly_type == "EXFILTRATION"
    assert rules.evaluate(fragments[0], ctx(fragments[:1])) is None


def mature_baseline(windows=30):
    baseline = Baseline()
    for i in range(windows):
        baseline.update(("svc", "TCP/80"), {
            "packet_count": [log_value(3 + (i % 2))] * 5,
            "byte_count": [log_value(300)] * 5, "duration_ms": [log_value(20)] * 5,
        })
    return baseline


def test_statistical_flags_outlier_only_with_mature_baseline():
    outlier = make_flow(packets=5000, bytes_=3_000_000, duration=60000, syn=0, rst=0)
    normal = make_flow(packets=3, bytes_=300, duration=20)
    detector = StatisticalDetector()

    mature = ctx([outlier], baseline=mature_baseline())
    detector.prepare(mature)
    verdict = detector.evaluate(outlier, mature)
    assert verdict.anomaly_type == "STAT_OUTLIER" and verdict.evidence["z"] > 3.5

    cold = ctx([outlier], baseline=mature_baseline(windows=5))
    detector.prepare(cold)
    assert detector.evaluate(outlier, cold) is None and not detector.covers(outlier, cold)

    ordinary = ctx([normal], baseline=mature_baseline())
    detector.prepare(ordinary)
    assert detector.evaluate(normal, ordinary) is None


def test_constant_feature_does_not_divide_by_zero():
    baseline = Baseline()
    for _ in range(30):
        baseline.update(("svc", "TCP/80"), {"packet_count": [log_value(3)] * 5})
    flow = make_flow(packets=3, bytes_=300, duration=20)
    detector = StatisticalDetector()
    context = ctx([flow], baseline=baseline)
    detector.prepare(context)

    assert detector.evaluate(flow, context) is None


def test_baseline_stats():
    baseline = Baseline()
    assert baseline.stats(("svc", "x"), "f") is None
    baseline.update(("svc", "x"), {"f": [1.0, 2.0, 3.0]})
    stats = baseline.stats(("svc", "x"), "f")

    assert (stats.median, stats.n_windows, stats.n_values) == (2.0, 1, 3)
    assert math.isclose(stats.mad, 1.0)


def test_build_context():
    flows = [make_flow(dport=p) for p in range(71, 81)]
    flows.append(make_flow(src="10.0.0.2", dport=80, packets=10, syn=1, ack=5, rst=0, fin=1))
    flows.append(make_flow(src="10.0.0.1", dst="192.168.10.60", dport=80))
    context = build_context(flows)

    assert context.pair_ports[("10.0.0.1", "192.168.10.50")] == 10
    assert context.port_hosts[("10.0.0.1", 80)] == 2
    assert context.dst["192.168.10.50"]["distinct_src"] == 2
    assert context.src["10.0.0.1"]["small_flow_ratio"] == 1.0
    assert build_context([]).pair_ports == {}
