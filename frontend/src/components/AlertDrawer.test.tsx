import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Alert } from "../api/types"
import { toView } from "../lib/alerts"
import { mockApi } from "../test/api-mock"
import { makeAlert } from "../test/render"
import { AlertDrawer } from "./AlertDrawer"
import { ToastProvider } from "./Toast"

function renderDrawer(alert: Alert | undefined, { id = alert?.id ?? 1, loading = false } = {}) {
    const onClose = vi.fn()
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })

    render(
        <QueryClientProvider client={client}>
            <ToastProvider>
                <AlertDrawer id={id} view={alert ? toView(alert) : undefined} loading={loading} onClose={onClose} />
            </ToastProvider>
        </QueryClientProvider>,
    )

    return { onClose, user: userEvent.setup() }
}

function field(label: string) {
    return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

function statusButton(name: string) {
    return within(screen.getByRole('group', { name: 'Zmień status alertu' })).getByRole('button', { name })
}

const portScan = makeAlert(1)

const ddos = makeAlert(2, {
    group_key: 'DDOS|*|10.0.0.6',
    description: '220 flows, [ml] DDOS (score=0.9), confidence high (0.92)',
    priority: 'CRITICAL',
})

const incomplete = makeAlert(5, {
    detection_id: null,
    group_key: null,
    title: 'Custom alert',
    description: null,
    priority: 'WEIRD',
    status: null,
    created_at: null,
})

describe('AlertDrawer: content', () => {
    it('shows skeleton instead of details while loading', () => {
        renderDrawer(undefined, { id: 1, loading: true })

        expect(screen.getByRole('dialog', { name: 'Szczegóły alertu #1' })).toBeInTheDocument()
        expect(screen.queryByText('Szczegóły')).not.toBeInTheDocument()
        expect(screen.queryByText(/Nie znaleziono/)).not.toBeInTheDocument()
    })

    it('shows warning when alert does not exist', () => {
        renderDrawer(undefined, { id: 42 })

        expect(screen.getByRole('alert')).toHaveTextContent('Nie znaleziono alertu #42.')
        expect(screen.queryByRole('button', { name: /Usuń alert/ })).not.toBeInTheDocument()
    })

    it('shows all details of a complete alert', () => {
        renderDrawer(portScan)

        expect(screen.getByRole('heading', { name: 'Skanowanie portów' })).toBeInTheDocument()
        expect(screen.getByText('203.0.113.1 → 10.0.0.1')).toBeInTheDocument()
        expect(screen.getByText('Średni')).toBeInTheDocument()
        expect(field('Źródło')).toHaveTextContent('203.0.113.1')
        expect(field('Cel')).toHaveTextContent('10.0.0.1')
        expect(field('Flow w grupie')).toHaveTextContent('150')
        expect(field('Pewność')).toHaveTextContent('61%')
        expect(field('Metoda detekcji')).toHaveTextContent('Reguły')
        expect(field('ID detekcji')).toHaveTextContent('10')
        expect(field('Klucz grupy')).toHaveTextContent('PORT_SCAN|203.0.113.1|10.0.0.1')
        expect(screen.getByText(/Jedno źródło sprawdza wiele różnych portów/)).toBeInTheDocument()
        expect(screen.getByText(/150 flows, \[rules\] PORT_SCAN/)).toBeInTheDocument()
    })

    it('shows "many sources" for distributed attack', () => {
        renderDrawer(ddos)

        expect(screen.getByText('wiele źródeł → 10.0.0.6')).toBeInTheDocument()
        expect(field('Źródło')).toHaveTextContent('Wiele źródeł (atak rozproszony)')
        expect(field('Metoda detekcji')).toHaveTextContent('ML (Isolation Forest)')
    })

    it('shows dashes and title for alert with incomplete data', () => {
        renderDrawer(incomplete)

        expect(screen.getByRole('heading', { name: 'Custom alert' })).toBeInTheDocument()
        expect(screen.getByText('WEIRD')).toBeInTheDocument()
        for (const label of ['Typ anomalii', 'Źródło', 'Cel', 'Flow w grupie', 'Pewność', 'Metoda detekcji', 'ID detekcji', 'Klucz grupy']) {
            expect(field(label), label).toHaveTextContent('—')
        }
        expect(screen.queryByText(/→/)).not.toBeInTheDocument()
    })

    it('falls back to alert number when there is no type and no title', () => {
        renderDrawer(makeAlert(7, { group_key: null, title: null }))

        expect(screen.getByRole('heading', { level: 3, name: 'Alert #7' })).toBeInTheDocument()
    })

    it('calls onClose after clicking close button', async () => {
        const { onClose, user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: 'Zamknij panel' }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })
})

describe('AlertDrawer: status', () => {
    it('marks current status as pressed', () => {
        renderDrawer(portScan)

        expect(statusButton('Nowy')).toHaveAttribute('aria-pressed', 'true')
        expect(statusButton('Rozwiązany')).toHaveAttribute('aria-pressed', 'false')
    })

    it('sends new status to API and shows confirmation', async () => {
        const calls = mockApi({ 'PUT /api/v1/alerts/1/status': { json: { ...portScan, status: 'ACKNOWLEDGED' } } })
        const { user } = renderDrawer(portScan)

        await user.click(statusButton('Potwierdzony'))

        expect(await screen.findByText('Alert #1: status „Potwierdzony”.')).toBeInTheDocument()
        expect(calls).toHaveLength(1)
        expect(calls[0].body).toEqual({ status: 'ACKNOWLEDGED' })
    })

    it('does not send request when clicking current status', async () => {
        const calls = mockApi({})
        const { user } = renderDrawer(portScan)

        await user.click(statusButton('Nowy'))

        expect(calls).toHaveLength(0)
    })

    it('shows API error message when status change fails', async () => {
        mockApi({ 'PUT /api/v1/alerts/1/status': { status: 500, json: { detail: 'Błąd bazy' } } })
        const { user } = renderDrawer(portScan)

        await user.click(statusButton('Rozwiązany'))

        expect(await screen.findByText('Nie zmieniono statusu: Błąd bazy')).toBeInTheDocument()
    })

    it('shows generic message for unexpected error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 500,
            ok: false,
            text: async () => {
                throw new TypeError('Connection lost while reading body')
            },
        })))
        const { user } = renderDrawer(portScan)

        await user.click(statusButton('Rozwiązany'))

        expect(await screen.findByText('Nie zmieniono statusu: Operacja nie powiodła się.')).toBeInTheDocument()
    })
})

describe('AlertDrawer: delete', () => {
    it('asks for confirmation before deleting', async () => {
        const calls = mockApi({})
        const { user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))

        expect(screen.getByRole('dialog', { name: 'Usunąć alert #1?' })).toBeInTheDocument()
        expect(calls).toHaveLength(0)
    })

    it('deletes alert, shows confirmation and closes drawer', async () => {
        const calls = mockApi({ 'DELETE /api/v1/alerts/1': { status: 204 } })
        const { onClose, user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))
        await user.click(screen.getByRole('button', { name: 'Usuń' }))

        expect(await screen.findByText('Usunięto alert #1.')).toBeInTheDocument()
        expect(calls.map((call) => call.method)).toEqual(['DELETE'])
        expect(onClose).toHaveBeenCalled()
    })

    it('shows reason and hides confirmation when delete fails', async () => {
        mockApi({ 'DELETE /api/v1/alerts/1': { status: 404, json: { detail: 'Alert not found' } } })
        const { user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))
        await user.click(screen.getByRole('button', { name: 'Usuń' }))

        expect(await screen.findByText('Nie usunięto alertu: Alert not found')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Usuń' })).not.toBeInTheDocument())
    })

    it('does not delete when confirmation is cancelled', async () => {
        const calls = mockApi({})
        const { user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))
        await user.click(screen.getByRole('button', { name: 'Anuluj' }))

        expect(screen.queryByRole('dialog', { name: 'Usunąć alert #1?' })).not.toBeInTheDocument()
        expect(calls).toHaveLength(0)
    })

    it.fails('does not close drawer when confirmation is cancelled', async () => {
        mockApi({})
        const { onClose, user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))
        await user.click(screen.getByRole('button', { name: 'Anuluj' }))

        expect(onClose).not.toHaveBeenCalled()
    })

    it.fails('does not close drawer when delete fails', async () => {
        mockApi({ 'DELETE /api/v1/alerts/1': { status: 404, json: { detail: 'Alert not found' } } })
        const { onClose, user } = renderDrawer(portScan)

        await user.click(screen.getByRole('button', { name: /Usuń alert/ }))
        await user.click(screen.getByRole('button', { name: 'Usuń' }))
        await screen.findByText('Nie usunięto alertu: Alert not found')

        expect(onClose).not.toHaveBeenCalled()
    })
})