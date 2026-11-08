from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import SQLModel, Field


class NetworkFlow(SQLModel, table=True):
    __tablename__ = "network_flows"

    id: Optional[int] = Field(default=None, primary_key=True)
    source_type: Optional[str] = None
    source_name: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    source_port: Optional[int] = None
    destination_port: Optional[int] = None
    protocol: Optional[str] = None
    packet_count: Optional[int] = None
    byte_count: Optional[Decimal] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[Decimal] = None
