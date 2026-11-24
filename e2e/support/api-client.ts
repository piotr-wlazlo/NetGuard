import type { APIRequestContext, APIResponse } from '@playwright/test'

import type { FlowPayload } from './flow-builder'
import { FlowBuilder } from './flow-builder'

export interface AlertDto {
  id: number
  detection_id: number | null
  group_key: string | null
  title: string | null
  description: string | null
  priority: string | null
  status: string | null
  created_at: string | null
}

export interface AnalysisDto {
  flow_count: number
  detection_count: number
  alert_count: number
  alerts: AlertDto[]
}

export interface ConfigDto {
  batch_size: number
  parameters: Record<string, Record<string, number>>
  anomaly_types: string[]
}

export type DetectionMethod = 'rules' | 'statistical' | 'ml'

/**
 * Wzorzec Fasada (Facade): jedno miejsce, przez które testy rozmawiają z REST API.
 *
 * Używamy go do przygotowania stanu (seed) i sprzątania oraz do dodatkowej weryfikacji:
 * akcję wykonujemy przez UI, a skutek potwierdzamy zapytaniem do API. Dzięki temu test UI
 * nie opiera się na niczym poza tym, co sprawdza.
 */
export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  async health(): Promise<void> {
    await this.ensureOk(await this.request.get('/health'))
  }

  async listAlerts(): Promise<AlertDto[]> {
    return this.json<AlertDto[]>(await this.request.get('/api/v1/alerts'))
  }

  async getAlert(id: number): Promise<AlertDto> {
    return this.json<AlertDto>(await this.request.get(`/api/v1/alerts/${id}`))
  }

  async deleteAllAlerts(): Promise<void> {
    for (const alert of await this.listAlerts()) {
      await this.ensureOk(await this.request.delete(`/api/v1/alerts/${alert.id}`))
    }
  }

  async getConfig(): Promise<ConfigDto> {
    return this.json<ConfigDto>(await this.request.get('/api/v1/detection/config'))
  }

  /** Przywraca domyślne progi detekcji. */
  async resetConfig(): Promise<void> {
    await this.ensureOk(await this.request.post('/api/v1/detection/reset'))
  }

  async analyze(flows: FlowPayload[], method: DetectionMethod = 'rules'): Promise<AnalysisDto> {
    return this.json<AnalysisDto>(
      await this.request.post(`/api/v1/analysis/flows?method=${method}`, { data: { flows } }),
    )
  }

  /** Stan wyjściowy z dokumentu testów API: jeden alert PORT_SCAN powstały po analizie 150 portów. */
  async seedPortScanAlert(): Promise<AlertDto> {
    const result = await this.analyze(new FlowBuilder().portScan(150))
    return this.firstAlert(result)
  }

  async seedBruteForceAlert(): Promise<AlertDto> {
    const result = await this.analyze(new FlowBuilder().from('203.0.113.9').to('10.0.0.22').bruteForce(40))
    return this.firstAlert(result)
  }

  async seedDdosAlert(): Promise<AlertDto> {
    const result = await this.analyze(new FlowBuilder().to('10.0.0.80').ddos(250))
    return this.firstAlert(result)
  }

  private firstAlert(result: AnalysisDto): AlertDto {
    const [alert] = result.alerts
    if (!alert) throw new Error(`Analiza nie utworzyła alertu: ${JSON.stringify(result).slice(0, 300)}`)
    return alert
  }

  private async ensureOk(response: APIResponse): Promise<void> {
    if (!response.ok()) {
      throw new Error(`${response.url()} -> ${response.status()}: ${await response.text()}`)
    }
  }

  private async json<T>(response: APIResponse): Promise<T> {
    await this.ensureOk(response)
    return (await response.json()) as T
  }
}
