import json


def build_explanation(flow, merged, risk, window, baseline_windows, data_quality):
    start, end = window
    group_key = [merged.anomaly_type, flow.source_ip, flow.destination_ip, start.isoformat()]
    primary = next(v for v in merged.verdicts if v.anomaly_type == merged.anomaly_type)

    text = primary.summary

    evidence = {
        "risk_score": risk,
        "window": [start.isoformat(), end.isoformat()],
        "group_key": group_key,
        "features": {
            "packet_count": flow.packet_count, "byte_count": float(flow.byte_count),
            "duration_ms": float(flow.duration_ms),
            "syn_count": flow.syn_count, "ack_count": flow.ack_count,
            "rst_count": flow.rst_count, "fin_count": flow.fin_count,
            "fwd_bytes": flow.fwd_bytes, "bwd_bytes": flow.bwd_bytes,
            "destination_port": flow.destination_port,
        },
        "baseline_windows": baseline_windows,
        "data_quality": data_quality,
        "verdicts": [
            {"method": v.method, "type": v.anomaly_type,
             "magnitude": round(v.magnitude, 3), "evidence": v.evidence}
            for v in merged.verdicts
        ],
    }
    return text + "\n" + json.dumps(evidence, allow_nan=False, default=str)

