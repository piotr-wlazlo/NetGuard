// Typy odpowiadają schematom z netguard/api/schemas.py (origin/main).

export type AnomalyType = 'PORT_SCAN' | 'BRUTE_FORCE' | 'DDOS'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE'
export type DetectionMethod = 'rules' | 'statistical' | 'ml'
export type Protocol = 'TCP' | 'UDP' | 'ICMP'

/** AlertOut — pola tekstowe API zwraca jako `string | null`, więc tak je tu zostawiamy. */
export interface Alert {
  id: number
  detection_id: number | null
  group_key: string | null
  title: string | null
  description: string | null
  priority: string | null
  status: string | null
  created_at: string | null
}

/** DetectionOut */
export interface Detection {
  id: number | null
  flow_id: number | null
  detection_method: string | null
  anomaly_type: string | null
  severity: string | null
  confidence: number | null
  explanation: string | null
}

/** AnalysisResponse */
export interface AnalysisResponse {
  flow_count: number
  detection_count: number
  detections: Detection[]
  alert_count: number
  alerts: Alert[]
}

/** FlowInput — jedno flow wysyłane do POST /api/v1/analysis/flows. */
export interface FlowInput {
  source_ip: string
  destination_ip: string
  source_port: number | null
  destination_port: number | null
  protocol: Protocol
  packet_count: number
  byte_count: number
  start_time: string
  end_time: string
  duration_ms: number
  source_type?: string
  source_name?: string
}

/** ConfigOut */
export interface ConfigResponse {
  batch_size: number
  parameters: Record<string, Record<string, number>>
  anomaly_types: string[]
}

/** ParametersIn — wysyłamy tylko zmienione parametry (backend aktualizuje wyłącznie podane). */
export type ConfigUpdate = Record<string, Record<string, number>>

export interface HealthResponse {
  status: string
}

export type PcapJobStatus = 'queued' | 'processing' | 'done' | 'failed'

/** PcapJobOut — status zadania importu PCAP (POST /api/v1/analysis/pcap, GET .../pcap/{job_id}). */
export interface PcapJob {
  job_id: string
  status: PcapJobStatus
  method: DetectionMethod
  filename: string
  size_bytes: number
  packets_sent: number
  packets_rejected: number
  packets_skipped: number
  detection_count: number
  detections_by_type: Record<string, number>
  alert_count: number
  alert_ids: number[]
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
}
