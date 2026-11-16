from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import SQLModel, Field


class SimulationConfig(SQLModel, table=True):
    __tablename__ = "simulation_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: Optional[str] = None
    duration_seconds: Optional[int] = None
    packet_rate: Optional[int] = None
    anomaly_ratio: Optional[Decimal] = None
    created_at: Optional[datetime] = None