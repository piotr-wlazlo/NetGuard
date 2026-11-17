import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { mockApi, mockNetworkDown } from "../test/api-mock"
import { healthOk, makeAlert, renderApp } from "../test/render"

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function api(alerts: unknown[]) {
    return mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alerts } })
}

function alertRequests(calls: ReturnType<typeof mockApi>) {
    return calls.filter((call) => call.path === '/api/v1/alerts').length
}

function tile(label: string): HTMLElement {
    const element = screen.getByText(label).closest('.tile')
    if (!(element instanceof HTMLElement)) throw new Error(`No tile "${label}"`)
    return element
}

function card(title: string): HTMLElement {
    const element = screen.getByRole('heading', { name: title }).closest('.card')
    if (!(element instanceof HTMLElement)) throw new Error(`No card "${title}"`)
    return element
}

function barLabels(title: string) {
    return [...card(title).querySelectorAll('.barlist .label')].map((label) => label.textContent)
}

async function renderDashboard(alerts: unknown[]) {
    const calls = api(alerts)
    renderApp('/')
    await screen.findByText('Ostatnie alerty')
    return calls
}

describe('Dashboard: states', () => {
    it('shows loading placeholders before data arrives', () => {
        api([])
        renderApp('/')

        expect(screen.getByRole('status', { name: 'Ładowanie danych' })).toBeInTheDocument()
    })

    it('shows empty state with link to analysis when there are no alerts', async () => {
        api([])
        renderApp('/')

        expect(await screen.findByText('Brak wykrytych anomalii')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Przejdź do analizy/ })).toHaveAttribute('href', '/analysis')
    })

    it('shows error and backend hint when API is not reachable', async () => {
        mockNetworkDown()
        renderApp('/')

        expect(await screen.findByText('Nie udało się pobrać danych')).toBeInTheDocument()
        expect(screen.getByText(/uvicorn netguard\.api\.main:app/)).toBeInTheDocument()
    })

    it('loads data again after clicking retry', async () => {
        let attempt = 0
        mockApi({
            ...healthOk,
            'GET /api/v1/alerts': () =>
                attempt++ === 0 ? { status: 500, json: { detail: 'Błąd bazy' } } : { json: [makeAlert(1)] },
        })
        const user = userEvent.setup()
        renderApp('/')

        await user.click(await screen.findByRole('button', { name: /Spróbuj ponownie/ }))

        expect(await screen.findByText('Ostatnie alerty')).toBeInTheDocument()
    })

    it('sets browser tab title', async () => {
        api([])
        renderApp('/')

        await waitFor(() => expect(document.title).toBe('Przegląd · NetGuard'))
    })
})

describe('Dashboard: refresh', () => {
    it('shows time of last refresh', async () => {
        await renderDashboard([makeAlert(1)])

        expect(screen.getByText(/^Odświeżono \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument()
    })

    it('fetches alerts again after clicking refresh', async () => {
        const calls = await renderDashboard([makeAlert(1)])
        const user = userEvent.setup()
        const before = alertRequests(calls)

        await user.click(screen.getByRole('button', { name: 'Odśwież' }))

        await waitFor(() => expect(alertRequests(calls)).toBe(before + 1))
    })
})

describe('Dashboard: indicators', () => {
    it('counts indicators from alerts', async () => {
        await renderDashboard([
            makeAlert(1, { priority: 'CRITICAL', status: 'NEW', created_at: minutesAgo(5) }),
            makeAlert(2, { priority: 'HIGH', status: 'ACKNOWLEDGED', created_at: minutesAgo(10) }),
            makeAlert(3, { priority: 'LOW', status: 'RESOLVED', created_at: minutesAgo(20) }),
            makeAlert(4, { priority: 'LOW', status: 'FALSE_POSITIVE', created_at: minutesAgo(30) }),
        ])

        expect(within(tile('Otwarte alerty')).getByText('2')).toBeInTheDocument()
        expect(within(tile('Otwarte alerty')).getByText('w tym 1 nowych')).toBeInTheDocument()
        expect(within(tile('Krytyczne i wysokie')).getByText('2')).toBeInTheDocument()
        expect(within(tile('Wszystkie alerty')).getByText('4')).toBeInTheDocument()
        expect(within(tile('Wszystkie alerty')).getByText('1 rozwiązanych · 1 fałszywy')).toBeInTheDocument()
        expect(within(tile('Fałszywe alarmy')).getByText('50%')).toBeInTheDocument()
        expect(within(tile('Fałszywe alarmy')).getByText('z 2 zamkniętych alertów')).toBeInTheDocument()
    })

    it('highlights tiles when there are open and urgent alerts', async () => {
        await renderDashboard([makeAlert(1, { priority: 'CRITICAL', status: 'NEW' })])

        expect(tile('Otwarte alerty')).toHaveAttribute('data-tone', 'attention')
        expect(tile('Krytyczne i wysokie')).toHaveAttribute('data-tone', 'danger')
    })

    it('shows calm tiles and dash when everything is closed or nothing is closed', async () => {
        await renderDashboard([makeAlert(1, { priority: 'LOW', status: 'NEW' })])

        expect(tile('Krytyczne i wysokie')).toHaveAttribute('data-tone', 'ok')
        expect(within(tile('Fałszywe alarmy')).getByText('—')).toBeInTheDocument()
        expect(within(tile('Fałszywe alarmy')).getByText('brak zamkniętych alertów')).toBeInTheDocument()
    })

    it('marks open alerts tile as ok when all alerts are closed', async () => {
        await renderDashboard([makeAlert(1, { status: 'RESOLVED' })])

        expect(tile('Otwarte alerty')).toHaveAttribute('data-tone', 'ok')
        expect(within(tile('Fałszywe alarmy')).getByText('0%')).toBeInTheDocument()
    })
})

describe('Dashboard: charts', () => {
    it('describes timeline unit for recent alerts', async () => {
        await renderDashboard([makeAlert(1, { created_at: minutesAgo(3) })])

        expect(within(card('Alerty w czasie')).getByText('w minutach')).toBeInTheDocument()
    })

    it('switches timeline to hours for alerts from last days', async () => {
        await renderDashboard([makeAlert(1, { created_at: minutesAgo(30 * 60) })])

        expect(within(card('Alerty w czasie')).getByText('godzinowo')).toBeInTheDocument()
    })

    it('switches timeline to days for old alerts', async () => {
        await renderDashboard([makeAlert(1, { created_at: minutesAgo(30 * 24 * 60) })])

        expect(within(card('Alerty w czasie')).getByText('dziennie')).toBeInTheDocument()
    })

    it('shows severities without INFO when there are no INFO alerts', async () => {
        await renderDashboard([makeAlert(1, { priority: 'HIGH' })])

        expect(barLabels('Według priorytetu')).toEqual(['Krytyczny', 'Wysoki', 'Średni', 'Niski'])
    })

    it('shows INFO severity when such alerts exist', async () => {
        await renderDashboard([makeAlert(1, { priority: 'INFO' })])

        expect(barLabels('Według priorytetu')).toContain('Info')
    })

    it('shows anomaly types with polish labels', async () => {
        await renderDashboard([makeAlert(1), makeAlert(2, { group_key: 'DDOS|*|10.0.0.6' })])

        expect(barLabels('Typy anomalii')).toEqual(['DDoS', 'Skanowanie portów'])
    })

    it('shows at most 5 top sources and targets', async () => {
        await renderDashboard(Array.from({ length: 7 }, (_, i) => makeAlert(i + 1)))

        expect(barLabels('Najczęstsze źródła')).toHaveLength(5)
        expect(barLabels('Najczęściej atakowane cele')).toHaveLength(5)
    })

    it('explains empty top sources when all attacks are distributed', async () => {
        await renderDashboard([makeAlert(1, { group_key: 'DDOS|*|10.0.0.6' })])

        expect(within(card('Najczęstsze źródła')).getByText('Brak alertów z jednym źródłem.')).toBeInTheDocument()
        expect(barLabels('Najczęściej atakowane cele')).toEqual(['10.0.0.6'])
    })
})

describe('Dashboard: recent alerts', () => {
    function recentItems() {
        return within(card('Ostatnie alerty')).getAllByRole('listitem')
    }

    it('shows 6 newest alerts linked to their details', async () => {
        await renderDashboard(Array.from({ length: 8 }, (_, i) => makeAlert(i + 1, { created_at: minutesAgo(10 - i) })))

        const links = recentItems().map((item) => within(item).getByRole('link').getAttribute('href'))
        expect(links).toEqual(['/alerts/8', '/alerts/7', '/alerts/6', '/alerts/5', '/alerts/4', '/alerts/3'])
    })

    it('shows route of the attack, also for distributed attacks', async () => {
        await renderDashboard([
            makeAlert(1, { created_at: minutesAgo(2) }),
            makeAlert(2, { group_key: 'DDOS|*|10.0.0.6', created_at: minutesAgo(1) }),
        ])

        const [ddos, scan] = recentItems()
        expect(ddos).toHaveTextContent('DDoS · wiele źródeł → 10.0.0.6')
        expect(scan).toHaveTextContent('Skanowanie portów · 203.0.113.1 → 10.0.0.1')
    })

    it('uses title or alert number when type is unknown', async () => {
        await renderDashboard([
            makeAlert(1, { group_key: null, title: 'Custom alert', created_at: minutesAgo(2) }),
            makeAlert(2, { group_key: null, title: null, created_at: minutesAgo(1) }),
        ])

        const [untitled, custom] = recentItems()
        expect(untitled).toHaveTextContent('Alert #2')
        expect(custom).toHaveTextContent('Custom alert')
    })

    it('puts alerts without creation date last and skips them on timeline', async () => {
        await renderDashboard([
            makeAlert(1, { created_at: null }),
            makeAlert(2, { created_at: minutesAgo(1) }),
            makeAlert(3, { created_at: null }),
        ])

        const links = recentItems().map((item) => within(item).getByRole('link').getAttribute('href'))
        expect(links).toEqual(['/alerts/2', '/alerts/3', '/alerts/1'])
        expect(screen.getByRole('img', { name: /łącznie 1,/ })).toBeInTheDocument()
    })

    it('links to full alert list', async () => {
        await renderDashboard([makeAlert(1)])

        expect(screen.getByRole('link', { name: 'Zobacz wszystkie' })).toHaveAttribute('href', '/alerts')
    })
})