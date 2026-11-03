from fastapi import APIRouter

from netguard.domain import AnomalyType, DetectionConfig


router = APIRouter(
    prefix="/api/v1/detection",
    tags=["detection"]
)


@router.get("/config")
def get_detection_config():
    """Returns default detection engine configuration."""

    config = DetectionConfig()

    return {
        "window_seconds": config.window_seconds,
        "sliding_window_seconds": config.sliding_window_seconds,
        "port_scan_min_ports": config.port_scan_min_ports,
        "host_sweep_min_hosts": config.host_sweep_min_hosts,
        "syn_flood_min_syns": config.syn_flood_min_syns,
        "ddos_min_sources": config.ddos_min_sources
    }


@router.get("/types")
def get_anomaly_types():
    """Returns supported anomaly types."""

    return {"types": [anomaly.value for anomaly in AnomalyType]}
