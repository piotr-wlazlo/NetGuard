import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/api-mock'
import { healthOk, makeAlert, renderApp } from '../test/render'

const analysisResponse = {
  flow_count: 3,
  detection_count: 2,
  detections: [
    { id: 1, flow_id: 11, detection_method: 'rules', anomaly_type: 'PORT_SCAN', severity: 'LOW', confidence: 0.18, explanation: '[rules] PORT_SCAN: a -> b' },
    { id: 2, flow_id: 12, detection_method: 'rules', anomaly_type: 'PORT_SCAN', severity: 'LOW', confidence: 0.18, explanation: '[rules] PORT_SCAN: a -> b' },
  ],
  alert_count: 1,
  alerts: [makeAlert(7)],
}

function api() {
  return mockApi({
    ...healthOk,
    'GET /api/v1/alerts': { json: [] },
    'POST /api/v1/analysis/flows': { json: analysisResponse },
  })
}

describe('strona Analiza', () => {
  it('wysyła wybrany scenariusz i metodę, a potem pokazuje wynik', async () => {
    const calls = api()
    const user = userEvent.setup()
    renderApp('/analysis')

    await user.click(await screen.findByRole('button', { name: 'Uruchom analizę' }))

    expect(await screen.findByText('Wynik analizy')).toBeInTheDocument()
    const post = calls.find((call) => call.method === 'POST')!
    expect(post.path).toBe('/api/v1/analysis/flows?method=rules')
    expect((post.body as { flows: unknown[] }).flows).toHaveLength(770) // „ruch mieszany”: 400 normalnych + 370 ataków
    expect(await screen.findByText('Utworzone alerty')).toBeInTheDocument()
  })

  it('blokuje uruchomienie przy błędnej liczbie flow w scenariuszu', async () => {
    api()
    const user = userEvent.setup()
    renderApp('/analysis')

    const count = await screen.findByLabelText('Liczba flow normalnych')
    await user.clear(count)
    await user.type(count, '99999')

    expect(screen.getByText(/Podaj liczbę całkowitą od 10 do 630/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uruchom analizę' })).toBeDisabled()
  })

  it('pokazuje błąd walidacji z API razem ze szczegółami', async () => {
    mockApi({
      ...healthOk,
      'GET /api/v1/alerts': { json: [] },
      'POST /api/v1/analysis/flows': {
        status: 422,
        json: { detail: [{ loc: ['body', 'flows', 0, 'source_ip'], msg: 'Input is not a valid IPv4 address' }] },
      },
    })
    const user = userEvent.setup()
    renderApp('/analysis')

    await user.click(await screen.findByRole('button', { name: 'Uruchom analizę' }))
    expect(await screen.findByText('Dane nie przeszły walidacji.')).toBeInTheDocument()
    expect(screen.getByText('flows.0.source_ip: Input is not a valid IPv4 address')).toBeInTheDocument()
  })
})
