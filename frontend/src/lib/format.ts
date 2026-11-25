import type { AlertStatus, DetectionMethod, Severity } from '../api/types'

export const TYPE_LABELS: Record<string, string> = {
  PORT_SCAN: 'Skanowanie portów',
  BRUTE_FORCE: 'Brute force',
  DDOS: 'DDoS',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'Krytyczny',
  HIGH: 'Wysoki',
  MEDIUM: 'Średni',
  LOW: 'Niski',
  INFO: 'Info',
}

export const STATUS_LABELS: Record<AlertStatus, string> = {
  NEW: 'Nowy',
  ACKNOWLEDGED: 'Potwierdzony',
  RESOLVED: 'Rozwiązany',
  FALSE_POSITIVE: 'Fałszywy alarm',
}

export const METHOD_LABELS: Record<DetectionMethod, string> = {
  rules: 'Reguły',
  statistical: 'Statystyczna',
  ml: 'ML (Isolation Forest)',
}

/** Krótkie uzasadnienie typu anomalii — odzwierciedla logikę `classify` w backendzie. */
export const TYPE_HELP: Record<string, string> = {
  PORT_SCAN:
    'Jedno źródło sprawdza wiele różnych portów tego samego hosta (zwykle krótkimi flow). To typowe rozpoznanie przed właściwym atakiem.',
  BRUTE_FORCE:
    'Jedno źródło wielokrotnie łączy się z tą samą usługą (host:port), np. zgadując hasła do SSH lub RDP.',
  DDOS: 'Wiele różnych źródeł jednocześnie łączy się z jednym hostem, aby go przeciążyć i odciąć od użytkowników.',
}

export function typeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return TYPE_LABELS[type] ?? type
}

export function methodLabel(method: string | null | undefined): string {
  if (!method) return '—'
  return METHOD_LABELS[method as DetectionMethod] ?? method
}

/** Polska odmiana liczebnika: 1 alert, 2–4 alerty, 5+ alertów. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const lastTwo = n % 100
  const last = n % 10
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few
  return many
}

const dateTimeFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'medium' })
const timeFormat = new Intl.DateTimeFormat('pl-PL', { timeStyle: 'medium' })
const relativeFormat = new Intl.RelativeTimeFormat('pl', { numeric: 'auto' })
const numberFormat = new Intl.NumberFormat('pl-PL')

export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormat.format(date) : '—'
}

export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatRelative(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—'
  const seconds = (date.getTime() - now.getTime()) / 1000
  const abs = Math.abs(seconds)
  if (abs < 45) return 'przed chwilą'
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  return relativeFormat.format(Math.round(seconds / 86_400), 'day')
}

/** Rozmiar pliku: B, KB albo MB z przecinkiem dziesiętnym. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
