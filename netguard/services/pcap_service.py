"""Import plików PCAP przez API: zapis uploadu, przetwarzanie w tle i status zadania w Redisie.

Przepływ zadania:
  plik PCAP -> parse + walidacja -> strumień Redis (producent, osobny wątek)
            -> ekstrakcja flow -> silnik detekcji -> alerty -> PostgreSQL (konsument)
Producent i konsument działają równolegle, więc detekcja zaczyna się, zanim cały plik zostanie wczytany.
"""
import json
import os
import tempfile
import threading
from collections import Counter
from datetime import datetime, timezone
from time import monotonic
from typing import Callable, Optional
from uuid import uuid4

from sqlmodel import Session

from netguard.data_processing.packet_stream import publish_import_finished, publish_packets, read_packets
from netguard.data_processing.packet_validation import validate_packet
from netguard.data_processing.pcap_importer import parse_packet, read_pcap_file
from netguard.data_processing.redis_conn import create_redis_client
from netguard.services.alert_service import AlertService
from netguard.services.detection_service import DetectionService

MAX_PCAP_BYTES = int(os.getenv("PCAP_MAX_BYTES", str(200 * 1024 * 1024)))
JOB_TTL_SECONDS = 24 * 3600
CHUNK_BYTES = 1024 * 1024
PUBLISH_BATCH = 500
MAX_ALERT_IDS = 50

# Nagłówki plików: pcap (obie kolejności bajtów, wariant z nanosekundami) oraz pcapng
PCAP_MAGIC = (
    b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\xc3\xd4",
    b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d",
    b"\x0a\x0d\x0d\x0a",
)

JOB_STATUSES = ("queued", "processing", "done", "failed")


class InvalidPcapError(ValueError):
    pass


class PcapTooLargeError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def save_upload(source, max_bytes: int = MAX_PCAP_BYTES) -> tuple[str, int]:
    """Kopiuje upload na dysk kawałkami (bez wczytywania całego pliku do pamięci).
    Sprawdza nagłówek PCAP i limit rozmiaru. Zwraca (ścieżka, rozmiar)."""
    first = source.read(CHUNK_BYTES)
    if len(first) < 4 or first[:4] not in PCAP_MAGIC:
        raise InvalidPcapError("Plik nie jest w formacie PCAP ani PCAPNG.")

    fd, path = tempfile.mkstemp(prefix="netguard-", suffix=".pcap")
    size = 0
    try:
        with os.fdopen(fd, "wb") as target:
            chunk = first
            while chunk:
                size += len(chunk)
                if size > max_bytes:
                    raise PcapTooLargeError(f"Plik przekracza limit {max_bytes // (1024 * 1024)} MB.")
                target.write(chunk)
                chunk = source.read(CHUNK_BYTES)
    except BaseException:
        os.remove(path)
        raise
    return path, size


class PcapJobStore:
    """Status zadań w hashu Redisa: widoczny dla wszystkich procesów API, wygasa po 24 h."""

    def __init__(self, client):
        self.client = client

    @staticmethod
    def key(job_id: str) -> str:
        return f"netguard:pcap-jobs:{job_id}"

    def update(self, job_id: str, **fields) -> None:
        encoded = {k: json.dumps(v) for k, v in fields.items()}
        self.client.hset(self.key(job_id), mapping=encoded)
        self.client.expire(self.key(job_id), JOB_TTL_SECONDS)

    def get(self, job_id: str) -> Optional[dict]:
        raw = self.client.hgetall(self.key(job_id))
        if not raw:
            return None
        return {"job_id": job_id, **{k: json.loads(v) for k, v in raw.items()}}


def _default_session() -> Session:
    from netguard.db import engine

    return Session(engine)


class PcapService:
    def __init__(
        self,
        redis_factory: Callable = create_redis_client,
        session_factory: Callable[[], Session] = _default_session,
        detection_service: Optional[DetectionService] = None,
        alert_service: Optional[AlertService] = None,
    ):
        self.redis_factory = redis_factory
        self.session_factory = session_factory
        self.detection_service = detection_service or DetectionService()
        self.alert_service = alert_service or AlertService()

    def create_job(self, filename: str, size_bytes: int, method: str) -> dict:
        job_id = uuid4().hex
        client = self.redis_factory()
        try:
            store = PcapJobStore(client)
            store.update(
                job_id, status="queued", method=method, filename=filename, size_bytes=size_bytes,
                packets_sent=0, packets_rejected=0, packets_skipped=0, detection_count=0,
                detections_by_type={}, alert_count=0, alert_ids=[], error=None,
                created_at=_now(), started_at=None, finished_at=None, duration_ms=None,
            )
            return store.get(job_id)
        finally:
            client.close()

    def get_job(self, job_id: str) -> Optional[dict]:
        client = self.redis_factory()
        try:
            return PcapJobStore(client).get(job_id)
        finally:
            client.close()

    def run(self, job_id: str, path: str, filename: str, method: str) -> None:
        """Przetwarza zapisany plik; wywoływane w tle po odpowiedzi 202."""
        client = self.redis_factory()
        store = PcapJobStore(client)
        stream = f"netguard:packets:{job_id}"
        started = monotonic()
        store.update(job_id, status="processing", started_at=_now())

        state = {"sent": 0, "rejected": 0, "skipped": 0, "error": None}
        stream_ready = threading.Event()

        def valid_packets():
            for raw in read_pcap_file(path):
                parsed = parse_packet(raw, "pcap", filename)
                if parsed is None:  # pakiet bez IP albo spoza TCP/UDP/ICMP
                    state["skipped"] += 1
                    continue
                try:
                    validate_packet(parsed)
                except ValueError:
                    state["rejected"] += 1
                    continue
                yield parsed

        def on_batch(sent: int) -> None:
            state["sent"] = sent
            stream_ready.set()
            store.update(job_id, packets_sent=sent)

        def produce():
            try:
                publish_packets(client, stream, valid_packets(), PUBLISH_BATCH, on_batch)
            except Exception as error:  # uszkodzony plik: kończymy na tym, co udało się wczytać
                state["error"] = f"Błąd odczytu pliku: {error}"
            finally:
                publish_import_finished(client, stream, state["sent"])
                stream_ready.set()

        producer = threading.Thread(target=produce, name=f"pcap-producer-{job_id}", daemon=True)
        producer.start()

        result = {"detection_count": 0, "detections_by_type": {}, "alert_count": 0, "alert_ids": []}
        try:
            stream_ready.wait()
            with self.session_factory() as session:
                detections = self.detection_service.detect(session, read_packets(client, stream), method=method)
                alerts = self.alert_service.generate(session, detections)
                result = {
                    "detection_count": len(detections),
                    "detections_by_type": dict(Counter(getattr(d.anomaly_type, "value", d.anomaly_type) for d in detections)),
                    "alert_count": len(alerts),
                    "alert_ids": [a.id for a in alerts][:MAX_ALERT_IDS],
                }
        except Exception as error:
            state["error"] = state["error"] or f"Błąd analizy: {error}"
        finally:
            producer.join()
            client.delete(stream)
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

        store.update(
            job_id,
            status="failed" if state["error"] else "done",
            error=state["error"],
            packets_sent=state["sent"],
            packets_rejected=state["rejected"],
            packets_skipped=state["skipped"],
            finished_at=_now(),
            duration_ms=round((monotonic() - started) * 1000),
            **result,
        )
        client.close()
