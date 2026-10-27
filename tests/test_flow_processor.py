from datetime import datetime

import pytest

from netguard.flow_processor import extract_flow


def test_idle_timeout():
    packets = [
        {
            "source_type": "pcap",
            "source_name": "test.pcap",
            "source_ip": "192.168.1.10",
            "source_port": 50000,
            "destination_ip": "192.168.1.20",
            "destination_port": 80,
            "protocol": "TCP",
            "timestamp": "2026-01-01T12:00:00+00:00",
            "packet_length": 100
        },
        {
            "source_type": "pcap",
            "source_name": "test.pcap",
            "source_ip": "192.168.1.20",
            "source_port": 80,
            "destination_ip": "192.168.1.10",
            "destination_port": 50000,
            "protocol": "TCP",
            "timestamp": "2026-01-01T12:00:10+00:00",
            "packet_length": 200
        },
        {
            "source_type": "pcap",
            "source_name": "test.pcap",
            "source_ip": "192.168.1.10",
            "source_port": 50000,
            "destination_ip": "192.168.1.20",
            "destination_port": 80,
            "protocol": "TCP",
            "timestamp": "2026-01-01T12:01:11+00:00",
            "packet_length": 150
        }
    ]

    flows = list(extract_flow(packets, idle_timeout=60))

    assert len(flows) == 2

    assert flows[0]["packet_count"] == 2
    assert flows[0]["byte_count"] == 300
    assert flows[0]["duration_ms"] == 10000
    assert flows[0]["start_time"] == "2026-01-01T12:00:00+00:00"
    assert flows[0]["end_time"] == "2026-01-01T12:00:10+00:00"

    assert flows[1]["packet_count"] == 1
    assert flows[1]["byte_count"] == 150
    assert flows[1]["duration_ms"] == 0
    assert flows[1]["start_time"] == "2026-01-01T12:01:11+00:00"
    assert flows[1]["end_time"] == "2026-01-01T12:01:11+00:00"

def test_packets_out_of_order():
    first_packet = {
        "source_type": "pcap",
        "source_name": "test.pcap",
        "source_ip": "192.168.1.10",
        "source_port": 50000,
        "destination_ip": "192.168.1.20",
        "destination_port": 80,
        "protocol": "TCP",
        "timestamp": "2026-01-01T12:00:00+00:00",
        "packet_length": 100
    }

    second_packet = {
        **first_packet,
        "timestamp": "2026-01-01T12:00:10+00:00",
        "packet_length": 200
    }

    third_packet = {
        **first_packet,
        "timestamp": "2026-01-01T12:01:11+00:00",
        "packet_length": 150
    }

    packets = [third_packet, first_packet, second_packet]

    with pytest.raises(ValueError, match="Packets must be ordered by timestamp"):
        list(extract_flow(packets))

    packets.sort(key=lambda packet: datetime.fromisoformat(packet["timestamp"]))

    flows = list(extract_flow(packets))

    assert len(flows) == 2

    assert flows[0]["packet_count"] == 2
    assert flows[0]["byte_count"] == 300
    assert flows[0]["duration_ms"] == 10000
    assert flows[0]["start_time"] == first_packet["timestamp"]
    assert flows[0]["end_time"] == second_packet["timestamp"]

    assert flows[1]["packet_count"] == 1
    assert flows[1]["byte_count"] == 150
    assert flows[1]["duration_ms"] == 0

    assert sum(flow["packet_count"] for flow in flows) == 3