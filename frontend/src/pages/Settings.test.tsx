import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { mockApi } from '../test/api-mock'
import { healthOk, renderApp } from '../test/render'

const config = {
  batch_size: 5000,
  parameters: {
    common: {
      batch_size: 5000,
      small_flow_packets: 3,
      port_scan_min_ports: 100,
      ddos_min_sources: 200,
      brute_force_min_attempts: 20,
    },
    statistical: { z_threshold: 3.5, mad_floor: 0.1, min_flows: 10 },
    ml: { ml_score_threshold: 0.65 },
  },
  anomaly_types: ['PORT_SCAN', 'BRUTE_FORCE', 'DDOS'],
}

const alertsEmpty = { 'GET /api/v1/alerts': { json: [] } }

describe('strona Konfiguracja', () => {
  it('wyświetla parametry pogrupowane w sekcje oraz wykrywane typy anomalii', async () => {
    mockApi({ ...healthOk, ...alertsEmpty, 'GET /api/v1/detection/config': { json: config } })
    renderApp('/settings')

    expect(await screen.findByLabelText('Skan portów: min. liczba portów')).toHaveValue('100')
    expect(screen.getByLabelText('Próg robust z-score')).toHaveValue('3.5')
    expect(screen.getByLabelText('Próg wyniku Isolation Forest')).toHaveValue('0.65')
    expect(screen.getByText('Parametry wspólne')).toBeInTheDocument()
    expect(screen.getByText('Wykrywane typy anomalii')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Zapis zmian' })).not.toBeInTheDocument()
  })

  it('blokuje zapis przy błędnej wartości i pokazuje powód', async () => {
    mockApi({ ...healthOk, ...alertsEmpty, 'GET /api/v1/detection/config': { json: config } })
    const user = userEvent.setup()
    renderApp('/settings')

    const field = await screen.findByLabelText('Skan portów: min. liczba portów')
    await user.clear(field)
    await user.type(field, '0')

    expect(screen.getByText('Wartość musi być większa od zera.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Zapisz zmiany/ })).toBeDisabled()

    await user.clear(field)
    await user.type(field, '12.5')
    expect(screen.getByText('Wymagana liczba całkowita.')).toBeInTheDocument()
  })

  it('wysyła do API wyłącznie zmienione parametry i czyści stan edycji', async () => {
    const calls = mockApi({
      ...healthOk,
      ...alertsEmpty,
      'GET /api/v1/detection/config': { json: config },
      'PUT /api/v1/detection/config': {
        json: {
          ...config,
          parameters: {
            ...config.parameters,
            common: { ...config.parameters.common, port_scan_min_ports: 80 },
            statistical: { ...config.parameters.statistical, z_threshold: 4.2 },
          },
        },
      },
    })
    const user = userEvent.setup()
    renderApp('/settings')

    const ports = await screen.findByLabelText('Skan portów: min. liczba portów')
    await user.clear(ports)
    await user.type(ports, '80')
    const z = screen.getByLabelText('Próg robust z-score')
    await user.clear(z)
    await user.type(z, '4,2') // przecinek dziesiętny jak w polskich ustawieniach

    expect(screen.getByText('Niezapisane zmiany: 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true))
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      common: { port_scan_min_ports: 80 },
      statistical: { z_threshold: 4.2 },
    })
    expect(await screen.findByText(/Zapisano 2 parametry/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Zapis zmian' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Skan portów: min. liczba portów')).toHaveValue('80')
  })

  it('wartość wpisana, a równa serwerowej, nie jest zmianą', async () => {
    mockApi({ ...healthOk, ...alertsEmpty, 'GET /api/v1/detection/config': { json: config } })
    const user = userEvent.setup()
    renderApp('/settings')

    const field = await screen.findByLabelText('Skan portów: min. liczba portów')
    await user.clear(field)
    await user.type(field, '100')
    expect(screen.queryByRole('region', { name: 'Zapis zmian' })).not.toBeInTheDocument()
  })

  it('pokazuje komunikaty błędów walidacji zwróconych przez API', async () => {
    mockApi({
      ...healthOk,
      ...alertsEmpty,
      'GET /api/v1/detection/config': { json: config },
      'PUT /api/v1/detection/config': { status: 422, json: { detail: 'Unknown parameters: [common.x].' } },
    })
    const user = userEvent.setup()
    renderApp('/settings')

    const field = await screen.findByLabelText('Skan portów: min. liczba portów')
    await user.clear(field)
    await user.type(field, '90')
    await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

    expect(await screen.findByText('Unknown parameters: [common.x].')).toBeInTheDocument()
    expect(screen.getByLabelText('Skan portów: min. liczba portów')).toHaveValue('90') // edycja nie ginie
  })

  it('przywraca domyślne dopiero po potwierdzeniu', async () => {
    const calls = mockApi({
      ...healthOk,
      ...alertsEmpty,
      'GET /api/v1/detection/config': { json: config },
      'POST /api/v1/detection/reset': { status: 204 },
    })
    const user = userEvent.setup()
    renderApp('/settings')

    await user.click(await screen.findByRole('button', { name: 'Przywróć domyślne' }))
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    await user.click(await screen.findByRole('button', { name: 'Przywróć' }))
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    expect(await screen.findByText('Przywrócono wartości domyślne.')).toBeInTheDocument()
  })
})
