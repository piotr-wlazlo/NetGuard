from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Alert(SQLModel, table=True):
    __tablename__ = "alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    detection_id: Optional[int] = Field(default=None, foreign_key="detections.id")
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None