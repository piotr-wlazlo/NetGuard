from datetime import timedelta

import pytest

from netguard.alert_engine import AlertEngine, priority_for
from netguard.domain import AlertStatus, Detection, DetectionResult, Priority
from tests.helpers import T0, make_flow


def result(kind="PORT_SCAN", severity="HIGH", confidence=0.9, risk=60.0, src="10.0.0.1",
           dst="192.168.10.50", window=0, detection_id=1, port=1):
    start = T0 + timedelta(minutes=window)
    detection = Detection(1, "rules", True, kind, confidence, severity, f"{kind} summary\n{{}}", id=detection_id)
    return DetectionResult(detection, make_flow(src=src, dst=dst, dport=port), risk,
                           start, start + timedelta(minutes=1))


@pytest.mark.parametrize("severity, confidence, expected", [
    ("CRITICAL", 0.7, Priority.P1), ("CRITICAL", 0.69, Priority.P2),
    ("HIGH", 0.7, Priority.P2), ("HIGH", 0.3, Priority.P3),
    ("MEDIUM", 0.99, Priority.P3), ("LOW", 0.99, Priority.P4),
])
def test_priority_rules(severity, confidence, expected):
    assert priority_for(severity, confidence) is expected


def test_one_alert_per_group_with_top_detection_sorted_by_priority():
    engine = AlertEngine()
    results = [result(risk=50, detection_id=i, port=i) for i in range(1, 6)]
    results[3] = result(risk=70, confidence=0.95, detection_id=99)
    results += [result("SYN_FLOOD", "CRITICAL", 0.95, 90, src="1.1.1.1", dst="192.168.10.2"),
                result("SYN_FLOOD", "CRITICAL", 0.95, 90, src="2.2.2.2", dst="192.168.10.2")]

    alerts = list(engine.process(results))

    assert [a.title for a in alerts] == ["SYN_FLOOD multiple sources → 192.168.10.2",
                                          "PORT_SCAN 10.0.0.1 → 192.168.10.50"]
    scan = alerts[1]
    assert scan.detection_id == 99 and scan.priority is Priority.P2 and scan.status is AlertStatus.NEW
    assert scan.description.startswith("5 flows, 12:00:00–12:01:00, PORT_SCAN summary")


def test_suppression_escalation_and_reopen_after_close():
    engine = AlertEngine(suppress_windows=3)

    alerts = list(engine.process([result(window=0), result(window=1), result(window=3), result(window=10)]))
    assert len(alerts) == 2 and engine.suppressed_groups == 2

    escalated = list(engine.process([result("PORT_SCAN", "CRITICAL", 0.95, 95, window=11)]))
    assert len(escalated) == 1 and escalated[0].priority is Priority.P1

    engine.set_status(escalated[0].id, AlertStatus.RESOLVED)
    assert len(list(engine.process([result(window=12)]))) == 1
    assert engine.list_alerts(AlertStatus.RESOLVED) == [escalated[0]]


def test_host_sweep_is_one_alert_per_source_and_port():
    engine = AlertEngine()
    results = [result("HOST_SWEEP", dst=f"192.168.10.{i}", port=22, detection_id=i) for i in range(1, 61)]

    alerts = list(engine.process(results))

    assert [a.title for a in alerts] == ["HOST_SWEEP 10.0.0.1 → port 22"]
    assert alerts[0].group_key == "HOST_SWEEP|10.0.0.1|port 22"


def test_set_status_unknown_alert_raises_key_error():
    with pytest.raises(KeyError):
        AlertEngine().set_status(42, AlertStatus.RESOLVED)


@pytest.mark.parametrize("start, target", [
    (AlertStatus.RESOLVED, AlertStatus.NEW),
    (AlertStatus.FALSE_POSITIVE, AlertStatus.ACKNOWLEDGED),
    (AlertStatus.ACKNOWLEDGED, AlertStatus.NEW),
])
def test_set_status_rejects_invalid_transition(start, target):
    engine = AlertEngine()
    alert = engine.add_alert("manual", "", Priority.P3)
    alert.status = start

    with pytest.raises(ValueError):
        engine.set_status(alert.id, target)
    assert alert.status is start


def test_add_alert_assigns_sequential_ids():
    engine = AlertEngine()
    alerts = list(engine.process([result()]))

    manual = engine.add_alert("manual", "note", "P2")

    assert manual.id == alerts[0].id + 1
    assert manual.priority is Priority.P2
    assert manual.group_key == f"manual|{manual.id}"


def test_delete_alert_removes_only_that_alert():
    engine = AlertEngine()
    first = engine.add_alert("first", "", Priority.P1)
    second = engine.add_alert("second", "", Priority.P2)

    assert engine.delete_alert(first.id) is first

    assert engine.alerts == [second]
    assert engine.get_alert(first.id) is None


def test_delete_unknown_alert_raises_key_error():
    with pytest.raises(KeyError):
        AlertEngine().delete_alert(42)


def test_ids_are_not_reused_after_delete():
    engine = AlertEngine()
    first = engine.add_alert("first", "", Priority.P1)
    second = engine.add_alert("second", "", Priority.P2)
    engine.delete_alert(first.id)

    third = engine.add_alert("third", "", Priority.P3)

    assert third.id not in (first.id, second.id)
    assert [a.id for a in engine.alerts] == [second.id, third.id]


def test_deleted_alert_no_longer_suppresses_its_group():
    engine = AlertEngine()
    created = list(engine.process([result(window=0)]))
    assert list(engine.process([result(window=1)])) == []

    engine.delete_alert(created[0].id)

    assert len(list(engine.process([result(window=2)]))) == 1


def test_reset_restarts_ids():
    engine = AlertEngine()
    engine.add_alert("first", "", Priority.P1)

    engine.reset()

    assert engine.add_alert("again", "", Priority.P1).id == 1


def test_reset_clears_alerts_and_suppression():
    engine = AlertEngine()
    list(engine.process([result(window=0)]))
    list(engine.process([result(window=1)]))
    assert engine.suppressed_groups == 1

    engine.reset()

    assert engine.alerts == [] and engine.suppressed_groups == 0
    assert len(list(engine.process([result(window=2)]))) == 1
