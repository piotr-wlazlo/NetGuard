import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { request } from './client'
import type {
  Alert,
  AlertStatus,
  AnalysisResponse,
  ConfigResponse,
  ConfigUpdate,
  DetectionMethod,
  FlowInput,
  HealthResponse,
  PcapJob,
} from './types'

export const queryKeys = {
  health: ['health'] as const,
  alerts: ['alerts'] as const,
  config: ['config'] as const,
}

const ALERTS_POLL_MS = 10_000
const HEALTH_POLL_MS = 15_000
export const PCAP_POLL_MS = 1_000

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => request<HealthResponse>('/health'),
    refetchInterval: HEALTH_POLL_MS,
    retry: false,
  })
}

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => request<Alert[]>('/api/v1/alerts'),
    refetchInterval: ALERTS_POLL_MS,
  })
}

export function useSetAlertStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AlertStatus }) =>
      request<Alert>(`/api/v1/alerts/${id}/status`, { method: 'PUT', json: { status } }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Alert[]>(queryKeys.alerts, (old) =>
        old?.map((alert) => (alert.id === updated.id ? updated : alert)),
      )
    },
  })
}

export function useDeleteAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => request<void>(`/api/v1/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Alert[]>(queryKeys.alerts, (old) =>
        old?.filter((alert) => alert.id !== id),
      )
    },
  })
}

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => request<ConfigResponse>('/api/v1/detection/config'),
    // nie odświeżamy po powrocie do karty, żeby nie nadpisać widoku w trakcie edycji
    refetchOnWindowFocus: false,
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: ConfigUpdate) =>
      request<ConfigResponse>('/api/v1/detection/config', { method: 'PUT', json: update }),
    onSuccess: (config) => queryClient.setQueryData(queryKeys.config, config),
  })
}

export function useResetConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request<void>('/api/v1/detection/reset', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.config }),
  })
}

export function useAnalyze() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ flows, method }: { flows: FlowInput[]; method: DetectionMethod }) =>
      request<AnalysisResponse>(`/api/v1/analysis/flows?method=${method}`, {
        method: 'POST',
        json: { flows },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  })
}

export function useUploadPcap() {
  return useMutation({
    mutationFn: ({ file, method }: { file: File; method: DetectionMethod }) => {
      const form = new FormData()
      form.append('file', file)
      return request<PcapJob>(`/api/v1/analysis/pcap?method=${method}`, { method: 'POST', form })
    },
  })
}

/** Status zadania PCAP; odpytywany co sekundę, dopóki zadanie trwa. */
export function usePcapJob(jobId: string | null) {
  return useQuery({
    queryKey: ['pcap-job', jobId],
    queryFn: () => request<PcapJob>(`/api/v1/analysis/pcap/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'done' || status === 'failed' ? false : PCAP_POLL_MS
    },
    refetchOnWindowFocus: false,
  })
}
