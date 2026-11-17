import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { mockApi } from "../test/api-mock"
import { healthOk, renderApp } from "../test/render"

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

const PORTS = 'Skan portów: min. liczba portów'
const Z = 'Próg robust z-score'

function api(extra: Record<string, unknown> = {}) {
    return mockApi({
        ...healthOk,
        'GET /api/v1/alerts': { json: [] },
        'GET /api/v1/detection/config': { json: config },
        ...extra,
    })
}

async function openSettings() {
    const user = userEvent.setup()
    renderApp('/settings')
    await screen.findByLabelText(PORTS)
    return user
}

async function setField(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const field = screen.getByLabelText(label)
    await user.clear(field)
    await user.type(field, value)
    return field
}

function saveBar() {
    return screen.queryByRole('region', { name: 'Zapis zmian' })
}

function requests(calls: ReturnType<typeof mockApi>, method: string) {
    return calls.filter((call) => call.method === method)
}

describe('Settings page: display', () => {
    it('shows parameters grouped in sections and detected anomaly types', async () => {
        api()
        await openSettings()

        expect(screen.getByLabelText(PORTS)).toHaveValue('100')
        expect(screen.getByLabelText(Z)).toHaveValue('3.5')
        expect(screen.getByLabelText('Próg wyniku Isolation Forest')).toHaveValue('0.65')
        expect(screen.getByRole('heading', { name: 'Parametry wspólne' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Metoda statystyczna' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Metoda ML' })).toBeInTheDocument()
        expect(screen.getByText('Wykrywane typy anomalii')).toBeInTheDocument()
        expect(saveBar()).not.toBeInTheDocument()
    })

    it('shows sections in fixed order', async () => {
        api()
        await openSettings()

        const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
        expect(headings).toEqual(['Parametry wspólne', 'Metoda statystyczna', 'Metoda ML', 'Wykrywane typy anomalii'])
    })

    it('shows hint under each field', async () => {
        api()
        await openSettings()

        expect(screen.getByLabelText(PORTS)).toHaveAccessibleDescription(/uznajemy za skanowanie/)
    })

    it('shows unknown section and parameter under raw names', async () => {
        api({
            'GET /api/v1/detection/config': {
                json: { ...config, parameters: { ...config.parameters, experimental: { new_knob: 7 } } },
            },
        })
        renderApp('/settings')

        expect(await screen.findByRole('heading', { name: 'experimental' })).toBeInTheDocument()
        expect(screen.getByLabelText('new_knob')).toHaveValue('7')
    })

    it('explains known anomaly types and shows dash for unknown ones', async () => {
        api({ 'GET /api/v1/detection/config': { json: { ...config, anomaly_types: ['DDOS', 'SQL_INJECTION'] } } })
        renderApp('/settings')

        const types = (await screen.findByRole('heading', { name: 'Wykrywane typy anomalii' })).closest('section')!
        const items = within(types).getAllByRole('listitem')
        expect(items[0]).toHaveTextContent(/DDoS.*Wiele różnych źródeł/)
        expect(items[1]).toHaveTextContent('SQL_INJECTION—')
    })

    it('sets browser tab title', async () => {
        api()
        await openSettings()

        await waitFor(() => expect(document.title).toBe('Konfiguracja · NetGuard'))
    })
})

describe('Settings page: loading and errors', () => {
    it('shows loading state and disables reset until config arrives', () => {
        api()
        renderApp('/settings')

        expect(screen.getByRole('status', { name: 'Ładowanie konfiguracji' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Przywróć domyślne' })).toBeDisabled()
    })

    it('shows error and disables reset when config cannot be loaded', async () => {
        api({ 'GET /api/v1/detection/config': { status: 500, json: { detail: 'Silnik niedostępny' } } })
        renderApp('/settings')

        expect(await screen.findByText('Silnik niedostępny')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Przywróć domyślne' })).toBeDisabled()
    })

    it('loads config again after clicking retry', async () => {
        let attempt = 0
        api({
            'GET /api/v1/detection/config': () =>
                attempt++ === 0 ? { status: 500, json: { detail: 'Silnik niedostępny' } } : { json: config },
        })
        const user = userEvent.setup()
        renderApp('/settings')

        await user.click(await screen.findByRole('button', { name: /Spróbuj ponownie/ }))

        expect(await screen.findByLabelText(PORTS)).toHaveValue('100')
    })
})

describe('Settings page: editing', () => {
    it('blocks saving invalid value and shows the reason', async () => {
        api()
        const user = await openSettings()

        const field = await setField(user, PORTS, '0')

        expect(screen.getByText('Wartość musi być większa od zera.')).toBeInTheDocument()
        expect(field).toHaveAttribute('aria-invalid', 'true')
        expect(within(saveBar()!).getByText('Popraw błędne pola, aby zapisać zmiany.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Zapisz zmiany/ })).toBeDisabled()

        await setField(user, PORTS, '12.5')
        expect(screen.getByText('Wymagana liczba całkowita.')).toBeInTheDocument()
    })

    it('replaces hint with error message', async () => {
        api()
        const user = await openSettings()

        const field = await setField(user, PORTS, 'abc')

        expect(field).toHaveAccessibleDescription('To nie jest liczba.')
    })

    it('does not treat value equal to server value as a change', async () => {
        api()
        const user = await openSettings()

        await setField(user, PORTS, '100')

        expect(saveBar()).not.toBeInTheDocument()
        expect(screen.getByLabelText(PORTS).closest('.field')).toHaveAttribute('data-dirty', 'false')
    })

    it('counts changed fields and marks them', async () => {
        api()
        const user = await openSettings()

        await setField(user, PORTS, '80')
        await setField(user, Z, '4')

        expect(within(saveBar()!).getByText('Niezapisane zmiany: 2')).toBeInTheDocument()
        expect(screen.getByLabelText(PORTS).closest('.field')).toHaveAttribute('data-dirty', 'true')
    })

    it('discards changes without sending request', async () => {
        const calls = api()
        const user = await openSettings()
        await setField(user, PORTS, '0')

        await user.click(screen.getByRole('button', { name: 'Odrzuć zmiany' }))

        expect(screen.getByLabelText(PORTS)).toHaveValue('100')
        expect(screen.queryByText('Wartość musi być większa od zera.')).not.toBeInTheDocument()
        expect(saveBar()).not.toBeInTheDocument()
        expect(requests(calls, 'PUT')).toHaveLength(0)
    })
})

describe('Settings page: saving', () => {
    it('sends only changed parameters and clears edit state', async () => {
        const calls = api({
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
        const user = await openSettings()

        await setField(user, PORTS, '80')
        await setField(user, Z, '4,2')
        await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

        await waitFor(() => expect(requests(calls, 'PUT')).toHaveLength(1))
        expect(requests(calls, 'PUT')[0].body).toEqual({
            common: { port_scan_min_ports: 80 },
            statistical: { z_threshold: 4.2 },
        })
        expect(await screen.findByText(/Zapisano 2 parametry/)).toBeInTheDocument()
        await waitFor(() => expect(saveBar()).not.toBeInTheDocument())
        expect(screen.getByLabelText(PORTS)).toHaveValue('80')
    })

    it('uses singular form when one parameter is saved', async () => {
        api({ 'PUT /api/v1/detection/config': { json: config } })
        const user = await openSettings()

        await setField(user, PORTS, '80')
        await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

        expect(await screen.findByText(/Zapisano 1 parametr\./)).toBeInTheDocument()
    })

    it('blocks buttons while saving', async () => {
        api()
        const user = await openSettings()
        const realFetch = fetch
        let finishSave = () => {}
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === 'PUT'
                ? new Promise<Response>((resolve) => {
                      finishSave = () => resolve(new Response(JSON.stringify(config)))
                  })
                : realFetch(input, init),
        ))

        await setField(user, PORTS, '80')
        await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

        expect(await screen.findByRole('button', { name: /Zapisuję…/ })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Odrzuć zmiany' })).toBeDisabled()

        finishSave()

        expect(await screen.findByText(/Zapisano 1 parametr\./)).toBeInTheDocument()
    })

    it('shows API error and keeps user edits', async () => {
        api({ 'PUT /api/v1/detection/config': { status: 422, json: { detail: 'Unknown parameters: [common.x].' } } })
        const user = await openSettings()

        await setField(user, PORTS, '90')
        await user.click(screen.getByRole('button', { name: /Zapisz zmiany/ }))

        expect(await screen.findByText('Unknown parameters: [common.x].')).toBeInTheDocument()
        expect(screen.getByLabelText(PORTS)).toHaveValue('90')
    })
})

describe('Settings page: reset to defaults', () => {
    it('resets only after confirmation and reloads config', async () => {
        const calls = api({ 'POST /api/v1/detection/reset': { status: 204 } })
        const user = await openSettings()
        const loadsBefore = calls.filter((call) => call.path === '/api/v1/detection/config').length

        await user.click(screen.getByRole('button', { name: 'Przywróć domyślne' }))
        expect(requests(calls, 'POST')).toHaveLength(0)

        await user.click(await screen.findByRole('button', { name: 'Przywróć' }))

        await waitFor(() => expect(requests(calls, 'POST')).toHaveLength(1))
        expect(await screen.findByText('Przywrócono wartości domyślne.')).toBeInTheDocument()
        await waitFor(() =>
            expect(calls.filter((call) => call.path === '/api/v1/detection/config').length).toBeGreaterThan(loadsBefore),
        )
    })

    it('clears unsaved edits after reset', async () => {
        api({ 'POST /api/v1/detection/reset': { status: 204 } })
        const user = await openSettings()
        await setField(user, PORTS, '80')

        await user.click(screen.getByRole('button', { name: 'Przywróć domyślne' }))
        await user.click(await screen.findByRole('button', { name: 'Przywróć' }))

        await waitFor(() => expect(saveBar()).not.toBeInTheDocument())
        expect(screen.getByLabelText(PORTS)).toHaveValue('100')
    })

    it('does not reset when confirmation is cancelled', async () => {
        const calls = api()
        const user = await openSettings()

        await user.click(screen.getByRole('button', { name: 'Przywróć domyślne' }))
        await user.click(await screen.findByRole('button', { name: 'Anuluj' }))

        expect(screen.queryByRole('button', { name: 'Przywróć' })).not.toBeInTheDocument()
        expect(requests(calls, 'POST')).toHaveLength(0)
    })

    it('shows message and closes confirmation when reset fails', async () => {
        api({ 'POST /api/v1/detection/reset': { status: 500, json: { detail: 'boom' } } })
        const user = await openSettings()

        await user.click(screen.getByRole('button', { name: 'Przywróć domyślne' }))
        await user.click(await screen.findByRole('button', { name: 'Przywróć' }))

        expect(await screen.findByText('Nie udało się przywrócić wartości domyślnych.')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Przywróć' })).not.toBeInTheDocument())
    })
})