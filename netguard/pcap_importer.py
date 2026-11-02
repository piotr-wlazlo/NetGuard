from datetime import datetime, timezone
from scapy.all import PcapReader, IP, TCP, UDP, ICMP
from scapy.error import Scapy_Exception


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
    tcp_flags = ""
    if protocol == "TCP":
        tcp_flags = str(ip.payload.flags)
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
        "packet_length": packet_length,
        "tcp_flags": tcp_flags       # e.g. "SA"; empty for UDP/ICMP
    }
