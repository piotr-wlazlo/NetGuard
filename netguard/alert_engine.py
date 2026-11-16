from collections import defaultdict
from datetime import datetime, timezone
from typing import Iterable

from netguard.model.alert import Alert
from netguard.model.detection import Detection
from netguard.model.network_flow import NetworkFlow

ALERT_STATUSES = ("NEW", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE")
OPEN_STATUSES = ("NEW", "ACKNOWLEDGED")
DISTRIBUTED_TYPES = ("DDOS",)

HIGH_CONFIDENCE = 0.7
MEDIUM_CONFIDENCE = 0.4


def confidence_label(confidence: float) -> str:
    if confidence >= HIGH_CONFIDENCE:
        return "high"
    return "medium" if confidence >= MEDIUM_CONFIDENCE else "low"


def group_key_for(detection: Detection, flow: NetworkFlow) -> str:
    source = "*" if detection.anomaly_type in DISTRIBUTED_TYPES else flow.source_ip
    return f"{detection.anomaly_type}|{source}|{flow.destination_ip}"


def build_alerts(
    pairs: Iterable[tuple[Detection, NetworkFlow]],
    open_group_keys: set[str],
) -> list[Alert]:
    """One alert per group (type|source|target) from its strongest detection.

    Groups that already have an open alert are skipped.
    """
    groups: dict[str, list[tuple[Detection, NetworkFlow]]] = defaultdict(list)
    for detection, flow in pairs:
        groups[group_key_for(detection, flow)].append((detection, flow))

    now = datetime.now(timezone.utc)
    alerts = []
    for group_key, members in groups.items():
        if group_key in open_group_keys:
            continue
        top, flow = max(members, key=lambda pair: pair[0].confidence or 0.0)
        confidence = top.confidence or 0.0
        source = "multiple sources" if top.anomaly_type in DISTRIBUTED_TYPES else flow.source_ip
        alerts.append(Alert(
            detection_id=top.id,
            group_key=group_key,
            title=f"{top.anomaly_type} {source} → {flow.destination_ip}",
            description=(
                f"{len(members)} flows, {top.explanation}, "
                f"confidence {confidence_label(confidence)} ({confidence:.2f})"
            ),
            priority=top.severity,
            status="NEW",
            created_at=now,
        ))
    return alerts
