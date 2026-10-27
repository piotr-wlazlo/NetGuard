from netguard.redis_conn import create_redis_client
from netguard.packet_stream import read_packets
from netguard.flow_processor import extract_flow


if __name__ == '__main__':
    stream_name = input("Enter stream name: ").strip()
    client = create_redis_client()

    flow_count = 0
    packet_count = 0

    try:
        client.ping()
        packets = read_packets(client, stream_name)

        for flow in extract_flow(packets):
            print(flow)
            flow_count += 1
            packet_count += flow["packet_count"]

        print(f"Flow count: {flow_count}")
        print(f"Packets in flows: {packet_count}")

    finally:
        client.close()