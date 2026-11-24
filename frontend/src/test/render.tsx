import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import type { Alert } from '../api/types'

/** Renderuje całą aplikację pod wskazanym adresem, z czystym cache zapytań. */
export function renderApp(route = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

export function makeAlert(id: number, overrides: Partial<Alert> = {}): Alert {
  return {
    id,
    detection_id: id * 10,
    group_key: `PORT_SCAN|203.0.113.${id}|10.0.0.${id}`,
    title: `PORT_SCAN 203.0.113.${id} → 10.0.0.${id}`,
    description: `150 flows, [rules] PORT_SCAN (above threshold x1.50), confidence medium (0.61)`,
    priority: 'MEDIUM',
    status: 'NEW',
    created_at: '2026-11-16T10:00:00Z',
    ...overrides,
  }
}

export const healthOk = { 'GET /health': { json: { status: 'ok' } } }
