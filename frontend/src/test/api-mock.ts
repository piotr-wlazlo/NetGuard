import { vi } from 'vitest'

interface MockResponse {
  status?: number
  json?: unknown
}

interface MockRequest {
  method: string
  path: string
  body: unknown
}

type Handler = MockResponse | ((request: MockRequest) => MockResponse)

/**
 * Podmienia globalny fetch. Klucze mają postać „METODA /ścieżka” (bez query), np. „GET /api/v1/alerts”.
 * Zwraca listę wykonanych zapytań, żeby testy mogły sprawdzać, co UI wysłało do API.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: MockRequest[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'
      const request: MockRequest = {
        method,
        path: url.pathname + url.search,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
      calls.push(request)

      const handler = handlers[`${method} ${url.pathname}`]
      if (handler === undefined) {
        return new Response(JSON.stringify({ detail: `Brak mocka dla ${method} ${url.pathname}` }), { status: 404 })
      }
      const { status = 200, json } = typeof handler === 'function' ? handler(request) : handler
      if (status === 204) return new Response(null, { status })
      return new Response(JSON.stringify(json ?? null), { status })
    }),
  )

  return calls
}

export function mockNetworkDown() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
}
