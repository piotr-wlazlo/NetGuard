import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialog, Dialog } from "./Dialog"

function renderDialog(open = true) {
    const onClose = vi.fn()
    const view = render(
        <Dialog open={open} onClose={onClose} className="drawer" label="Details">
            <p>Dialog content</p>
        </Dialog>,
    )
    const rerender = (nextOpen: boolean) =>
        view.rerender(
            <Dialog open={nextOpen} onClose={onClose} className="drawer" label="Details">
                <p>Dialog content</p>
            </Dialog>,
        )

    return { onClose, rerender, unmount: view.unmount }
}

function renderConfirm(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
        <ConfirmDialog
            open
            title="Delete alert?"
            message="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />,
    )

    return { onConfirm, onCancel, user: userEvent.setup() }
}

describe('Dialog', () => {
    it('opens as modal and shows content when open', () => {
        renderDialog(true)

        const dialog = screen.getByRole('dialog', { name: 'Details' })
        expect(dialog).toHaveAttribute('open')
        expect(dialog).toHaveClass('drawer')
        expect(screen.getByText('Dialog content')).toBeInTheDocument()
    })

    it('does not render content when closed', () => {
        renderDialog(false)

        expect(screen.queryByText('Dialog content')).not.toBeInTheDocument()
    })

    it('calls onClose when user closes dialog, e.g. with Escape', () => {
        const { onClose } = renderDialog(true)

        fireEvent(screen.getByRole('dialog'), new Event('close'))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose after clicking backdrop', () => {
        const { onClose } = renderDialog(true)

        fireEvent.click(screen.getByRole('dialog'))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose after clicking content', () => {
        const { onClose } = renderDialog(true)

        fireEvent.click(screen.getByText('Dialog content'))

        expect(onClose).not.toHaveBeenCalled()
    })

    it('does not call onClose when parent closes it by changing open prop', () => {
        const { onClose, rerender } = renderDialog(true)

        rerender(false)

        expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
        expect(onClose).not.toHaveBeenCalled()
    })

    it('does not call onClose when unmounted while open', () => {
        const { onClose, unmount } = renderDialog(true)

        unmount()

        expect(onClose).not.toHaveBeenCalled()
    })

    it('reports user close once when parent hides already closed dialog', () => {
        const { onClose, rerender } = renderDialog(true)

        ;(screen.getByRole('dialog') as HTMLDialogElement).close()
        rerender(false)

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('reacts to user close again after parent reopened it', () => {
        const { onClose, rerender } = renderDialog(true)

        rerender(false)
        rerender(true)
        fireEvent(screen.getByRole('dialog'), new Event('close'))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it.fails('does not call parent onClose when nested dialog closes', () => {
        const onParentClose = vi.fn()
        const tree = (childOpen: boolean) => (
            <Dialog open onClose={onParentClose} className="drawer" label="Parent">
                <Dialog open={childOpen} onClose={() => {}} className="modal" label="Child">
                    <p>Child content</p>
                </Dialog>
            </Dialog>
        )
        const view = render(tree(true))

        view.rerender(tree(false))

        expect(onParentClose).not.toHaveBeenCalled()
    })
})

describe('ConfirmDialog', () => {
    it('shows title, message and buttons', () => {
        renderConfirm()

        expect(screen.getByRole('dialog', { name: 'Delete alert?' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Delete alert?' })).toBeInTheDocument()
        expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Anuluj' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('calls onConfirm after clicking confirm button', async () => {
        const { onConfirm, onCancel, user } = renderConfirm()

        await user.click(screen.getByRole('button', { name: 'Delete' }))

        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onCancel).not.toHaveBeenCalled()
    })

    it('calls onCancel after clicking cancel button', async () => {
        const { onConfirm, onCancel, user } = renderConfirm()

        await user.click(screen.getByRole('button', { name: 'Anuluj' }))

        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('uses primary style by default and danger style when requested', () => {
        renderConfirm({ confirmLabel: 'Save' })
        renderConfirm({ confirmLabel: 'Delete', danger: true })

        expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn-primary')
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn-danger-solid')
    })

    it('disables confirm button while busy', () => {
        renderConfirm({ busy: true })

        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Anuluj' })).toBeEnabled()
    })
})