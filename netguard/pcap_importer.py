from datetime import datetime, timezone
from scapy.all import PcapReader, IP, TCP, UDP, ICMP
from scapy.error import Scapy_Exception
from uuid import uuid4

from netguard.redis_conn import create_redis_client
from netguard.packet_stream import publish_packet, publish_import_finished


def read_pcap_file(file_path):
    try:
        with PcapReader(file_path) as packets:
            for packet in packets:
                yield packet

    except FileNotFoundError as e:
        raise FileNotFoundError(f"File {file_path} not found.") from e

    except (OSError, Scapy_Exception) as e:
        raise ValueError(f"Could not read file {file_path}: {e}") from e


def parse_packet(packet, source_type, source_name):
    if IP not in packet:
        return None

    ip = packet[IP]
    protocol = (
        "TCP" if isinstance(ip.payload, TCP)
        else "UDP" if isinstance(ip.payload, UDP)
        else "ICMP" if isinstance(ip.payload, ICMP)
        else None
    )

    if protocol is None:
        return None

    source_ip = ip.src
    source_port = None
    destination_ip = ip.dst
    destination_port = None
    if protocol == "TCP" or protocol == "UDP":
        source_port = ip.payload.sport
        destination_port = ip.payload.dport

    timestamp = datetime.fromtimestamp(float(packet.time), tz=timezone.utc)

    packet_length = len(packet)

    return {
        "source_type": source_type,
        "source_name": source_name,
        "protocol": protocol,
        "source_ip": source_ip,
        "source_port": source_port,
        "destination_ip": destination_ip,
        "destination_port": destination_port,
        "timestamp": timestamp.isoformat(timespec="microseconds"),
        "packet_length": packet_length
    }

if __name__ == "__main__":
    client = create_redis_client()
    stream_name = f"netguard:packets:{uuid4()}"
    sent_count = 0

    print(f"Strumień: {stream_name}")

    try:
        client.ping()

        for packet in read_pcap_file("data/monday_sample.pcap"):
            parsed = parse_packet(
                packet,
                source_type="pcap",
                source_name="monday_sample.pcap",
            )

            if parsed is None:
                continue

            publish_packet(client, stream_name, parsed)
            sent_count += 1

        publish_import_finished(client, stream_name, sent_count)
        print(f"sent: {sent_count}")

    finally:
        client.close()
