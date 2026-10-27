from uuid import uuid4
from datetime import datetime

from netguard.pcap_importer import read_pcap_file, parse_packet
from netguard.redis_conn import create_redis_client
from netguard.packet_stream import (
    publish_packet,
    publish_import_finished,
    read_packets
)
from netguard.flow_processor import extract_flow


if __name__ == '__main__':
    file_path = "data/monday_sample.pcap"

    stream_name = f"netguard:packets:{uuid4()}"
    client = create_redis_client()

    sent_count = 0
    flow_count = 0

    try:
        client.ping()

        packets = read_pcap_file(file_path)

        try:
            for packet in packets:
                parsed = parse_packet(packet, "pcap", file_path)

                if parsed is None:
                    continue

                publish_packet(client, stream_name, parsed)
                sent_count += 1
        finally:
            packets.close()

        publish_import_finished(client, stream_name, sent_count)

        packets = list(read_packets(client, stream_name))
        packets.sort(
            key=lambda packet: datetime.fromisoformat(packet["timestamp"])
        )

        for flow in extract_flow(packets):
            flow_count += 1
            print(f"flow {flow_count}, number of packets: {flow['packet_count']}")

        print(f"number of sent packets: {sent_count}")
        print(f"number of flows: {flow_count}")

    finally:
        client.close()