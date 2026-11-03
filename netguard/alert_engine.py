from typing import Iterable, Iterator, Optional

from netguard.domain import (
    Alert, AlertSort, AlertStatus, AnomalyType, DetectionResult, DISTRIBUTED_TYPES, OPEN_ALERT_STATUSES, Priority, Severity,
)

HIGH_CONFIDENCE = 0.7
MEDIUM_CONFIDENCE = 0.4
PRIORITY_ORDER = {Priority.P1: 0, Priority.P2: 1, Priority.P3: 2, Priority.P4: 3}
ALLOWED_TRANSITIONS = {
    AlertStatus.NEW: {AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE},
    AlertStatus.ACKNOWLEDGED: {AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE},
    AlertStatus.RESOLVED: set(),
    AlertStatus.FALSE_POSITIVE: set(),
}


SORT_KEYS = {
    AlertSort.PRIORITY: lambda a: (PRIORITY_ORDER[a.priority], -a.risk_score, a.id),
    AlertSort.NEWEST: lambda a: -a.id,
}


def confidence_label(confidence):
    if confidence >= HIGH_CONFIDENCE:
        return "high"
    return "medium" if confidence >= MEDIUM_CONFIDENCE else "low"


def priority_for(severity, confidence) -> Priority:
    severity = Severity(severity)
    sure = confidence >= HIGH_CONFIDENCE
    if severity is Severity.CRITICAL:
        return Priority.P1 if sure else Priority.P2
    if severity is Severity.HIGH:
        return Priority.P2 if sure else Priority.P3
    if severity is Severity.MEDIUM:
        return Priority.P3
    return Priority.P4


def group_of(result):
    anomaly_type, flow = result.detection.anomaly_type, result.flow
    source = None if anomaly_type in DISTRIBUTED_TYPES else flow.source_ip
    if anomaly_type == AnomalyType.HOST_SWEEP:
        return source, f"port {flow.destination_port}"
    return source, flow.destination_ip


class AlertEngine:
    def __init__(self, window_seconds=60, suppress_windows=5):
        self.window_seconds = window_seconds
        self.suppress_windows = suppress_windows
        self.reset()

    def reset(self):
        self.alerts = []
        self.suppressed_groups = 0
        self._last = {}
        self._last_id = 0

    def process(self, results: Iterable[DetectionResult]) -> Iterator[Alert]:
        pending, current = {}, None
        for result in results:
            if current is not None and result.window_start > current:
                yield from self._flush(pending)
                pending = {}
            current = result.window_start
            source, target = group_of(result)
            key = (result.detection.anomaly_type, source, target, result.window_start)
            pending.setdefault(key, []).append(result)
        yield from self._flush(pending)

    def list_alerts(self, status: Optional[AlertStatus] = None, sort=AlertSort.PRIORITY):
        alerts = [a for a in self.alerts if status is None or a.status == status]
        return sorted(alerts, key=SORT_KEYS[AlertSort(sort)])

    def get_alert(self, alert_id):
        return next((a for a in self.alerts if a.id == alert_id), None)

    def set_status(self, alert_id, status):
        alert = self.get_alert(alert_id)
        if alert is None:
            raise KeyError(alert_id)
        status = AlertStatus(status)
        if status not in ALLOWED_TRANSITIONS[alert.status]:
            raise ValueError(f"Cannot change status from {alert.status.value} to {status.value}.")
        alert.status = status
        return alert

    def add_alert(self, title, description, priority, group_key=None, risk_score=0.0):
        alert_id = self._next_id()
        alert = Alert(
            title=title, description=description, priority=Priority(priority),
            group_key=group_key or f"manual|{alert_id}", risk_score=risk_score, id=alert_id,
        )
        self.alerts.append(alert)
        return alert

    def delete_alert(self, alert_id):
        alert = self.get_alert(alert_id)
        if alert is None:
            raise KeyError(alert_id)
        self.alerts.remove(alert)
        self._last = {key: last for key, last in self._last.items() if last[1] is not alert}
        return alert

    def _next_id(self):
        self._last_id += 1
        return self._last_id

    def _flush(self, pending):
        created = []
        for (anomaly_type, src, target, window), results in pending.items():
            top = max(results, key=lambda r: (r.risk_score, r.detection.confidence))
            group_key = f"{anomaly_type}|{src or '*'}|{target}"
            confidence = top.detection.confidence
            priority = priority_for(top.detection.severity, confidence)

            if self._suppressed(group_key, window, priority):
                self.suppressed_groups += 1
                continue

            summary = top.detection.explanation.split("\n", 1)[0]
            span = f"{top.window_start:%H:%M:%S}–{top.window_end:%H:%M:%S}"
            alert = Alert(
                title=f"{anomaly_type} {src or 'multiple sources'} → {target}",
                description=(f"{len(results)} flows, {span}, {summary}, "
                             f"confidence {confidence_label(confidence)} ({confidence:.2f})"),
                priority=priority, group_key=group_key,
                detection_id=top.detection.id, risk_score=top.risk_score,
                id=self._next_id(),
            )
            self.alerts.append(alert)
            self._last[group_key] = (window, alert)
            created.append(alert)

        created.sort(key=lambda a: (PRIORITY_ORDER[a.priority], -a.risk_score))
        yield from created

    def _suppressed(self, group_key, window, priority):
        last = self._last.get(group_key)
        if last is None or self.suppress_windows <= 0:
            return False
        last_window, alert = last
        if (window - last_window).total_seconds() > self.suppress_windows * self.window_seconds:
            return False
        if alert.status not in OPEN_ALERT_STATUSES:
            return False
        return PRIORITY_ORDER[priority] >= PRIORITY_ORDER[alert.priority]
