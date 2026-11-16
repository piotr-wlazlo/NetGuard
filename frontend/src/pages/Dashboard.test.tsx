import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mockApi, mockNetworkDown } from '../test/api-mock'
import { healthOk, makeAlert, renderApp } from '../test/render'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function tile(label: string): HTMLElement {
  const element = screen.getByText(label).closest('.tile')
  if (!(element instanceof HTMLElement)) throw new Error(`Brak kafelka „${label}”`)
  return element
}

describe('strona Przegląd', () => {
  it('pokazuje wskaźniki policzone z alertów', async () => {
    mockApi({
      ...healthOk,
      'GET /api/v1/alerts': {
        json: [
          makeAlert(1, { priority: 'CRITICAL', status: 'NEW', created_at: minutesAgo(5) }),
          makeAlert(2, { priority: 'HIGH', status: 'ACKNOWLEDGED', created_at: minutesAgo(10) }),
          makeAlert(3, { priority: 'LOW', status: 'RESOLVED', created_at: minutesAgo(20) }),
          makeAlert(4, { priority: 'LOW', status: 'FALSE_POSITIVE', created_at: minutesAgo(30) }),
        ],
      },
    })
    renderApp('/')

    await screen.findByText('Ostatnie alerty')
    expect(within(tile('Otwarte alerty')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Krytyczne i wysokie')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Wszystkie alerty')).getByText('4')).toBeInTheDocument()
    expect(within(tile('Fałszywe alarmy')).getByText('50%')).toBeInTheDocument() // 1 z 2 zamkniętych
  })

  it('pokazuje stan pusty z odnośnikiem do analizy, gdy nie ma alertów', async () => {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
    renderApp('/')

    expect(await screen.findByText('Brak wykrytych anomalii')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Przejdź do analizy/ })).toHaveAttribute('href', '/analysis')
  })

  it('pokazuje błąd i podpowiedź uruchomienia, gdy backend nie odpowiada', async () => {
    mockNetworkDown()
    renderApp('/')

    expect(await screen.findByText('Nie udało się pobrać danych')).toBeInTheDocument()
    expect(screen.getByText(/uvicorn netguard\.api\.main:app/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Spróbuj ponownie/ })).toBeInTheDocument()
  })
})
