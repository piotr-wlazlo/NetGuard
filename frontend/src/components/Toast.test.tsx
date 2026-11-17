import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider, useToast } from "./Toast"

function Trigger() {
    const toast = useToast()

    return (
        <>
            <button onClick={() => toast.success('Saved')}>success</button>
            <button onClick={() => toast.error('Failed')}>error</button>
            <button onClick={() => toast.info('Heads up')}>info</button>
        </>
    )
}

function renderWithProvider() {
    render(
        <ToastProvider>
            <Trigger />
        </ToastProvider>,
    )
}

function toastOf(text: string) {
    return screen.getByText(text).closest('.toast')
}

describe('Toast', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('shows message after toast is triggered', () => {
        renderWithProvider()

        fireEvent.click(screen.getByText('success'))

        expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('announces toasts to screen readers', () => {
        renderWithProvider()

        fireEvent.click(screen.getByText('success'))

        expect(screen.getByRole('status')).toHaveTextContent('Saved')
    })

    it('sets tone matching toast type', () => {
        renderWithProvider()

        fireEvent.click(screen.getByText('success'))
        fireEvent.click(screen.getByText('error'))
        fireEvent.click(screen.getByText('info'))

        expect(toastOf('Saved')).toHaveAttribute('data-tone', 'success')
        expect(toastOf('Failed')).toHaveAttribute('data-tone', 'error')
        expect(toastOf('Heads up')).toHaveAttribute('data-tone', 'info')
    })

    it('hides success toast after 4 seconds', () => {
        renderWithProvider()
        fireEvent.click(screen.getByText('success'))

        act(() => vi.advanceTimersByTime(3999))
        expect(screen.getByText('Saved')).toBeInTheDocument()

        act(() => vi.advanceTimersByTime(1))
        expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    })

    it('hides info toast after 4 seconds', () => {
        renderWithProvider()
        fireEvent.click(screen.getByText('info'))

        act(() => vi.advanceTimersByTime(4000))

        expect(screen.queryByText('Heads up')).not.toBeInTheDocument()
    })

    it('keeps error toast longer, for 7 seconds', () => {
        renderWithProvider()
        fireEvent.click(screen.getByText('error'))

        act(() => vi.advanceTimersByTime(4000))
        expect(screen.getByText('Failed')).toBeInTheDocument()

        act(() => vi.advanceTimersByTime(3000))
        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
    })

    it('closes toast when close button is clicked', () => {
        renderWithProvider()
        fireEvent.click(screen.getByText('error'))

        fireEvent.click(screen.getByRole('button', { name: 'Zamknij powiadomienie' }))

        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
    })

    it('closes only the clicked toast', () => {
        renderWithProvider()
        fireEvent.click(screen.getByText('success'))
        fireEvent.click(screen.getByText('error'))

        fireEvent.click(screen.getAllByRole('button', { name: 'Zamknij powiadomienie' })[0])

        expect(screen.queryByText('Saved')).not.toBeInTheDocument()
        expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    it('shows at most 4 toasts and drops the oldest', () => {
        renderWithProvider()

        fireEvent.click(screen.getByText('error'))
        for (let i = 0; i < 4; i++) {
            fireEvent.click(screen.getByText('success'))
        }

        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
        expect(screen.getAllByText('Saved')).toHaveLength(4)
    })

    it('does not throw when used outside ToastProvider', () => {
        render(<Trigger />)

        expect(() => fireEvent.click(screen.getByText('success'))).not.toThrow()
    })
})