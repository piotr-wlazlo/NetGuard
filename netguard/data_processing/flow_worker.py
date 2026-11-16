from collections import Counter

from sqlmodel import Session

from netguard.db import engine, init_db
from netguard.detection.config import seed_default_config
from netguard.detection.detection_engine import DetectionEngine, build_strategy
from netguard.data_processing.packet_stream import read_packets
from netguard.data_processing.redis_conn import create_redis_client


if __name__ == '__main__':
    stream_name = input("Enter stream name: ").strip()
    method = input("Detection method [rules/statistical/ml]: ").strip() or "rules"
    client = create_redis_client()
    init_db()

    try:
        client.ping()
        with Session(engine) as session:
            seed_default_config(session)
            detection_engine = DetectionEngine(build_strategy(method, session), session)
            counts = Counter(d.anomaly_type for d in detection_engine.detect(read_packets(client, stream_name)))
        print(f"Detections: {dict(counts)}")
    finally:
        client.close()
