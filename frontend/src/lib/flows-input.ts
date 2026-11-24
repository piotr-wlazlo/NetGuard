import type { FlowInput } from '../api/types'
import { MAX_FLOWS } from './scenarios'

export type ParseResult = { ok: true; flows: FlowInput[] } | { ok: false; errors: string[] }

const REQUIRED_FIELDS = [
  'source_ip',
  'destination_ip',
  'protocol',
  'packet_count',
  'byte_count',
  'start_time',
  'end_time',
  'duration_ms',
] as const

const MAX_REPORTED_ERRORS = 5

/**
 * Wstępna walidacja JSON-a wklejonego przez użytkownika. Dokładna walidacja (format IP, porty,
 * spójność czasów) należy do backendu — jego komunikaty UI pokazuje po wysłaniu.
 */
export function parseFlowsJson(text: string): ParseResult {
  if (text.trim() === '') {
    return { ok: false, errors: ['Wklej JSON z listą flow albo wczytaj plik.'] }
  }

  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'nieznany błąd'
    return { ok: false, errors: [`Niepoprawny JSON: ${reason}`] }
  }

  const list =
    Array.isArray(root) ? root : isRecord(root) && Array.isArray(root.flows) ? root.flows : null
  if (list === null) {
    return { ok: false, errors: ['Oczekiwano tablicy flow albo obiektu {"flows": [...]}.'] }
  }
  if (list.length === 0) return { ok: false, errors: ['Lista flow jest pusta.'] }
  if (list.length > MAX_FLOWS) {
    return {
      ok: false,
      errors: [`Zbyt wiele flow: ${list.length}. API przyjmuje maksymalnie ${MAX_FLOWS} na jedno żądanie.`],
    }
  }

  const errors: string[] = []
  let missing = 0
  list.forEach((item, index) => {
    if (!isRecord(item)) {
      missing += 1
      if (errors.length < MAX_REPORTED_ERRORS) errors.push(`flows[${index}]: oczekiwano obiektu.`)
      return
    }
    const absent = REQUIRED_FIELDS.filter((field) => item[field] === undefined || item[field] === null)
    if (absent.length > 0) {
      missing += 1
      if (errors.length < MAX_REPORTED_ERRORS) {
        errors.push(`flows[${index}]: brak pól ${absent.map((f) => `„${f}”`).join(', ')}.`)
      }
    }
  })
  if (missing > errors.length) errors.push(`…oraz ${missing - errors.length} kolejnych błędnych flow.`)

  return errors.length > 0 ? { ok: false, errors } : { ok: true, flows: list as FlowInput[] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
