from datetime import datetime, timezone
from sqlmodel import Session, select
from netguard.model.detection_config import DetectionConfig

DEFAULT_PARAMETERS: dict[str, dict[str, float]] = {
    "common": {
        "batch_size": 5000,
        "small_flow_packets": 3,
        "port_scan_min_ports": 100,
        "ddos_min_sources": 200,
        "brute_force_min_attempts": 20, # domyślnie było 20, ale ustawiłem 5, żeby w main wykrywać anomalie
    },
    "statistical": {
        "z_threshold": 3.5,
        "mad_floor": 0.1,
        "min_flows": 10,
    },
    "ml": {
        "ml_score_threshold": 0.65,
    },
}


def seed_default_config(session: Session) -> None:
    existing = {(r.method, r.parameter_name) for r in session.exec(select(DetectionConfig))}
    now = datetime.now(timezone.utc)
    for method, params in DEFAULT_PARAMETERS.items():
        for name, value in params.items():
            if (method, name) not in existing:
                session.add(
                    DetectionConfig(
                        method=method,
                        parameter_name=name,
                        parameter_value=str(value),
                        updated_at=now,
                    )
                )
    session.commit()


def load_parameters(session: Session, method: str) -> dict[str, float]:
    params = dict(DEFAULT_PARAMETERS["common"])
    params.update(DEFAULT_PARAMETERS.get(method, {}))

    rows = session.exec(
        select(DetectionConfig).where(DetectionConfig.method.in_(("common", method)))
    ).all()
    for row in rows:
        params[row.parameter_name] = float(row.parameter_value)
    return params