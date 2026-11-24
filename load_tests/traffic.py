"""Generatory danych dla testów obciążeniowych: flow w formacie API oraz pliki PCAP budowane w pamięci
(bez scapy, żeby działały w czystym obrazie Locusta)."""
import random
import struct
from datetime import datetime, timedelta, timezone
from ipaddress import IPv4Address

SERVERS = [("192.168.10.10", 443), ("192.168.10.11", 80), ("192.168.10.53", 53), ("192.168.10.20", 22)]


def _iso(t: datetime) -> str:
    return t.isoformat(timespec="milliseconds")


def _flow(src, dst, sport, dport, proto, packets, size, start, duration_ms):
    return {
        "source_ip": src, "destination_ip": dst,
        "source_port": sport if proto != "ICMP" else None,
        "destination_port": dport if proto != "ICMP" else None,
        "protocol": proto, "packet_count": packets, "byte_count": size,
        "start_time": _iso(start), "end_time": _iso(start + timedelta(milliseconds=duration_ms)),
        "duration_ms": duration_ms, "source_type": "api", "source_name": "locust",
    }


def random_attacker() -> str:
    # unikalny adres na każde wywołanie, żeby kolejne analizy tworzyły nowe alerty (rosnąca baza jak w praktyce)
    return f"10.{random.randint(1, 254)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def normal_flows(count: int, start: datetime) -> list[dict]:
    flows = []
    for i in range(count):
        dst, port = random.choice(SERVERS)
        proto = "UDP" if port == 53 else "TCP"
        packets = random.randint(4, 60)
        flows.append(_flow(f"192.168.1.{random.randint(2, 150)}", dst, random.randint(40000, 65000), port,
                           proto, packets, packets * random.randint(80, 1400),
                           start + timedelta(milliseconds=i * 20), random.randint(5, 3000)))
    return flows


def port_scan_flows(ports: int, start: datetime, attacker: str | None = None) -> list[dict]:
    attacker = attacker or random_attacker()
    target = f"192.168.20.{random.randint(2, 250)}"
    return [_flow(attacker, target, 45000, 1000 + i, "TCP", 1, 60, start + timedelta(milliseconds=i), 1)
            for i in range(ports)]


def brute_force_flows(attempts: int, start: datetime, attacker: str | None = None, target: str | None = None):
    attacker = attacker or random_attacker()
    target = target or f"192.168.30.{random.randint(2, 250)}"
    return [_flow(attacker, target, 50000 + i, 22, "TCP", 8, 900, start + timedelta(seconds=i), 400)
            for i in range(attempts)]


def mixed_batch(total: int) -> list[dict]:
    """Ruch normalny z jednym skanem portów (150 flow), łącznie `total` flow (maks. 1000 na żądanie)."""
    start = datetime.now(timezone.utc) - timedelta(minutes=5)
    scan = port_scan_flows(min(150, total // 2), start)
    return normal_flows(total - len(scan), start) + scan


# --- PCAP w pamięci: nagłówek pliku + ramki Ethernet/IPv4/TCP|UDP ---

def _packet(src: str, dst: str, proto: int, sport: int, dport: int, payload: int = 0) -> bytes:
    if proto == 6:
        l4 = struct.pack("!HHIIBBHHH", sport, dport, random.getrandbits(32), 0, 0x50, 0x02, 64240, 0, 0)
    else:
        l4 = struct.pack("!HHHH", sport, dport, 8 + payload, 0)
    l4 += b"\x00" * payload
    ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(l4), random.getrandbits(16), 0, 64, proto, 0,
                     IPv4Address(src).packed, IPv4Address(dst).packed)
    eth = b"\x02\x00\x00\x00\x00\x02" + b"\x02\x00\x00\x00\x00\x01" + b"\x08\x00"
    return eth + ip + l4


def pcap_bytes(normal_packets: int = 2000, scan_ports: int = 150) -> bytes:
    """Plik PCAP: ruch normalny + skan portów jednego atakującego (powinien dać 1 alert PORT_SCAN)."""
    out = [struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)]
    t = datetime.now(timezone.utc).timestamp() - 120
    records = []
    for i in range(normal_packets):
        dst, port = random.choice(SERVERS)
        proto = 17 if port == 53 else 6
        records.append(_packet(f"192.168.1.{random.randint(2, 150)}", dst, proto,
                               random.randint(40000, 65000), port, random.randint(0, 400)))
    attacker, target = random_attacker(), f"192.168.20.{random.randint(2, 250)}"
    records += [_packet(attacker, target, 6, 45000, 1000 + p) for p in range(scan_ports)]
    for i, frame in enumerate(records):
        ts = t + i * 0.01
        out.append(struct.pack("<IIII", int(ts), int((ts % 1) * 1_000_000), len(frame), len(frame)) + frame)
    return b"".join(out)
