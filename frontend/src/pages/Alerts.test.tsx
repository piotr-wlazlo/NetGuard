import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/api-mock'
import { healthOk, makeAlert, renderApp } from '../test/render'

const alerts = [
  makeAlert(3, { priority: 'LOW', status: 'RESOLVED', created_at: '2026-11-16T09:00:00Z' }),
  makeAlert(2, {
    group_key: 'DDOS|*|10.0.0.6',
    title: 'DDOS multiple sources → 10.0.0.6',
    description: '220 flows, [rules] DDOS: x -> 10.0.0.6, confidence high (0.92)',
    priority: 'CRITICAL',
    status: 'NEW',
    created_at: '2026-11-16T11:00:00Z',
  }),
  makeAlert(1, { priority: 'HIGH', status: 'ACKNOWLEDGED', created_at: '2026-11-16T10:00:00Z' }),
]

function dataRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

describe('strona Alerty', () => {
  it('wyświetla alerty od najnowszych i liczbę wyników', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    renderApp('/alerts')

    await screen.findByRole('table')
    expect(dataRows()).toHaveLength(3)
    expect(within(dataRows()[0]).getByText('DDoS')).toBeInTheDocument()
    expect(screen.getByText(/1–3 z 3 alertów/)).toBeInTheDocument()
  })

  it('filtruje po tekście i statusie oraz pozwala wyczyścić filtry', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    const user = userEvent.setup()
    renderApp('/alerts')
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox'), '10.0.0.6')
    expect(dataRows()).toHaveLength(1)
    expect(screen.getByText(/przefiltrowano z 3/)).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'OPEN')
    expect(dataRows()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Wyczyść filtry/ }))
    expect(dataRows()).toHaveLength(3)
  })

  it('pokazuje komunikat, gdy żaden alert nie pasuje do filtrów', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    const user = userEvent.setup()
    renderApp('/alerts')
    await screen.findByRole('table')

    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(await screen.findByText('Żaden alert nie pasuje do filtrów')).toBeInTheDocument()
  })

  it('sortuje wg priorytetu', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    const user = userEvent.setup()
    renderApp('/alerts')
    await screen.findByRole('table')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sortowanie' }), 'severity')
    const priorities = dataRows().map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(priorities).toEqual(['Krytyczny', 'Wysoki', 'Niski'])
  })

  it('pokazuje stan pusty, gdy nie ma alertów', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
    renderApp('/alerts')
    expect(await screen.findByText('Brak alertów')).toBeInTheDocument()
  })

  it('pokazuje błąd i pozwala ponowić, gdy API jest niedostępne', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { status: 500, json: { detail: 'Błąd bazy' } } })
    renderApp('/alerts')
    expect(await screen.findByText('Błąd bazy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Spróbuj ponownie/ })).toBeInTheDocument()
  })
})

describe('panel szczegółów alertu', () => {
  it('otwiera się z adresu /alerts/:id i pokazuje dane z grupy', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    renderApp('/alerts/2')

    const drawer = await screen.findByRole('dialog', { name: 'Szczegóły alertu #2' })
    expect(await within(drawer).findByText('Uzasadnienie detekcji')).toBeInTheDocument()
    expect(within(drawer).getByText('Wiele źródeł (atak rozproszony)')).toBeInTheDocument()
    expect(within(drawer).getByText('DDOS|*|10.0.0.6')).toBeInTheDocument()
    expect(within(drawer).getByText('220')).toBeInTheDocument()
  })

  it('panel szczegółów pokazuje metodę detekcji odczytaną z opisu', async () => {
    mockApi({
      ...healthOk,
      'GET /api/v1/alerts': {
        json: [makeAlert(3, { description: '9 flows, [ml] BRUTE_FORCE (IsolationForest score=0.71), confidence high (0.80)' })],
      },
    })
    renderApp('/alerts/3')

    const drawer = await screen.findByRole('dialog', { name: 'Szczegóły alertu #3' })
    expect(await within(drawer).findByText('ML (Isolation Forest)')).toBeInTheDocument()
  })

  it('informuje, gdy alert nie istnieje', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
    renderApp('/alerts/999')
    expect(await screen.findByText('Nie znaleziono alertu #999.')).toBeInTheDocument()
  })

  it('zmienia status przez API i odświeża widok', async () => {
    const calls = mockApi({
      ...healthOk,
      'GET /api/v1/alerts': { json: alerts },
      'PUT /api/v1/alerts/2/status': (request) => ({
        json: { ...alerts[1], status: (request.body as { status: string }).status },
      }),
    })
    const user = userEvent.setup()
    renderApp('/alerts/2')

    const group = await screen.findByRole('group', { name: 'Zmień status alertu' })
    await user.click(within(group).getByRole('button', { name: 'Rozwiązany' }))

    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Rozwiązany' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ status: 'RESOLVED' })
    expect(await screen.findByText(/status „Rozwiązany”/)).toBeInTheDocument()
  })

  it('usuwa alert dopiero po potwierdzeniu', async () => {
    const calls = mockApi({
      ...healthOk,
      'GET /api/v1/alerts': { json: alerts },
      'DELETE /api/v1/alerts/2': { status: 204 },
    })
    const user = userEvent.setup()
    renderApp('/alerts/2')

    await user.click(await screen.findByRole('button', { name: /Usuń alert/ }))
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false)

    await user.click(await screen.findByRole('button', { name: 'Usuń' }))
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true))
    expect(await screen.findByText('Usunięto alert #2.')).toBeInTheDocument()
    await waitFor(() => expect(dataRows()).toHaveLength(2))
  })
})
