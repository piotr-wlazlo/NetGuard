import pytest

from netguard.packet_validation import validate_packet


@pytest.fixture
def packet():
    return {
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


def test_valid_packet(packet):
    validate_packet(packet)


def test_valid_icmp_packet(packet):
    packet["protocol"] = "ICMP"
    packet["source_port"] = None
    packet["destination_port"] = None

    validate_packet(packet)


def test_missing_field(packet):
    del packet["source_ip"]

    with pytest.raises(ValueError, match="Missing required field"):
        validate_packet(packet)


@pytest.mark.parametrize(
    "field, value",
    [
        ("source_type", ""),
        ("source_name", None),
        ("source_ip", "999.1.1.1"),
        ("destination_ip", "not-an-address"),
        ("source_port", -1),
        ("destination_port", 65536),
        ("source_port", True),
        ("source_port", None),
        ("protocol", "ARP"),
        ("timestamp", "not-a-date"),
        ("timestamp", "2026-01-01T12:00:00"),
        ("packet_length", 0),
        ("packet_length", -100),
        ("packet_length", "100"),
        ("packet_length", True)
    ]
)
def test_invalid_field(packet, field, value):
    packet[field] = value

    with pytest.raises(ValueError):
        validate_packet(packet)


def test_icmp_with_port(packet):
    packet["protocol"] = "ICMP"

    with pytest.raises(ValueError, match="must be None for ICMP"):
        validate_packet(packet)


def test_invalid_packet_type():
    with pytest.raises(ValueError, match="must be a dictionary"):
        validate_packet([])