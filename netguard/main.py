from uuid import uuid4

from netguard.flow_worker import analyze, print_alerts
from netguard.pcap_importer import read_pcap_file, parse_packet
from netguard.packet_validation import validate_packet
from netguard.redis_conn import create_redis_client
from netguard.packet_stream import (
    publish_packet,
    publish_import_finished,
    read_packets
)


if __name__ == '__main__':
    file_path = "data/monday_sample.pcap"

    stream_name = f"netguard:packets:{uuid4()}"
    client = create_redis_client()

    sent_count = 0
    rejected_count = 0

    try:
        client.ping()

        packets = read_pcap_file(file_path)

        try:
            for packet in packets:
                parsed = parse_packet(packet, "pcap", file_path)

                if parsed is None:
                    continue

                try:
                    validate_packet(parsed)
                except ValueError:
                    rejected_count += 1
                    continue

                publish_packet(client, stream_name, parsed)
                sent_count += 1
        finally:
            packets.close()

        publish_import_finished(client, stream_name, sent_count)

        data_quality = sent_count / (sent_count + rejected_count) if sent_count + rejected_count else 1.0
        flow_count, alerts = analyze(read_packets(client, stream_name), data_quality)

        print(f"number of sent packets: {sent_count} (rejected: {rejected_count})")
        print(f"number of flows: {flow_count}")
        print_alerts(alerts)

    finally:
        client.close()
