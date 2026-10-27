from datetime import datetime


def finish_flow(flow):
    flow["duration_ms"] = (flow["end_time"] - flow["start_time"]).total_seconds() * 1000

    flow["start_time"] = flow["start_time"].isoformat()
    flow["end_time"] = flow["end_time"].isoformat()

    return flow


def extract_flow(packets, idle_timeout=60):
    if idle_timeout <= 0:
        raise ValueError("Idle timeout must be greater than zero.")

    flows = {}
    latest_timestamp = None

    for packet in packets:
        if packet is None:
            continue

        timestamp = packet["timestamp"]
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)

        if latest_timestamp is not None and timestamp < latest_timestamp:
            raise ValueError("Packets must be ordered by timestamp.")

        latest_timestamp = timestamp

        expired_keys = []

        for key, flow in flows.items():
            idle_time = (timestamp - flow["end_time"]).total_seconds()

            if idle_time > idle_timeout:
                expired_keys.append(key)

        for key in expired_keys:
            yield finish_flow(flows.pop(key))

        source = (packet["source_ip"], packet["source_port"])
        destination = (packet["destination_ip"], packet["destination_port"])
        endpoints = frozenset((source, destination))

        key = (
            packet["source_type"],
            packet["source_name"],
            packet["protocol"],
            endpoints
        )

        if key not in flows:
            flows[key] = {
                "source_type": packet["source_type"],
                "source_name": packet["source_name"],
                "source_ip": packet["source_ip"],
                "destination_ip": packet["destination_ip"],
                "source_port": packet["source_port"],
                "destination_port": packet["destination_port"],
                "protocol": packet["protocol"],
                "packet_count": 0,
                "byte_count": 0,
                "start_time": timestamp,
                "end_time": timestamp,
                "duration_ms": 0
            }

        flow = flows[key]
        flow["packet_count"] += 1
        flow["byte_count"] += packet["packet_length"]

        flow["start_time"] = min(flow["start_time"], timestamp)
        flow["end_time"] = max(flow["end_time"], timestamp)

    for flow in flows.values():
        yield finish_flow(flow)