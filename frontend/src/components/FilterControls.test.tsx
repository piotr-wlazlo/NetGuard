import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DEFAULT_FILTERS } from "../lib/alerts"
import type { AlertFilters } from "../lib/alerts"
import { FilterControls } from "./FilterControls"

function renderControls(filters: AlertFilters = DEFAULT_FILTERS, typeOptions = ['PORT_SCAN', 'DDOS']) {
    const onChange = vi.fn()
    render(<FilterControls filters={filters} onChange={onChange} typeOptions={typeOptions} />)

    return { onChange, user: userEvent.setup() }
}

function select(name: string) {
    return screen.getByRole('combobox', { name }) as HTMLSelectElement
}

function optionLabels(name: string) {
    return within(select(name)).getAllByRole('option').map((option) => option.textContent)
}

describe('FilterControls', () => {
    it('is a search region with all controls', () => {
        renderControls()

        expect(screen.getByRole('search', { name: 'Filtry alertów' })).toBeInTheDocument()
        expect(screen.getByRole('searchbox', { name: 'Szukaj alertów' })).toBeInTheDocument()
        for (const name of ['Status', 'Priorytet', 'Typ anomalii', 'Sortowanie']) {
            expect(select(name)).toBeInTheDocument()
        }
    })

    it('shows current filter values', () => {
        renderControls({ query: '10.0.0.6', status: 'OPEN', severity: 'HIGH', type: 'DDOS', sort: 'severity' })

        expect(screen.getByRole('searchbox')).toHaveValue('10.0.0.6')
        expect(select('Status')).toHaveValue('OPEN')
        expect(select('Priorytet')).toHaveValue('HIGH')
        expect(select('Typ anomalii')).toHaveValue('DDOS')
        expect(select('Sortowanie')).toHaveValue('severity')
    })

    it('lists status options with "open" shortcut', () => {
        renderControls()

        expect(optionLabels('Status')).toEqual([
            'Wszystkie statusy',
            'Otwarte (nowe + potwierdzone)',
            'Nowy',
            'Potwierdzony',
            'Rozwiązany',
            'Fałszywy alarm',
        ])
    })

    it('lists severities from highest to lowest', () => {
        renderControls()

        expect(optionLabels('Priorytet')).toEqual(['Wszystkie priorytety', 'Krytyczny', 'Wysoki', 'Średni', 'Niski', 'Info'])
    })

    it('lists given anomaly types with polish labels', () => {
        renderControls(DEFAULT_FILTERS, ['PORT_SCAN', 'SQL_INJECTION'])

        expect(optionLabels('Typ anomalii')).toEqual(['Wszystkie typy', 'Skanowanie portów', 'SQL_INJECTION'])
    })

    it('lists sort options', () => {
        renderControls()

        expect(optionLabels('Sortowanie')).toEqual(['Od najnowszych', 'Od najstarszych', 'Wg priorytetu', 'Wg pewności'])
    })

    it('reports typed search text', async () => {
        const { onChange, user } = renderControls()

        await user.type(screen.getByRole('searchbox'), 'x')

        expect(onChange).toHaveBeenCalledWith({ query: 'x' })
    })

    it('reports only the changed filter', async () => {
        const { onChange, user } = renderControls()

        await user.selectOptions(select('Status'), 'OPEN')
        await user.selectOptions(select('Priorytet'), 'CRITICAL')
        await user.selectOptions(select('Typ anomalii'), 'DDOS')
        await user.selectOptions(select('Sortowanie'), 'oldest')

        expect(onChange.mock.calls).toEqual([
            [{ status: 'OPEN' }],
            [{ severity: 'CRITICAL' }],
            [{ type: 'DDOS' }],
            [{ sort: 'oldest' }],
        ])
    })
})