from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


class Detection(SQLModel, table=True):
    __tablename__ = "detections"

    id: Optional[int] = Field(default=None, primary_key=True)
    flow_id: Optional[int] = Field(default=None, foreign_key="network_flows.id")
    detection_method: Optional[str] = None
    is_anomaly: Optional[bool] = None
    anomaly_type: Optional[str] = None
    confidence: Optional[float] = None
    severity: Optional[str] = None
    explanation: Optional[str] = None
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
