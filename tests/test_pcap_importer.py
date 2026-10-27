from datetime import datetime, timezone

import pytest
from scapy.all import Ether, IP, TCP, UDP, ICMP, ARP, wrpcap

from netguard.pcap_importer import read_pcap_file, parse_packet


@pytest.mark.parametrize(
    "transport, protocol, source_port, destination_port",
    [
        (TCP(sport=50000, dport=80), "TCP", 50000, 80),
        (UDP(sport=53000, dport=53), "UDP", 53000, 53),
        (ICMP(), "ICMP", None, None)
    ]
)
def test_parse_packet(transport, protocol, source_port, destination_port):
    packet = (
        Ether()
        / IP(src="192.168.1.10", dst="192.168.1.20")
        / transport
    )
    packet.time = 1700000000

    result = parse_packet(packet, "pcap", "test.pcap")

    assert result == {
        "source_type": "pcap",
        "source_name": "test.pcap",
        "protocol": protocol,
        "source_ip": "192.168.1.10",
        "source_port": source_port,
        "destination_ip": "192.168.1.20",
        "destination_port": destination_port,
        "timestamp": "2023-11-14T22:13:20.000000+00:00",
        "packet_length": len(packet)
    }


def test_skip_packet_without_ipv4():
    packet = Ether() / ARP()

    assert parse_packet(packet, "pcap", "test.pcap") is None


def test_skip_unsupported_ipv4_protocol():
    packet = Ether() / IP(proto=99)

    assert parse_packet(packet, "pcap", "test.pcap") is None


def test_missing_file(tmp_path):
    file_path = tmp_path / "missing.pcap"

    with pytest.raises(FileNotFoundError, match="not found"):
        list(read_pcap_file(str(file_path)))


def test_invalid_file(tmp_path):
    file_path = tmp_path / "invalid.pcap"
    file_path.write_bytes(b"This is not a PCAP file.")

    with pytest.raises(ValueError, match="Could not read file"):
        list(read_pcap_file(str(file_path)))


def test_read_and_parse_pcap(tmp_path):
    file_path = tmp_path / "test.pcap"

    first_packet = (
        Ether()
        / IP(src="192.168.1.10", dst="192.168.1.20")
        / TCP(sport=50000, dport=80)
    )
    first_packet.time = 1700000000

    second_packet = (
        Ether()
        / IP(src="192.168.1.20", dst="192.168.1.10")
        / TCP(sport=80, dport=50000)
    )
    second_packet.time = 1700000001

    wrpcap(str(file_path), [first_packet, second_packet])

    packets = list(read_pcap_file(str(file_path)))

    assert len(packets) == 2

    first = parse_packet(packets[0], "pcap", file_path.name)
    second = parse_packet(packets[1], "pcap", file_path.name)

    assert first["source_ip"] == "192.168.1.10"
    assert second["source_ip"] == "192.168.1.20"
    assert first["source_port"] == 50000
    assert second["source_port"] == 80

    first_time = datetime.fromisoformat(first["timestamp"])
    second_time = datetime.fromisoformat(second["timestamp"])

    assert first_time.utcoffset() == timezone.utc.utcoffset(first_time)
    assert (second_time - first_time).total_seconds() == 1

    assert first["packet_length"] == len(bytes(first_packet))
    assert second["packet_length"] == len(bytes(second_packet))