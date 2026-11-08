from collections import Counter
from uuid import uuid4
from sqlmodel import Session

from netguard.data_processing.packet_stream import (
    publish_import_finished,
    publish_packet,
    read_packets,
)
from netguard.data_processing.packet_validation import validate_packet
from netguard.data_processing.pcap_importer import parse_packet, read_pcap_file
from netguard.data_processing.redis_conn import create_redis_client
from netguard.db import engine, init_db
from netguard.services import DetectionService

if __name__ == "__main__":
    file_path = "data/monday_sample.pcap"
    stream_name = f"netguard:packets:{uuid4()}"
    client = create_redis_client()
    sent_count = 0
    rejected_count = 0

    init_db()
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

        with Session(engine) as session:
            detections = DetectionService().detect(
                session, read_packets(client, stream_name), method="rules"
            )
            counts = Counter(d.anomaly_type for d in detections)

        print(f"number of sent packets: {sent_count} (rejected: {rejected_count})")
        print(f"detections: {dict(counts)}")
    finally:
        client.close()