import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { mockApi, mockNetworkDown } from "../test/api-mock"
import { healthOk, makeAlert } from "../test/render"
import { Layout } from "./Layout"

function renderLayout(route = '/') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="*" element={<p>Page content</p>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

function nav() {
    return screen.getByRole('navigation', { name: 'Główna nawigacja' })
}

function navLink(name: RegExp) {
    return within(nav()).getByRole('link', { name })
}

function alertsWithNew(count: number) {
    return Array.from({ length: count }, (_, i) => makeAlert(i + 1, { status: 'NEW' }))
}

describe('Layout: navigation', () => {
    it('shows links to all pages', () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout()

        expect(navLink(/Przegląd/)).toHaveAttribute('href', '/')
        expect(navLink(/Alerty/)).toHaveAttribute('href', '/alerts')
        expect(navLink(/Analiza/)).toHaveAttribute('href', '/analysis')
        expect(navLink(/Konfiguracja/)).toHaveAttribute('href', '/settings')
        expect(screen.getByRole('link', { name: 'NetGuard — strona główna' })).toHaveAttribute('href', '/')
    })

    it('marks link of current page as active', () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout('/alerts')

        expect(navLink(/Alerty/)).toHaveAttribute('aria-current', 'page')
        expect(navLink(/Przegląd/)).not.toHaveAttribute('aria-current')
    })

    it('marks alerts link as active also on alert details', () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout('/alerts/5')

        expect(navLink(/Alerty/)).toHaveAttribute('aria-current', 'page')
    })

    it('renders current page inside main area', () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout('/anything')

        expect(within(screen.getByRole('main')).getByText('Page content')).toBeInTheDocument()
    })
})

describe('Layout: new alerts counter', () => {
    it('shows number of new alerts', async () => {
        mockApi({
            ...healthOk,
            'GET /api/v1/alerts': {
                json: [...alertsWithNew(2), makeAlert(10, { status: 'RESOLVED' }), makeAlert(11, { status: 'ACKNOWLEDGED' })],
            },
        })
        renderLayout()

        expect(await screen.findByLabelText('2 nowych')).toHaveTextContent('2')
    })

    it('hides counter when there are no new alerts', async () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [makeAlert(1, { status: 'RESOLVED' })] } })
        renderLayout()

        await screen.findByText('API online')

        expect(screen.queryByLabelText(/nowych/)).not.toBeInTheDocument()
    })

    it('shows 99+ for more than 99 new alerts', async () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: alertsWithNew(150) } })
        renderLayout()

        expect(await screen.findByLabelText('150 nowych')).toHaveTextContent('99+')
    })
})

describe('Layout: API status', () => {
    it('shows connecting state before first response', () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout()

        expect(screen.getByRole('status')).toHaveTextContent('Łączenie z API…')
        expect(screen.getByRole('status')).toHaveAttribute('data-state', 'loading')
    })

    it('shows online state when health check succeeds', async () => {
        mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
        renderLayout()

        expect(await screen.findByText('API online')).toHaveAttribute('data-state', 'online')
    })

    it('shows offline state when API is not reachable', async () => {
        mockNetworkDown()
        renderLayout()

        expect(await screen.findByText('API niedostępne')).toHaveAttribute('data-state', 'offline')
    })
})