import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { mockApi } from "../test/api-mock"
import { healthOk, makeAlert, renderApp } from "../test/render"

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

const flowsJson = [
    {
        source_ip: '10.0.0.1',
        destination_ip: '10.0.0.2',
        source_port: 5000,
        destination_port: 80,
        protocol: 'TCP',
        packet_count: 3,
        byte_count: 180,
        start_time: '2026-11-16T10:00:00Z',
        end_time: '2026-11-16T10:00:01Z',
        duration_ms: 1000,
    },
]

function detection(id: number, overrides: Record<string, unknown> = {}) {
    return {
        id,
        flow_id: 100 + id,
        detection_method: 'rules',
        anomaly_type: 'PORT_SCAN',
        severity: 'LOW',
        confidence: 0.5,
        explanation: `[rules] PORT_SCAN #${id}`,
        ...overrides,
    }
}

function api(response: unknown = analysisResponse) {
    return mockApi({
        ...healthOk,
        'GET /api/v1/alerts': { json: [] },
        'POST /api/v1/analysis/flows': { json: response },
    })
}

function postOf(calls: ReturnType<typeof mockApi>) {
    return calls.find((call) => call.method === 'POST')
}

function sentFlows(calls: ReturnType<typeof mockApi>) {
    return (postOf(calls)?.body as { flows: unknown[] } | undefined)?.flows
}

async function runAnalysis(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Uruchom analizę' }))
}

describe('Analysis page', () => {
    it('sends selected scenario and method, then shows result', async () => {
        const calls = api()
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByText('Wynik analizy')).toBeInTheDocument()
        expect(postOf(calls)?.path).toBe('/api/v1/analysis/flows?method=rules')
        expect(sentFlows(calls)).toHaveLength(770)
        expect(await screen.findByText('Utworzone alerty')).toBeInTheDocument()
    })

    it('blocks run when flow count is out of range', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/analysis')

        const count = await screen.findByLabelText('Liczba flow normalnych')
        await user.clear(count)
        await user.type(count, '99999')

        expect(screen.getByText(/Podaj liczbę całkowitą od 10 do 630/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Uruchom analizę' })).toBeDisabled()
    })

    it('shows API validation error with details', async () => {
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

        await runAnalysis(user)

        expect(await screen.findByText('Dane nie przeszły walidacji.')).toBeInTheDocument()
        expect(screen.getByText('flows.0.source_ip: Input is not a valid IPv4 address')).toBeInTheDocument()
    })

    it('shows success toast with detection and alert count', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByText('Analiza zakończona: 2 detekcji, 1 nowych alertów.')).toBeInTheDocument()
    })

    it('links created alert to its details', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByRole('link', { name: /Skanowanie portów/ })).toHaveAttribute('href', '/alerts/7')
    })
})

describe('Analysis page: method and scenario', () => {
    it('sends selected method and shows its hint', async () => {
        const calls = api()
        const user = userEvent.setup()
        renderApp('/analysis')

        const methods = await screen.findByRole('group', { name: 'Metoda detekcji' })
        await user.click(within(methods).getByRole('button', { name: 'ML' }))

        expect(within(methods).getByRole('button', { name: 'ML' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(methods).getByRole('button', { name: 'Reguły' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByText(/Isolation Forest uczony na partii/)).toBeInTheDocument()

        await runAnalysis(user)

        await waitFor(() => expect(postOf(calls)?.path).toBe('/api/v1/analysis/flows?method=ml'))
    })

    it('resets flow count and label when scenario changes', async () => {
        api()
        const user = userEvent.setup()
        renderApp('/analysis')

        await user.click(await screen.findByRole('radio', { name: /Skanowanie portów/ }))

        expect(screen.getByLabelText('Liczba portów (flow)')).toHaveValue(150)
        expect(screen.getByText(/PORT_SCAN przy ≥ 100 portach/)).toBeInTheDocument()
    })

    it('sends as many flows as entered', async () => {
        const calls = api()
        const user = userEvent.setup()
        renderApp('/analysis')

        await user.click(await screen.findByRole('radio', { name: /Skanowanie portów/ }))
        const count = screen.getByLabelText('Liczba portów (flow)')
        await user.clear(count)
        await user.type(count, '120')
        await runAnalysis(user)

        await waitFor(() => expect(sentFlows(calls)).toHaveLength(120))
    })
})

describe('Analysis page: custom JSON', () => {
    async function openJsonMode() {
        const user = userEvent.setup()
        const view = renderApp('/analysis')
        await user.click(await screen.findByRole('button', { name: 'Własny JSON' }))
        return { user, view }
    }

    function textarea() {
        return screen.getByLabelText('Flow w formacie JSON') as HTMLTextAreaElement
    }

    function fileInput(view: ReturnType<typeof renderApp>) {
        return view.container.querySelector<HTMLInputElement>('input[type="file"]')!
    }

    it('goes back to scenario mode', async () => {
        api()
        const { user } = await openJsonMode()

        await user.click(screen.getByRole('button', { name: 'Scenariusz testowy' }))

        expect(screen.getByRole('button', { name: 'Scenariusz testowy' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Liczba flow normalnych')).toBeInTheDocument()
        expect(screen.queryByLabelText('Flow w formacie JSON')).not.toBeInTheDocument()
    })

    it('opens file chooser after clicking load file button', async () => {
        api()
        const { user, view } = await openJsonMode()
        const click = vi.spyOn(fileInput(view), 'click')

        await user.click(screen.getByRole('button', { name: /Wczytaj plik/ }))

        expect(click).toHaveBeenCalledTimes(1)
    })

    it('does not send empty JSON and shows hint', async () => {
        const calls = api()
        const { user } = await openJsonMode()

        await runAnalysis(user)

        expect(screen.getByRole('alert')).toHaveTextContent('Wklej JSON z listą flow albo wczytaj plik.')
        expect(textarea()).toHaveAttribute('aria-invalid', 'true')
        expect(postOf(calls)).toBeUndefined()
    })

    it('does not send invalid JSON', async () => {
        const calls = api()
        const { user } = await openJsonMode()

        await user.click(textarea())
        await user.paste('{"flows": [')
        await runAnalysis(user)

        expect(screen.getByRole('alert')).toHaveTextContent(/Niepoprawny JSON/)
        expect(postOf(calls)).toBeUndefined()
    })

    it('sends valid JSON and clears previous errors', async () => {
        const calls = api()
        const { user } = await openJsonMode()

        await runAnalysis(user)
        expect(screen.getByRole('alert')).toBeInTheDocument()

        await user.click(textarea())
        await user.paste(JSON.stringify(flowsJson))
        await runAnalysis(user)

        await waitFor(() => expect(sentFlows(calls)).toEqual(flowsJson))
        expect(screen.queryByText(/Wklej JSON/)).not.toBeInTheDocument()
    })

    it('inserts example with 3 flows ready to send', async () => {
        const calls = api()
        const { user } = await openJsonMode()

        await user.click(screen.getByRole('button', { name: 'Wstaw przykład' }))

        expect(JSON.parse(textarea().value).flows).toHaveLength(3)

        await runAnalysis(user)

        await waitFor(() => expect(sentFlows(calls)).toHaveLength(3))
    })

    it('loads JSON file into textarea', async () => {
        api()
        const { user, view } = await openJsonMode()
        const content = JSON.stringify({ flows: flowsJson })

        await user.upload(fileInput(view), new File([content], 'flows.json', { type: 'application/json' }))

        await waitFor(() => expect(textarea()).toHaveValue(content))
    })

    it('keeps text unchanged when file chooser is cancelled', async () => {
        api()
        const { user, view } = await openJsonMode()
        await user.click(textarea())
        await user.paste('[]')

        fireEvent.change(fileInput(view), { target: { files: [] } })

        expect(textarea()).toHaveValue('[]')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('rejects file larger than 5 MB', async () => {
        api()
        const { user, view } = await openJsonMode()
        const big = new File(['{}'], 'big.json', { type: 'application/json' })
        Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })

        await user.upload(fileInput(view), big)

        expect(await screen.findByRole('alert')).toHaveTextContent('Plik jest za duży (6 MB). Limit to 5 MB.')
        expect(textarea()).toHaveValue('')
    })
})

describe('Analysis page: result', () => {
    it('suggests lowering thresholds when rules detect nothing', async () => {
        api({ flow_count: 770, detection_count: 0, detections: [], alert_count: 0, alerts: [] })
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByText('Brak detekcji.')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Konfiguracji' })).toHaveAttribute('href', '/settings')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('explains need for background traffic when statistical method detects nothing', async () => {
        api({ flow_count: 150, detection_count: 0, detections: [], alert_count: 0, alerts: [] })
        const user = userEvent.setup()
        renderApp('/analysis')

        await user.click(await screen.findByRole('button', { name: 'Statystyczna' }))
        await runAnalysis(user)

        expect(await screen.findByText(/nic się nie wyróżnia/)).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Konfiguracji' })).not.toBeInTheDocument()
    })

    it('explains why no new alerts were created', async () => {
        api({ flow_count: 3, detection_count: 1, detections: [detection(1)], alert_count: 0, alerts: [] })
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        const notice = (await screen.findByText(/Nie utworzono nowych alertów/)).closest('.notice') as HTMLElement
        expect(within(notice).getByRole('link', { name: 'Alerty' })).toHaveAttribute('href', '/alerts')
        expect(screen.queryByText('Utworzone alerty')).not.toBeInTheDocument()
    })

    it('shows first 15 detections and expands the rest on demand', async () => {
        const detections = Array.from({ length: 20 }, (_, i) => detection(i + 1))
        api({ flow_count: 20, detection_count: 20, detections, alert_count: 1, alerts: [makeAlert(1)] })
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        const table = await screen.findByRole('table')
        expect(within(table).getAllByRole('row')).toHaveLength(1 + 15)
        expect(screen.getByText('Pokazano 15 z 20')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Pokaż wszystkie' }))

        expect(within(table).getAllByRole('row')).toHaveLength(1 + 20)
        expect(screen.queryByText(/Pokazano 15/)).not.toBeInTheDocument()
    })

    it('shows dashes and fallbacks for incomplete data', async () => {
        api({
            flow_count: 1,
            detection_count: 1,
            detections: [
                { id: null, flow_id: null, detection_method: null, anomaly_type: null, severity: null, confidence: null, explanation: null },
            ],
            alert_count: 2,
            alerts: [
                makeAlert(5, { group_key: null, title: null, description: null }),
                makeAlert(6, { group_key: 'DDOS|*|10.0.0.6' }),
            ],
        })
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByText('—: 1')).toBeInTheDocument()
        const cells = within(screen.getByRole('table')).getAllByRole('cell').map((cell) => cell.textContent)
        expect(cells[0]).toBe('#—')
        expect(cells[1]).toBe('—')
        expect(cells[4]).toBe('—')
        expect(screen.getByRole('link', { name: /Alert #5/ })).toHaveTextContent('— flow')
        expect(screen.getByRole('link', { name: /DDoS/ })).toHaveTextContent('wiele źródeł → 10.0.0.6')
    })

    it('counts detections by type', async () => {
        api({
            flow_count: 3,
            detection_count: 3,
            detections: [detection(1), detection(2), detection(3, { anomaly_type: 'DDOS' })],
            alert_count: 1,
            alerts: [makeAlert(1)],
        })
        const user = userEvent.setup()
        renderApp('/analysis')

        await runAnalysis(user)

        expect(await screen.findByText('Skanowanie portów: 2')).toBeInTheDocument()
        expect(screen.getByText('DDoS: 1')).toBeInTheDocument()
        expect(screen.getByText('3 detekcje')).toBeInTheDocument()
    })
})