from datetime import datetime, timezone
from typing import Iterable, Optional
from sqlmodel import Session, delete, select

from netguard.detection.config import DEFAULT_PARAMETERS, seed_default_config
from netguard.detection.detection_engine import DetectionEngine, build_strategy
from netguard.model.detection import Detection
from netguard.model.detection_config import DetectionConfig
from netguard.services.errors import InvalidConfigError


class DetectionService:
    def detect(
        self, session: Session, packets: Iterable[dict], method: str = "rules"
    ) -> list[Detection]:
        seed_default_config(session)
        try:
            strategy = build_strategy(method, session)
        except ValueError as error:
            raise InvalidConfigError(str(error)) from error
        return list(DetectionEngine(strategy, session).detect(packets))

    def get_config(self, session: Session) -> list[DetectionConfig]:
        seed_default_config(session)
        statement = select(DetectionConfig).order_by(
            DetectionConfig.method, DetectionConfig.parameter_name
        )
        return list(session.exec(statement).all())

    def replace_parameters(
        self, session: Session, values: dict[Optional[str], dict[str, float]]
    ) -> list[DetectionConfig]:
        normalized = {(m or "common"): params for m, params in values.items()}
        unknown = sorted(
            f"{method}.{name}"
            for method, parameters in normalized.items()
            for name in parameters
            if name not in DEFAULT_PARAMETERS.get(method, {})
        )
        if unknown:
            raise InvalidConfigError(f"Unknown parameters: {unknown}.")

        rows = {(r.method or "common", r.parameter_name): r for r in self.get_config(session)}
        now = datetime.now(timezone.utc)
        for method, parameters in normalized.items():
            for name, value in parameters.items():
                row = rows[(method, name)]
                row.parameter_value, row.updated_at = str(value), now
        session.commit()
        return self.get_config(session)

    def reset(self, session: Session) -> list[DetectionConfig]:
        session.exec(delete(DetectionConfig))
        session.commit()
        return self.get_config(session)