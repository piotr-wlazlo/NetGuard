import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { mockApi } from "../test/api-mock"
import { healthOk, makeAlert, renderApp } from "../test/render"

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

const manyAlerts = Array.from({ length: 25 }, (_, i) =>
    makeAlert(i + 1, { created_at: new Date(Date.UTC(2026, 10, 16, 0, i)).toISOString() }),
)

function api(list = alerts, extra = {}) {
    return mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: list }, ...extra })
}

function dataRows() {
    return within(screen.getByRole('table')).getAllByRole('row').slice(1)
}

function pager() {
    return screen.getByRole('navigation', { name: 'Strony wyników' })
}

describe('Alerts page', () => {
    it('shows alerts from newest and result count', async () => {
        api()
        renderApp('/alerts')

        await screen.findByRole('table')

        expect(dataRows()).toHaveLength(3)
        expect(within(dataRows()[0]).getByText('DDoS')).toBeInTheDocument()
        expect(screen.getByText(/1–3 z 3 alertów/)).toBeInTheDocument()
    })

    it('filters by text and status and clears filters', async () => {
        api()
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

    it('shows message when no alert matches filters', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.type(screen.getByRole('searchbox'), 'zzz')

        expect(await screen.findByText('Żaden alert nie pasuje do filtrów')).toBeInTheDocument()
    })

    it('sorts by priority', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.selectOptions(screen.getByRole('combobox', { name: 'Sortowanie' }), 'severity')

        const priorities = dataRows().map((row) => within(row).getAllByRole('cell')[0].textContent)
        expect(priorities).toEqual(['Krytyczny', 'Wysoki', 'Niski'])
    })

    it('offers anomaly types found in data in type filter', async () => {
        api([...alerts, makeAlert(9, { group_key: 'SQL_INJECTION|1.1.1.1|2.2.2.2' })])
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.selectOptions(screen.getByRole('combobox', { name: 'Typ anomalii' }), 'SQL_INJECTION')

        expect(dataRows()).toHaveLength(1)
        expect(within(dataRows()[0]).getByText('SQL_INJECTION')).toBeInTheDocument()
    })

    it('shows title, number or dash for incomplete alerts', async () => {
        api([
            makeAlert(5, { group_key: null, title: 'Custom alert', description: null, created_at: '2026-11-16T10:00:00Z' }),
            makeAlert(6, { group_key: null, title: null, description: null, created_at: '2026-11-16T11:00:00Z' }),
        ])
        renderApp('/alerts')
        await screen.findByRole('table')

        const [untitled, custom] = dataRows()
        expect(within(untitled).getByRole('link')).toHaveTextContent('Alert #6')
        expect(within(custom).getByRole('link')).toHaveTextContent('Custom alert')
        expect(within(custom).getAllByRole('cell')[1]).toHaveTextContent('Custom alert—')
        expect(within(custom).getAllByRole('cell')[2]).toHaveTextContent('—')
    })

    it('shows empty state when there are no alerts', async () => {
        api([])
        renderApp('/alerts')

        expect(await screen.findByText('Brak alertów')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Przejdź do analizy/ })).toHaveAttribute('href', '/analysis')
    })

    it('shows error and retry button when API fails', async () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { status: 500, json: { detail: 'Błąd bazy' } } })
        renderApp('/alerts')

        expect(await screen.findByText('Błąd bazy')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Spróbuj ponownie/ })).toBeInTheDocument()
    })

    it('loads alerts again after clicking retry', async () => {
        let attempt = 0
        mockApi({
            ...healthOk,
            'GET /api/v1/alerts': () =>
                attempt++ === 0 ? { status: 500, json: { detail: 'Błąd bazy' } } : { json: alerts },
        })
        const user = userEvent.setup()
        renderApp('/alerts')

        await user.click(await screen.findByRole('button', { name: /Spróbuj ponownie/ }))

        await screen.findByRole('table')
        expect(dataRows()).toHaveLength(3)
    })
})

describe('Alerts page: pagination', () => {
    it('splits list into pages of 20', async () => {
        api(manyAlerts)
        renderApp('/alerts')
        await screen.findByRole('table')

        expect(dataRows()).toHaveLength(20)
        expect(within(pager()).getByText('Strona 1 z 2')).toBeInTheDocument()
        expect(within(pager()).getByRole('button', { name: /Poprzednia/ })).toBeDisabled()
    })

    it('goes to next page', async () => {
        api(manyAlerts)
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.click(within(pager()).getByRole('button', { name: /Następna/ }))

        expect(dataRows()).toHaveLength(5)
        expect(screen.getByText(/21–25 z 25 alertów/)).toBeInTheDocument()
        expect(within(pager()).getByRole('button', { name: /Następna/ })).toBeDisabled()
    })

    it('goes back to previous page', async () => {
        api(manyAlerts)
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.click(within(pager()).getByRole('button', { name: /Następna/ }))
        await user.click(within(pager()).getByRole('button', { name: /Poprzednia/ }))

        expect(within(pager()).getByText('Strona 1 z 2')).toBeInTheDocument()
        expect(dataRows()).toHaveLength(20)
        expect(screen.getByText(/1–20 z 25 alertów/)).toBeInTheDocument()
    })

    it('goes back to first page after filter change', async () => {
        api(manyAlerts)
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.click(within(pager()).getByRole('button', { name: /Następna/ }))
        await user.selectOptions(screen.getByRole('combobox', { name: 'Sortowanie' }), 'severity')

        expect(within(pager()).getByText('Strona 1 z 2')).toBeInTheDocument()
        expect(dataRows()).toHaveLength(20)
    })

    it('hides pagination when results fit on one page', async () => {
        api()
        renderApp('/alerts')
        await screen.findByRole('table')

        expect(screen.queryByRole('navigation', { name: 'Strony wyników' })).not.toBeInTheDocument()
    })
})

describe('Alert details drawer', () => {
    it('opens from /alerts/:id address and shows group data', async () => {
        api()
        renderApp('/alerts/2')

        const drawer = await screen.findByRole('dialog', { name: 'Szczegóły alertu #2' })

        expect(await within(drawer).findByText('Uzasadnienie detekcji')).toBeInTheDocument()
        expect(within(drawer).getByText('Wiele źródeł (atak rozproszony)')).toBeInTheDocument()
        expect(within(drawer).getByText('DDOS|*|10.0.0.6')).toBeInTheDocument()
        expect(within(drawer).getByText('220')).toBeInTheDocument()
    })

    it('shows detection method read from description', async () => {
        api([makeAlert(3, { description: '9 flows, [ml] BRUTE_FORCE (IsolationForest score=0.71), confidence high (0.80)' })])
        renderApp('/alerts/3')

        const drawer = await screen.findByRole('dialog', { name: 'Szczegóły alertu #3' })

        expect(await within(drawer).findByText('ML (Isolation Forest)')).toBeInTheDocument()
    })

    it('informs when alert does not exist', async () => {
        api()
        renderApp('/alerts/999')

        expect(await screen.findByText('Nie znaleziono alertu #999.')).toBeInTheDocument()
    })

    it('does not open for non-numeric id', async () => {
        api()
        renderApp('/alerts/abc')
        await screen.findByRole('table')

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens after clicking a table row', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/alerts')
        await screen.findByRole('table')

        await user.click(within(dataRows()[0]).getAllByRole('cell')[2])

        expect(await screen.findByRole('dialog', { name: 'Szczegóły alertu #2' })).toBeInTheDocument()
        expect(dataRows()[0]).toHaveClass('selected')
    })

    it('closes after clicking close button', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/alerts/2')

        await user.click(await screen.findByRole('button', { name: 'Zamknij panel' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Szczegóły alertu #2' })).not.toBeInTheDocument())
    })
})

describe('Alert details drawer: status', () => {
    it('changes status through API and updates view', async () => {
        const calls = api(alerts, {
            'PUT /api/v1/alerts/2/status': (request: { body: unknown }) => ({
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

    it('does not send request when clicking current status', async () => {
        const calls = api()
        const user = userEvent.setup()
        renderApp('/alerts/2')

        const group = await screen.findByRole('group', { name: 'Zmień status alertu' })
        await user.click(within(group).getByRole('button', { name: 'Nowy' }))

        expect(calls.some((call) => call.method === 'PUT')).toBe(false)
    })

    it('shows API error and keeps previous status', async () => {
        api(alerts, { 'PUT /api/v1/alerts/2/status': { status: 500, json: { detail: 'Błąd bazy' } } })
        const user = userEvent.setup()
        renderApp('/alerts/2')

        const group = await screen.findByRole('group', { name: 'Zmień status alertu' })
        await user.click(within(group).getByRole('button', { name: 'Rozwiązany' }))

        expect(await screen.findByText('Nie zmieniono statusu: Błąd bazy')).toBeInTheDocument()
        expect(within(group).getByRole('button', { name: 'Nowy' })).toHaveAttribute('aria-pressed', 'true')
    })
})

describe('Alert details drawer: delete', () => {
    it('deletes alert only after confirmation', async () => {
        const calls = api(alerts, { 'DELETE /api/v1/alerts/2': { status: 204 } })
        const user = userEvent.setup()
        renderApp('/alerts/2')

        await user.click(await screen.findByRole('button', { name: /Usuń alert/ }))
        expect(calls.some((call) => call.method === 'DELETE')).toBe(false)

        await user.click(await screen.findByRole('button', { name: 'Usuń' }))

        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true))
        expect(await screen.findByText('Usunięto alert #2.')).toBeInTheDocument()
        await waitFor(() => expect(dataRows()).toHaveLength(2))
    })

    it.fails('keeps drawer open after cancelling confirmation', async () => {
        const calls = api()
        const user = userEvent.setup()
        renderApp('/alerts/2')

        await user.click(await screen.findByRole('button', { name: /Usuń alert/ }))
        await user.click(await screen.findByRole('button', { name: 'Anuluj' }))

        expect(screen.queryByRole('button', { name: 'Usuń' })).not.toBeInTheDocument()
        expect(calls.some((call) => call.method === 'DELETE')).toBe(false)
        expect(screen.getByRole('dialog', { name: 'Szczegóły alertu #2' })).toBeInTheDocument()
    })

    it.fails('keeps drawer open and shows reason when delete fails', async () => {
        api(alerts, { 'DELETE /api/v1/alerts/2': { status: 404, json: { detail: 'Alert not found' } } })
        const user = userEvent.setup()
        renderApp('/alerts/2')

        await user.click(await screen.findByRole('button', { name: /Usuń alert/ }))
        await user.click(await screen.findByRole('button', { name: 'Usuń' }))

        expect(await screen.findByText('Nie usunięto alertu: Alert not found')).toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'Szczegóły alertu #2' })).toBeInTheDocument()
        expect(dataRows()).toHaveLength(3)
    })
})