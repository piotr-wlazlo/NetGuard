from datetime import datetime, timedelta, timezone

from netguard.domain import Flow

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def make_flow(src="10.0.0.1", dst="192.168.10.50", sport=40000, dport=80, protocol="TCP",
              offset=0.0, packets=2, bytes_=120, syn=1, ack=0, rst=1, fin=0,
              fwd_bytes=None, bwd_bytes=0, bwd_packets=0, duration=10.0):
    start = T0 + timedelta(seconds=offset)
    return Flow(
        source_ip=src, destination_ip=dst, source_port=sport, destination_port=dport,
        protocol=protocol, packet_count=packets, byte_count=bytes_, start_time=start,
        end_time=start + timedelta(milliseconds=duration), duration_ms=duration,
        syn_count=syn, ack_count=ack, rst_count=rst, fin_count=fin,
        fwd_packets=packets - bwd_packets, fwd_bytes=bytes_ if fwd_bytes is None else fwd_bytes,
        bwd_packets=bwd_packets, bwd_bytes=bwd_bytes,
    )
