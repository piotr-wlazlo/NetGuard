# NetGuard

Network anomaly detection, simplified: PCAP → Redis stream → flows → **Detection Engine** → **Alert Engine**.
Everything runs in one process; alerts are kept in memory (no database, no API, no simulator).

```bash
pip install -r requirements.txt
docker compose up -d redis
python -m netguard.main            # imports data/monday_sample.pcap, prints flows and alerts
python -m netguard.flow_worker     # same analysis for an existing stream name
pytest                             # Redis tests skip when Redis is down
```

| Component | Code |
|---|---|
| PCAP Importer | `pcap_importer.py`, `packet_validation.py` |
| Message Broker (Redis) | `packet_stream.py`, `redis_conn.py` |
| Flow Processor | `flow_processor.py` (idle timeout, client-based direction, TCP flag counters) |
| Detection Engine | `detection/` – strategies in `detectors/`: rules, statistical, optional ML |
| Alert Engine | `alert_engine.py` – grouping, priority P1–P4, suppression, status |

## Detection Engine

Detection methods are interchangeable **strategies** behind the `Detector` protocol
(`prepare`, `covers`, `evaluate -> Verdict | None`). Per tumbling window: build tumbling +
sliding context → each detector votes → `scoring.py` merges verdicts into type, risk,
severity and confidence → `explanation.py` writes text + JSON evidence. The baseline learns
only from entities not flagged in the window. The ML detector is optional
(`detection.factory.build_detectors(model_path)`).
