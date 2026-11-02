from datetime import datetime

TCP_FLAG_COUNTERS = (("S", "syn_count"), ("A", "ack_count"), ("R", "rst_count"), ("F", "fin_count"))
PRIVILEGED_PORT = 1024


def client_of(packet):
    source = (packet["source_ip"], packet["source_port"])
    destination = (packet["destination_ip"], packet["destination_port"])
    flags = packet.get("tcp_flags") or ""
    if "S" in flags and "A" not in flags:
        return source
    sport, dport = packet["source_port"], packet["destination_port"]
    if sport is not None and dport is not None and (sport < PRIVILEGED_PORT) != (dport < PRIVILEGED_PORT):
        return destination if sport < PRIVILEGED_PORT else source
    return source


def finish_flow(flow):
    flow.pop("client", None)
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
            client = client_of(packet)
            server = destination if client == source else source
            flows[key] = {
                "source_type": packet["source_type"],
                "source_name": packet["source_name"],
                "source_ip": client[0],
                "destination_ip": server[0],
                "source_port": client[1],
                "destination_port": server[1],
                "protocol": packet["protocol"],
                "packet_count": 0,
                "byte_count": 0,
                "start_time": timestamp,
                "end_time": timestamp,
                "duration_ms": 0,
                "syn_count": 0, "ack_count": 0, "rst_count": 0, "fin_count": 0,
                "fwd_packets": 0, "fwd_bytes": 0, "bwd_packets": 0, "bwd_bytes": 0,
                "client": client
            }

        flow = flows[key]
        flow["packet_count"] += 1
        flow["byte_count"] += packet["packet_length"]

        direction = "fwd" if source == flow["client"] else "bwd"
        flow[f"{direction}_packets"] += 1
        flow[f"{direction}_bytes"] += packet["packet_length"]

        tcp_flags = packet.get("tcp_flags") or ""
        for letter, counter in TCP_FLAG_COUNTERS:
            if letter in tcp_flags:
                flow[counter] += 1

        flow["start_time"] = min(flow["start_time"], timestamp)
        flow["end_time"] = max(flow["end_time"], timestamp)

    for flow in flows.values():
        yield finish_flow(flow)