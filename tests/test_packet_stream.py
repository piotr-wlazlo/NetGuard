from uuid import uuid4

import pytest

from netguard.redis_conn import create_redis_client
from netguard.packet_stream import (
    publish_packet,
    publish_import_finished,
    read_packets
)
from netguard.flow_processor import extract_flow


@pytest.fixture
def redis_stream():
    client = create_redis_client()
    stream_name = f"netguard:test:{uuid4()}"

    try:
        client.ping()
        yield client, stream_name
    finally:
        client.delete(stream_name)
        client.close()


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


def test_packet_round_trip(redis_stream, packet):
    client, stream_name = redis_stream

    publish_packet(client, stream_name, packet)
    publish_import_finished(client, stream_name, 1)

    received = list(read_packets(client, stream_name))

    assert received == [packet]
    assert client.xlen(stream_name) == 2


def test_packet_with_empty_ports(redis_stream, packet):
    client, stream_name = redis_stream

    packet["protocol"] = "ICMP"
    packet["source_port"] = None
    packet["destination_port"] = None

    publish_packet(client, stream_name, packet)
    publish_import_finished(client, stream_name, 1)

    received = list(read_packets(client, stream_name))

    assert received == [packet]


def test_empty_import(redis_stream):
    client, stream_name = redis_stream

    publish_import_finished(client, stream_name, 0)

    assert list(read_packets(client, stream_name)) == []


def test_packet_count_mismatch(redis_stream, packet):
    client, stream_name = redis_stream

    publish_packet(client, stream_name, packet)
    publish_import_finished(client, stream_name, 2)

    with pytest.raises(ValueError, match="Packet count mismatch"):
        list(read_packets(client, stream_name))


def test_unknown_message_type(redis_stream):
    client, stream_name = redis_stream

    client.xadd(stream_name, {"type": "unknown"})

    with pytest.raises(ValueError, match="Unknown message type"):
        list(read_packets(client, stream_name))


def test_missing_stream(redis_stream):
    client, stream_name = redis_stream

    with pytest.raises(ValueError, match="does not exist"):
        list(read_packets(client, stream_name))


def test_redis_to_flow_processor(redis_stream, packet):
    client, stream_name = redis_stream

    response = {
        **packet,
        "source_ip": packet["destination_ip"],
        "source_port": packet["destination_port"],
        "destination_ip": packet["source_ip"],
        "destination_port": packet["source_port"],
        "timestamp": "2026-01-01T12:00:10+00:00",
        "packet_length": 200
    }

    publish_packet(client, stream_name, packet)
    publish_packet(client, stream_name, response)
    publish_import_finished(client, stream_name, 2)

    flows = list(extract_flow(read_packets(client, stream_name)))

    assert len(flows) == 1
    assert flows[0]["packet_count"] == 2
    assert flows[0]["byte_count"] == 300
    assert flows[0]["duration_ms"] == 10000

def test_import_without_finish(redis_stream, packet):
    client, stream_name = redis_stream

    publish_packet(client, stream_name, packet)

    packets = read_packets(client, stream_name, wait_timeout=0.2)

    assert next(packets) == packet

    with pytest.raises(TimeoutError, match="Import did not finish"):
        next(packets)