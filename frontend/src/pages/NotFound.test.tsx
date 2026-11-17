import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { mockApi } from "../test/api-mock"
import { healthOk, renderApp } from "../test/render"

function mockLayoutApi() {
    mockApi({ ...healthOk, 'GET /api/v1/alerts': { json: [] } })
}

describe('NotFound page', () => {
    it('is shown for unknown address', async () => {
        mockLayoutApi()

        renderApp('/this-page-does-not-exist')

        expect(await screen.findByText('Nie znaleziono strony')).toBeInTheDocument()
        expect(screen.getByText('Adres, który otworzyłeś, nie istnieje.')).toBeInTheDocument()
    })

    it('sets browser tab title', async () => {
        mockLayoutApi()

        renderApp('/this-page-does-not-exist')

        await waitFor(() => expect(document.title).toBe('Nie znaleziono strony · NetGuard'))
    })

    it('has link back to dashboard', async () => {
        mockLayoutApi()

        renderApp('/this-page-does-not-exist')

        const link = await screen.findByRole('link', { name: 'Wróć do przeglądu' })
        expect(link).toHaveAttribute('href', '/')
    })

    it('navigates to dashboard after clicking the link', async () => {
        mockLayoutApi()
        const user = userEvent.setup()
        renderApp('/this-page-does-not-exist')

        await user.click(await screen.findByRole('link', { name: 'Wróć do przeglądu' }))

        expect(await screen.findByRole('heading', { name: 'Przegląd' })).toBeInTheDocument()
        expect(screen.queryByText('Nie znaleziono strony')).not.toBeInTheDocument()
    })

    it('is not shown for existing address', async () => {
        mockLayoutApi()

        renderApp('/alerts')

        expect(await screen.findByRole('heading', { name: 'Alerty' })).toBeInTheDocument()
        expect(screen.queryByText('Nie znaleziono strony')).not.toBeInTheDocument()
    })
})