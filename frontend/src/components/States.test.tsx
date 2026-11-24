import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ApiError } from "../api/client"
import { EmptyBlock, ErrorBlock, InlineError, LoadingBlock, Skeleton } from "./States"

describe('Skeleton', () => {
    it('is hidden from screen readers and uses default size', () => {
        const { container } = render(<Skeleton />)
        const skeleton = container.firstChild as HTMLElement

        expect(skeleton).toHaveAttribute('aria-hidden', 'true')
        expect(skeleton.style.height).toBe('16px')
        expect(skeleton.style.width).toBe('100%')
    })

    it('uses given size', () => {
        const { container } = render(<Skeleton height={24} width="70%" />)
        const skeleton = container.firstChild as HTMLElement

        expect(skeleton.style.height).toBe('24px')
        expect(skeleton.style.width).toBe('70%')
    })
})

describe('LoadingBlock', () => {
    it('announces loading with default label and 4 rows', () => {
        const { container } = render(<LoadingBlock />)

        expect(screen.getByRole('status', { name: 'Ładowanie…' })).toBeInTheDocument()
        expect(container.querySelectorAll('.skeleton')).toHaveLength(4)
    })

    it('uses given label and number of rows with decreasing width', () => {
        const { container } = render(<LoadingBlock rows={3} label="Loading alerts" />)
        const widths = [...container.querySelectorAll<HTMLElement>('.skeleton')].map((row) => row.style.width)

        expect(screen.getByRole('status', { name: 'Loading alerts' })).toBeInTheDocument()
        expect(widths).toEqual(['92%', '83%', '74%'])
    })
})

describe('ErrorBlock', () => {
    it('shows message from ApiError', () => {
        render(<ErrorBlock error={new ApiError(500, 'Błąd bazy')} />)

        expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się pobrać danych')
        expect(screen.getByText('Błąd bazy')).toBeInTheDocument()
    })

    it('shows generic message for unexpected error', () => {
        render(<ErrorBlock error={new TypeError('x is undefined')} />)

        expect(screen.getByText('Wystąpił nieoczekiwany błąd.')).toBeInTheDocument()
        expect(screen.queryByText('x is undefined')).not.toBeInTheDocument()
    })

    it('shows how to start backend when there is no connection', () => {
        render(<ErrorBlock error={new ApiError(0, 'Brak połączenia z API.')} />)

        expect(screen.getByText('docker compose up -d')).toBeInTheDocument()
        expect(screen.getByText(/uvicorn netguard\.api\.main:app/)).toBeInTheDocument()
    })

    it('does not show backend hint for other errors', () => {
        render(<ErrorBlock error={new ApiError(500, 'Błąd bazy')} />)

        expect(screen.queryByText('docker compose up -d')).not.toBeInTheDocument()
    })

    it('shows retry button only when onRetry is given', () => {
        render(<ErrorBlock error={new ApiError(500, 'Błąd bazy')} />)

        expect(screen.queryByRole('button', { name: /Spróbuj ponownie/ })).not.toBeInTheDocument()
    })

    it('calls onRetry after clicking retry button', async () => {
        const onRetry = vi.fn()
        const user = userEvent.setup()
        render(<ErrorBlock error={new ApiError(500, 'Błąd bazy')} onRetry={onRetry} />)

        await user.click(screen.getByRole('button', { name: /Spróbuj ponownie/ }))

        expect(onRetry).toHaveBeenCalledTimes(1)
    })
})

describe('EmptyBlock', () => {
    it('shows title and extra content', () => {
        render(
            <EmptyBlock title="Brak alertów">
                <p>Run analysis first.</p>
            </EmptyBlock>,
        )

        expect(screen.getByRole('heading', { name: 'Brak alertów' })).toBeInTheDocument()
        expect(screen.getByText('Run analysis first.')).toBeInTheDocument()
    })

    it('works without extra content', () => {
        render(<EmptyBlock icon="search" title="Nothing found" />)

        expect(screen.getByRole('heading', { name: 'Nothing found' })).toBeInTheDocument()
    })
})

describe('InlineError', () => {
    it('shows message and validation details from ApiError', () => {
        render(<InlineError error={new ApiError(422, 'Dane nie przeszły walidacji.', ['flows.0.source_ip: invalid'])} />)

        expect(screen.getByRole('alert')).toHaveTextContent('Dane nie przeszły walidacji.')
        expect(screen.getByRole('listitem')).toHaveTextContent('flows.0.source_ip: invalid')
    })

    it('shows no list when there are no details', () => {
        render(<InlineError error={new ApiError(500, 'Błąd bazy')} />)

        expect(screen.getByText('Błąd bazy')).toBeInTheDocument()
        expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('shows at most 8 details and counts the rest', () => {
        const details = Array.from({ length: 10 }, (_, i) => `flows.${i}: invalid`)
        render(<InlineError error={new ApiError(422, 'Dane nie przeszły walidacji.', details)} />)

        const items = screen.getAllByRole('listitem')
        expect(items).toHaveLength(9)
        expect(items[7]).toHaveTextContent('flows.7: invalid')
        expect(items[8]).toHaveTextContent('…oraz 2 kolejnych.')
        expect(screen.queryByText('flows.8: invalid')).not.toBeInTheDocument()
    })

    it('shows generic message for unexpected error', () => {
        render(<InlineError error="something broke" />)

        expect(screen.getByText('Wystąpił nieoczekiwany błąd.')).toBeInTheDocument()
    })
})