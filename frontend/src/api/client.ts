const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/** Błąd zwrócony przez API (lub brak połączenia, wtedy status = 0). */
export class ApiError extends Error {
  readonly status: number
  /** Szczegóły walidacji w czytelnej formie, np. „flows.0.source_ip: value is not a valid IPv4”. */
  readonly details: string[]

  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface ValidationItem {
  loc?: unknown[]
  msg?: string
}

/**
 * FastAPI zwraca `{detail: "tekst"}` (HTTPException, InvalidConfigError)
 * albo `{detail: [{loc, msg, type}, ...]}` (błędy walidacji 422).
 */
export function parseErrorDetail(body: unknown): { message: string; details: string[] } | null {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return null
  const detail = (body as { detail: unknown }).detail

  if (typeof detail === 'string') return { message: detail, details: [] }

  if (Array.isArray(detail)) {
    const details = detail.map((item: ValidationItem) => {
      const path = (item.loc ?? []).filter((part) => part !== 'body').join('.')
      const msg = item.msg ?? 'nieprawidłowa wartość'
      return path ? `${path}: ${msg}` : msg
    })
    return { message: 'Dane nie przeszły walidacji.', details }
  }
  return null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  json?: unknown
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, signal } = options

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Brak połączenia z API. Sprawdź, czy backend jest uruchomiony.')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const parsed = parseErrorDetail(body)
    throw new ApiError(
      response.status,
      parsed?.message ?? `Żądanie nie powiodło się (HTTP ${response.status}).`,
      parsed?.details ?? [],
    )
  }

  return body as T
}
