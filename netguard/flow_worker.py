from datetime import datetime

from netguard.alert_engine import AlertEngine
from netguard.detection.engine import DetectionEngine
from netguard.domain import Flow
from netguard.flow_processor import extract_flow
from netguard.packet_stream import read_packets
from netguard.packet_validation import validate_packet
from netguard.redis_conn import create_redis_client


def _timestamp(packet):
    timestamp = packet["timestamp"]
    return datetime.fromisoformat(timestamp) if isinstance(timestamp, str) else timestamp


def valid_ordered_packets(packets):
    valid, rejected = [], 0
    for packet in packets:
        try:
            validate_packet(packet)
        except ValueError:
            rejected += 1
            continue
        valid.append(packet)
    valid.sort(key=_timestamp)
    return valid, rejected


def analyze(packets, data_quality=1.0):
    packets, rejected = valid_ordered_packets(packets)
    total = len(packets) + rejected
    if total:
        data_quality *= len(packets) / total
    flows = [Flow.from_dict(flow) for flow in extract_flow(packets)]
    results = DetectionEngine(data_quality=data_quality).detect(flows)
    return len(flows), list(AlertEngine().process(results))


def print_alerts(alerts):
    print(f"alerts: {len(alerts)}")
    for alert in alerts:
        print(f"  [{alert.priority.value}] {alert.title} - {alert.description}")


if __name__ == '__main__':
    stream_name = input("Enter stream name: ").strip()
    client = create_redis_client()

    try:
        client.ping()
        flow_count, alerts = analyze(read_packets(client, stream_name))
        print(f"Flow count: {flow_count}")
        print_alerts(alerts)

    finally:
        client.close()
