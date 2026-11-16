import { describe, expect, it } from 'vitest'

import { mockApi, mockNetworkDown } from '../test/api-mock'
import { ApiError, parseErrorDetail, request } from './client'

describe('parseErrorDetail', () => {
  it('czyta zwykły komunikat tekstowy', () => {
    expect(parseErrorDetail({ detail: 'Unknown parameters: [x].' })).toEqual({
      message: 'Unknown parameters: [x].',
      details: [],
    })
  })

  it('formatuje błędy walidacji FastAPI, pomijając „body” w ścieżce', () => {
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

  it.each([null, 'tekst', {}, { detail: 5 }])('zwraca null dla %j', (body) => {
    expect(parseErrorDetail(body)).toBeNull()
  })
})

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('Oczekiwano błędu, ale żądanie się powiodło.')
}

describe('request', () => {
  it('zwraca sparsowany JSON', async () => {
    mockApi({ 'GET /health': { json: { status: 'ok' } } })
    await expect(request('/health')).resolves.toEqual({ status: 'ok' })
  })

  it('wysyła JSON w ciele i zwraca undefined dla 204', async () => {
    const calls = mockApi({ 'POST /api/v1/detection/reset': { status: 204 } })
    await expect(request('/api/v1/detection/reset', { method: 'POST', json: { a: 1 } })).resolves.toBeUndefined()
    expect(calls[0].body).toEqual({ a: 1 })
  })

  it('rzuca ApiError z kodem i szczegółami dla 422', async () => {
    mockApi({
      'POST /api/v1/analysis/flows': {
        status: 422,
        json: { detail: [{ loc: ['body', 'flows'], msg: 'List should have at least 1 item' }] },
      },
    })
    const error = await failure(request('/api/v1/analysis/flows', { method: 'POST', json: {} }))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.details).toEqual(['flows: List should have at least 1 item'])
  })

  it('daje czytelny komunikat dla odpowiedzi bez JSON-a', async () => {
    mockApi({ 'GET /x': { status: 500 } })
    const error = await failure(request('/x'))
    expect(error.message).toMatch(/HTTP 500/)
  })

  it('zamienia brak sieci na ApiError ze statusem 0', async () => {
    mockNetworkDown()
    const error = await failure(request('/health'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Brak połączenia/)
  })
})
