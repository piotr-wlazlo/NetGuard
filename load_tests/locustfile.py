"""Testy obciążeniowe NetGuard (Locust).

Trzy typy użytkowników o różnych wagach:
  DashboardViewer - przegląda interfejs: lista alertów (jak odświeżanie Przeglądu), szczegóły, konfiguracja
  Analyst         - uruchamia analizy flow różnej wielkości i różnymi metodami
  PcapUploader    - wgrywa plik PCAP i czeka na wynik zadania (mierzony czas całego importu)

Uruchomienie: zobacz load_tests/README.md
"""
import random
import time

from locust import HttpUser, between, task

from traffic import mixed_batch, pcap_bytes


class DashboardViewer(HttpUser):
    weight = 6
    wait_time = between(2, 5)
    alert_ids: list[int] = []

    def on_start(self):
        self.client.get("/health")

    @task(5)
    def list_alerts(self):
        with self.client.get("/api/v1/alerts", name="GET /api/v1/alerts", catch_response=True) as r:
            if r.ok:
                ids = [a["id"] for a in r.json()]
                if ids:
                    DashboardViewer.alert_ids = ids[:200]
                r.success()

    @task(2)
    def alert_details(self):
        if DashboardViewer.alert_ids:
            self.client.get(f"/api/v1/alerts/{random.choice(DashboardViewer.alert_ids)}", name="GET /api/v1/alerts/[id]")

    @task(1)
    def config(self):
        self.client.get("/api/v1/detection/config", name="GET /api/v1/detection/config")

    @task(2)
    def health(self):
        self.client.get("/health", name="GET /health")


class Analyst(HttpUser):
    weight = 2
    wait_time = between(3, 8)

    def analyze(self, flows: int, method: str):
        self.client.post(f"/api/v1/analysis/flows?method={method}", json={"flows": mixed_batch(flows)},
                         name=f"POST /analysis/flows {method} [{flows} flow]")

    @task(3)
    def rules_small(self):
        self.analyze(100, "rules")

    @task(3)
    def rules_large(self):
        self.analyze(1000, "rules")

    @task(1)
    def statistical_large(self):
        self.analyze(1000, "statistical")

    @task(1)
    def ml_large(self):
        self.analyze(1000, "ml")


class PcapUploader(HttpUser):
    weight = 1
    wait_time = between(10, 20)
    POLL_SECONDS = 0.25
    TIMEOUT_SECONDS = 120

    @task
    def upload_and_wait(self):
        started = time.perf_counter()
        r = self.client.post("/api/v1/analysis/pcap?method=rules", name="POST /analysis/pcap [upload]",
                             files={"file": ("load.pcap", pcap_bytes(), "application/vnd.tcpdump.pcap")})
        if r.status_code != 202:
            return
        job_id = r.json()["job_id"]
        status, error = "queued", None
        while status in ("queued", "processing"):
            if time.perf_counter() - started > self.TIMEOUT_SECONDS:
                error = TimeoutError(f"zadanie {job_id} nie zakończyło się w {self.TIMEOUT_SECONDS} s")
                break
            time.sleep(self.POLL_SECONDS)
            job = self.client.get(f"/api/v1/analysis/pcap/{job_id}", name="GET /analysis/pcap/[job_id]").json()
            status = job["status"]
            if status == "failed":
                error = RuntimeError(job.get("error") or "zadanie zakończone błędem")
        # osobna pozycja w raporcie: czas od wysłania pliku do gotowego wyniku (upload + kolejka + analiza)
        self.environment.events.request.fire(
            request_type="JOB", name="PCAP: upload -> wynik", response_time=(time.perf_counter() - started) * 1000,
            response_length=0, exception=error, context={},
        )
