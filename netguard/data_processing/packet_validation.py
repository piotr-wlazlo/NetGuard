from datetime import datetime
from ipaddress import IPv4Address


def validate_packet(packet):
    if not isinstance(packet, dict):
        raise ValueError("Packet must be a dictionary.")

    required_fields = (
        "source_type",
        "source_name",
        "protocol",
        "source_ip",
        "source_port",
        "destination_ip",
        "destination_port",
        "timestamp",
        "packet_length"
    )

    for field in required_fields:
        if field not in packet:
            raise ValueError(f"Missing required field: {field}.")

    for field in ("source_type", "source_name"):
        value = packet[field]

        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be a non-empty string.")

    protocol = packet["protocol"]

    if protocol not in ("TCP", "UDP", "ICMP"):
        raise ValueError(f"Unsupported protocol: {protocol}.")

    for field in ("source_ip", "destination_ip"):
        value = packet[field]

        if not isinstance(value, str):
            raise ValueError(f"{field} must be an IPv4 address string.")

        try:
            IPv4Address(value)
        except ValueError as e:
            raise ValueError(f"Invalid {field}: {value}.") from e

    for field in ("source_port", "destination_port"):
        port = packet[field]

        if protocol == "ICMP":
            if port is not None:
                raise ValueError(f"{field} must be None for ICMP.")

        elif type(port) is not int or not 0 <= port <= 65535:
            raise ValueError(f"{field} must be an integer between 0 and 65535.")

    timestamp = packet["timestamp"]

    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp)
        except ValueError as e:
            raise ValueError("Invalid packet timestamp.") from e

    if timestamp.utcoffset() is None:
        raise ValueError("Timestamp must include a timezone.")

    packet_length = packet["packet_length"]

    if type(packet_length) is not int or packet_length <= 0:
        raise ValueError("Packet length must be a positive integer.")