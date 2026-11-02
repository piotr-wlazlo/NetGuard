from dataclasses import dataclass, field, fields
from datetime import datetime
from enum import Enum
from typing import Optional


class AnomalyType(str, Enum):
    PORT_SCAN = "PORT_SCAN"
    HOST_SWEEP = "HOST_SWEEP"
    SYN_FLOOD = "SYN_FLOOD"
    DDOS = "DDOS"
    EXFILTRATION = "EXFILTRATION"
    STAT_OUTLIER = "STAT_OUTLIER"


class Priority(str, Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class AlertStatus(str, Enum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


OPEN_ALERT_STATUSES = (AlertStatus.NEW, AlertStatus.ACKNOWLEDGED)

DISTRIBUTED_TYPES = ("SYN_FLOOD", "DDOS")

class Severity(str, Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class Flow:
    source_ip: str
    destination_ip: str
    source_port: Optional[int]
    destination_port: Optional[int]
    protocol: str
    packet_count: int
    byte_count: int
    start_time: datetime
    end_time: datetime
    duration_ms: float
    syn_count: int = 0
    ack_count: int = 0
    rst_count: int = 0
    fin_count: int = 0
    fwd_packets: int = 0
    fwd_bytes: int = 0
    bwd_packets: int = 0
    bwd_bytes: int = 0
    id: Optional[int] = None
    source_type: str = ""
    source_name: str = ""

    @classmethod
    def from_dict(cls, data):
        known = {f.name for f in fields(cls)}
        values = {k: v for k, v in data.items() if k in known}
        for key in ("start_time", "end_time"):
            if isinstance(values[key], str):
                values[key] = datetime.fromisoformat(values[key])
        return cls(**values)


@dataclass
class Detection:
    flow_id: Optional[int]
    detection_method: str
    is_anomaly: bool
    anomaly_type: Optional[str]
    confidence: float
    severity: Optional[str]
    explanation: str
    id: Optional[int] = None

    def __post_init__(self):
        if not 0 <= self.confidence <= 1:
            raise ValueError("Confidence must be between 0 and 1.")
        if self.anomaly_type is not None:
            AnomalyType(self.anomaly_type)
        if self.severity is not None:
            Severity(self.severity)


@dataclass
class DetectionResult:
    detection: Detection
    flow: Flow
    risk_score: float = 0.0
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None


@dataclass
class Alert:
    title: str
    description: str
    priority: Priority
    group_key: str
    detection_id: Optional[int] = None
    risk_score: float = 0.0
    status: AlertStatus = AlertStatus.NEW
    id: Optional[int] = None


_IMPACT_DEFAULTS = {
    AnomalyType.EXFILTRATION: 1.0,
    AnomalyType.SYN_FLOOD: 0.9,
    AnomalyType.DDOS: 0.9,
    AnomalyType.PORT_SCAN: 0.6,
    AnomalyType.HOST_SWEEP: 0.6,
    AnomalyType.STAT_OUTLIER: 0.4,
}


@dataclass(frozen=True)
class DetectionConfig:
    port_scan_min_ports: int = 100
    host_sweep_min_hosts: int = 50
    syn_flood_min_syns: int = 1000
    syn_flood_half_open_ratio: float = 0.9
    ddos_min_sources: int = 200
    exfiltration_min_bytes: int = 50_000_000
    exfiltration_min_ratio: float = 20.0
    z_threshold: float = 3.5
    min_baseline_windows: int = 30
    mad_floor: float = 0.1
    window_seconds: int = 60
    sliding_window_seconds: int = 300
    protected_cidrs: tuple = ()
    ml_score_threshold: float = 0.65
    impact: dict = field(default_factory=lambda: dict(_IMPACT_DEFAULTS))
