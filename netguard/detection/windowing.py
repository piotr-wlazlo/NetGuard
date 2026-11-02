from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Tuple

import pandas as pd


def window_index(timestamp, window_seconds):
    return int(timestamp.timestamp() // window_seconds)


def window_bounds(index, window_seconds):
    start = datetime.fromtimestamp(index * window_seconds, tz=timezone.utc)
    end = datetime.fromtimestamp((index + 1) * window_seconds, tz=timezone.utc)
    return start, end


def group_by_window(flows, window_seconds):
    if window_seconds <= 0:
        raise ValueError("Window size must be greater than zero.")
    windows = {}
    for flow in flows:
        windows.setdefault(window_index(flow.start_time, window_seconds), []).append(flow)
    return sorted(windows.items())

def is_probe(flow):
    return flow.protocol == "TCP" and flow.packet_count <= 2 and flow.syn_count >= 1


def is_half_open(flow):
    return (
        flow.protocol == "TCP" and flow.syn_count >= 1
        and flow.packet_count <= 3 and flow.fin_count == 0
    )


@dataclass
class WindowContext:
    pair_ports: Dict[Tuple[str, str], int] = field(default_factory=dict)
    port_hosts: Dict[Tuple[str, int], int] = field(default_factory=dict)
    pair_bytes: Dict[Tuple[str, str], Tuple[int, int]] = field(default_factory=dict)
    dst: Dict[str, dict] = field(default_factory=dict)
    src: Dict[str, dict] = field(default_factory=dict)


def build_context(flows) -> WindowContext:
    if not flows:
        return WindowContext()

    df = pd.DataFrame({
        "src": [f.source_ip for f in flows],
        "dst": [f.destination_ip for f in flows],
        "dport": [float("nan") if f.destination_port is None else f.destination_port for f in flows],
        "packets": [f.packet_count for f in flows],
        "syn": [f.syn_count for f in flows],
        "probe": [is_probe(f) for f in flows],
        "small": [f.packet_count <= 2 for f in flows],
        "syn_only": [f.syn_count >= 1 and f.ack_count == 0 for f in flows],
        "half_open": [is_half_open(f) for f in flows],
        "fwd_bytes": [f.fwd_bytes for f in flows],
        "bwd_bytes": [f.bwd_bytes for f in flows],
    })

    with_port = df[df["dport"].notna()]
    pair_ports = with_port.groupby(["src", "dst"])["dport"].nunique()
    port_hosts = with_port.groupby(["src", "dport"])["dst"].nunique()

    pair_bytes = df.groupby(["src", "dst"])[["fwd_bytes", "bwd_bytes"]].sum()

    dst_group = df.groupby("dst")
    syn_flows = df[df["syn"] > 0].groupby("dst")["half_open"].mean()
    dst_stats = pd.DataFrame({
        "syn_count": dst_group["syn"].sum(),
        "distinct_src": dst_group["src"].nunique(),
        "packets": dst_group["packets"].sum(),
        "flows": dst_group.size(),
    })
    dst_stats["half_open_ratio"] = syn_flows.reindex(dst_stats.index).fillna(0.0)

    src_group = df.groupby("src")
    src_stats = pd.DataFrame({
        "flow_count": src_group.size(),
        "distinct_dst_ips": src_group["dst"].nunique(),
        "distinct_dst_ports": src_group["dport"].nunique(),
        "small_flow_ratio": src_group["small"].mean(),
        "syn_only_ratio": src_group["syn_only"].mean(),
        "bytes_out": src_group["fwd_bytes"].sum(),
        "bytes_in": src_group["bwd_bytes"].sum(),
    })

    return WindowContext(
        pair_ports={k: int(v) for k, v in pair_ports.items()},
        port_hosts={(s, int(p)): int(v) for (s, p), v in port_hosts.items()},
        pair_bytes={pair: (int(row.fwd_bytes), int(row.bwd_bytes)) for pair, row in pair_bytes.iterrows()},
        dst={k: {c: float(v) for c, v in row.items()} for k, row in dst_stats.to_dict("index").items()},
        src={k: {c: float(v) for c, v in row.items()} for k, row in src_stats.to_dict("index").items()},
    )
