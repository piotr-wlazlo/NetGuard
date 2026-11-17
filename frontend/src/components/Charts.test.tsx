import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Timeline } from "../lib/alerts"
import { BarList, Meter, TimelineChart } from "./Charts"

function fills(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.fill')]
}

function bars(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.bar')]
}

function axisLabels(container: HTMLElement) {
    return [...container.querySelectorAll('.timeline-axis span')].map((span) => span.textContent)
}

function timeline(unit: Timeline['unit'], stepMs: number, counts: number[]): Timeline {
    const start = new Date(2026, 10, 16, 14, 0).getTime()
    return {
        unit,
        buckets: counts.map((count, i) => ({
            start: new Date(start + i * stepMs),
            end: new Date(start + (i + 1) * stepMs),
            count,
        })),
    }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('BarList', () => {
    it('shows default text for empty list', () => {
        render(<BarList items={[]} />)

        expect(screen.getByText('Brak danych.')).toBeInTheDocument()
    })

    it('shows custom text for empty list', () => {
        render(<BarList items={[]} emptyText="Nothing here" />)

        expect(screen.getByText('Nothing here')).toBeInTheDocument()
    })

    it('shows label and formatted value of each item', () => {
        const { container } = render(<BarList items={[{ key: 'a', label: '10.0.0.1', value: 12345 }]} />)

        expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
        expect(container.querySelector('.value')?.textContent).toBe('12\u00A0345')
    })

    it('scales bars relative to the largest value', () => {
        const { container } = render(
            <BarList
                items={[
                    { key: 'a', label: 'A', value: 50 },
                    { key: 'b', label: 'B', value: 25 },
                ]}
            />,
        )

        expect(fills(container).map((fill) => fill.style.width)).toEqual(['100%', '50%'])
    })

    it('keeps tiny values visible with minimum width of 3%', () => {
        const { container } = render(
            <BarList
                items={[
                    { key: 'a', label: 'A', value: 1000 },
                    { key: 'b', label: 'B', value: 1 },
                ]}
            />,
        )

        expect(fills(container)[1].style.width).toBe('3%')
    })

    it('draws empty bar for zero value and marks the row', () => {
        const { container } = render(
            <BarList
                items={[
                    { key: 'a', label: 'A', value: 5 },
                    { key: 'b', label: 'B', value: 0 },
                ]}
            />,
        )

        expect(fills(container)[1].style.width).toBe('0px')
        expect(screen.getByText('B').closest('li')).toHaveAttribute('data-zero', 'true')
    })

    it('passes tone to the bar', () => {
        const { container } = render(<BarList items={[{ key: 'a', label: 'A', value: 1, tone: 'critical' }]} />)

        expect(fills(container)[0]).toHaveAttribute('data-tone', 'critical')
    })
})

describe('TimelineChart', () => {
    it('shows message when there are no buckets', () => {
        render(<TimelineChart timeline={{ buckets: [], unit: 'minute' }} />)

        expect(screen.getByText('Brak alertów do wyświetlenia.')).toBeInTheDocument()
    })

    it('describes total and maximum for screen readers', () => {
        render(<TimelineChart timeline={timeline('hour', HOUR, [1, 4, 2])} />)

        expect(screen.getByRole('img')).toHaveAccessibleName(
            'Liczba alertów w czasie: łącznie 7, najwięcej 4 w jednym przedziale.',
        )
    })

    it('draws bar heights relative to the largest bucket', () => {
        const { container } = render(<TimelineChart timeline={timeline('hour', HOUR, [2, 4, 1])} />)

        expect(bars(container).map((bar) => bar.style.height)).toEqual(['50%', '100%', '25%'])
    })

    it('marks empty buckets and gives them no height', () => {
        const { container } = render(<TimelineChart timeline={timeline('hour', HOUR, [3, 0])} />)

        expect(bars(container)[1]).toHaveAttribute('data-empty', 'true')
        expect(bars(container)[1].style.height).toBe('')
    })

    it('shows bucket time and count in tooltip', () => {
        const { container } = render(<TimelineChart timeline={timeline('hour', HOUR, [3])} />)

        expect(container.querySelector('.col')).toHaveAttribute('title', '16.11.2026, 14:00: 3 alerty')
    })

    it('shows only hours on axis for short range', () => {
        const { container } = render(<TimelineChart timeline={timeline('hour', HOUR, [1, 1, 1])} />)

        expect(axisLabels(container)).toEqual(['14:00', '15:00', '16:00'])
    })

    it('adds date to hours on axis for range longer than 36 hours', () => {
        const { container } = render(<TimelineChart timeline={timeline('hour', 12 * HOUR, [1, 1, 1, 1])} />)

        expect(axisLabels(container)).toEqual(['16.11, 14:00', '17.11, 14:00', '18.11, 02:00'])
    })

    it('shows only dates on axis for daily buckets', () => {
        const { container } = render(<TimelineChart timeline={timeline('day', DAY, [1, 1, 1])} />)

        expect(axisLabels(container)).toEqual(['16.11', '17.11', '18.11'])
    })
})

describe('Meter', () => {
    it('shows dash when value is missing', () => {
        render(<Meter value={null} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('shows rounded percent and exact value in tooltip', () => {
        const { container } = render(<Meter value={0.5} />)

        expect(screen.getByText('50%')).toBeInTheDocument()
        expect(container.querySelector('.meter')).toHaveAttribute('title', 'Pewność detekcji: 0.50')
        expect(container.querySelector<HTMLElement>('.meter-fill')?.style.width).toBe('50%')
    })

    it('clamps values above 1 to 100%', () => {
        const { container } = render(<Meter value={1.4} />)

        expect(screen.getByText('100%')).toBeInTheDocument()
        expect(container.querySelector<HTMLElement>('.meter-fill')?.style.width).toBe('100%')
    })

    it('clamps negative values to 0%', () => {
        render(<Meter value={-0.2} />)

        expect(screen.getByText('0%')).toBeInTheDocument()
    })
})