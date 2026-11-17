import { describe, expect, it, vi } from "vitest"

import { mockApi, mockNetworkDown } from "../test/api-mock"
import { ApiError, parseErrorDetail, request } from "./client"

async function failure(promise: Promise<unknown>): Promise<ApiError> {
    try {
        await promise
    } catch (error) {
        return error as ApiError
    }
    throw new Error('Expected request to fail, but it succeeded.')
}

function stubFetch(implementation: () => Promise<Response>) {
    const fetchMock = vi.fn(implementation)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

describe('ApiError', () => {
    it('keeps status, message and details', () => {
        const error = new ApiError(422, 'Invalid', ['flows: required'])

        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('ApiError')
        expect(error.status).toBe(422)
        expect(error.message).toBe('Invalid')
        expect(error.details).toEqual(['flows: required'])
    })

    it('has empty details by default', () => {
        expect(new ApiError(500, 'Boom').details).toEqual([])
    })
})

describe('parseErrorDetail', () => {
    it('reads plain text message', () => {
        expect(parseErrorDetail({ detail: 'Unknown parameters: [x].' })).toEqual({
            message: 'Unknown parameters: [x].',
            details: [],
        })
    })

    it('formats FastAPI validation errors without "body" in path', () => {
        const parsed = parseErrorDetail({
            detail: [
                { loc: ['body', 'flows', 0, 'source_ip'], msg: 'Input is not a valid IPv4 address' },
                { loc: ['query', 'method'], msg: 'Input should be rules, statistical or ml' },
            ],
        })

        expect(parsed?.message).toBe('Dane nie przeszły walidacji.')
        expect(parsed?.details).toEqual([
            'flows.0.source_ip: Input is not a valid IPv4 address',
            'query.method: Input should be rules, statistical or ml',
        ])
    })

    it('shows only message when path is missing or contains only "body"', () => {
        const parsed = parseErrorDetail({
            detail: [{ msg: 'Field required' }, { loc: ['body'], msg: 'Invalid JSON' }],
        })

        expect(parsed?.details).toEqual(['Field required', 'Invalid JSON'])
    })

    it('uses default message when msg is missing', () => {
        const parsed = parseErrorDetail({ detail: [{ loc: ['body', 'flows'] }] })

        expect(parsed?.details).toEqual(['flows: nieprawidłowa wartość'])
    })

    it.each([null, 'text', {}, { detail: 5 }])('returns null for %j', (body) => {
        expect(parseErrorDetail(body)).toBeNull()
    })
})

describe('request', () => {
    it('returns parsed JSON', async () => {
        mockApi({ 'GET /health': { json: { status: 'ok' } } })

        await expect(request('/health')).resolves.toEqual({ status: 'ok' })
    })

    it('sends GET without body and Content-Type header', async () => {
        mockApi({ 'GET /health': { json: { status: 'ok' } } })

        await request('/health')

        const [, init] = vi.mocked(fetch).mock.calls[0]
        expect(init?.method).toBe('GET')
        expect(init?.body).toBeUndefined()
        expect(init?.headers).toBeUndefined()
    })

    it('sends JSON body with Content-Type header', async () => {
        const calls = mockApi({ 'PUT /api/v1/detection/config': { json: {} } })

        await request('/api/v1/detection/config', { method: 'PUT', json: { a: 1 } })

        const [, init] = vi.mocked(fetch).mock.calls[0]
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
        expect(calls[0].body).toEqual({ a: 1 })
    })

    it('returns undefined for 204 No Content', async () => {
        mockApi({ 'POST /api/v1/detection/reset': { status: 204 } })

        await expect(request('/api/v1/detection/reset', { method: 'POST' })).resolves.toBeUndefined()
    })

    it('returns null for successful response with empty body', async () => {
        stubFetch(async () => new Response('', { status: 200 }))

        await expect(request('/health')).resolves.toBeNull()
    })

    it('throws ApiError with status and details for 422', async () => {
        mockApi({
            'POST /api/v1/analysis/flows': {
                status: 422,
                json: { detail: [{ loc: ['body', 'flows'], msg: 'List should have at least 1 item' }] },
            },
        })

        const error = await failure(request('/api/v1/analysis/flows', { method: 'POST', json: {} }))

        expect(error).toBeInstanceOf(ApiError)
        expect(error.status).toBe(422)
        expect(error.message).toBe('Dane nie przeszły walidacji.')
        expect(error.details).toEqual(['flows: List should have at least 1 item'])
    })

    it('uses text detail from API as error message', async () => {
        mockApi({ 'DELETE /api/v1/alerts/9': { status: 404, json: { detail: 'Alert not found' } } })

        const error = await failure(request('/api/v1/alerts/9', { method: 'DELETE' }))

        expect(error.status).toBe(404)
        expect(error.message).toBe('Alert not found')
        expect(error.details).toEqual([])
    })

    it('gives readable message for error without JSON body', async () => {
        mockApi({ 'GET /x': { status: 500 } })

        const error = await failure(request('/x'))

        expect(error.message).toBe('Żądanie nie powiodło się (HTTP 500).')
    })

    it('gives readable message for non-JSON error body, e.g. HTML from proxy', async () => {
        stubFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))

        const error = await failure(request('/health'))

        expect(error).toBeInstanceOf(ApiError)
        expect(error.status).toBe(502)
        expect(error.message).toBe('Żądanie nie powiodło się (HTTP 502).')
    })

    it('turns network failure into ApiError with status 0', async () => {
        mockNetworkDown()

        const error = await failure(request('/health'))

        expect(error).toBeInstanceOf(ApiError)
        expect(error.status).toBe(0)
        expect(error.message).toMatch(/Brak połączenia/)
    })

    it('rethrows abort error unchanged instead of ApiError', async () => {
        stubFetch(async () => {
            throw new DOMException('The operation was aborted.', 'AbortError')
        })

        const error = await failure(request('/health'))

        expect(error).not.toBeInstanceOf(ApiError)
        expect((error as Error).name).toBe('AbortError')
    })
})