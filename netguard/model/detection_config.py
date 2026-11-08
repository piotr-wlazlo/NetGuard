from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field

class DetectionConfig(SQLModel, table=True):
    __tablename__ = "detection_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    method: Optional[str] = None
    parameter_name: Optional[str] = None
    parameter_value: Optional[str] = None
    updated_at: Optional[datetime] = None
