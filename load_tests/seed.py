"""Zasila bazę alertami przed testem obciążeniowym (lista alertów rośnie jak w działającym systemie).

Każde żądanie: 50 atakujących x 20 prób brute force = 1000 flow -> 50 alertów.
Użycie: python seed.py --host http://frontend --alerts 2000
"""
import argparse
import time
from datetime import datetime, timedelta, timezone

import requests

from traffic import brute_force_flows, random_attacker

PER_REQUEST = 50

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="http://localhost:8080")
parser.add_argument("--alerts", type=int, default=2000)
args = parser.parse_args()

start = datetime.now(timezone.utc) - timedelta(hours=1)
created = 0
t0 = time.perf_counter()
while created < args.alerts:
    flows = []
    for i in range(PER_REQUEST):
        flows += brute_force_flows(20, start, attacker=random_attacker(), target=f"192.168.{40 + i // 250}.{i % 250 + 2}")
    r = requests.post(f"{args.host}/api/v1/analysis/flows?method=rules", json={"flows": flows}, timeout=120)
    r.raise_for_status()
    created += r.json()["alert_count"]
    print(f"utworzono {created}/{args.alerts} alertów")
print(f"gotowe w {time.perf_counter() - t0:.1f} s")
