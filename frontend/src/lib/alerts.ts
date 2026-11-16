import type { Alert, AlertStatus, DetectionMethod, Severity } from '../api/types'

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
}
export const STATUSES: AlertStatus[] = ['NEW', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE']
export const OPEN_STATUSES: AlertStatus[] = ['NEW', 'ACKNOWLEDGED']

export function asSeverity(value: string | null | undefined): Severity | null {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : null
}

export function asStatus(value: string | null | undefined): AlertStatus | null {
  return STATUSES.includes(value as AlertStatus) ? (value as AlertStatus) : null
}

/**
 * Backend zapisuje czasy jako UTC (`datetime.now(timezone.utc)`), ale kolumna bez strefy
 * (TIMESTAMP WITHOUT TIME ZONE) wraca w JSON bez końcówki „Z”. Przeglądarka potraktowałaby
 * taki zapis jako czas lokalny, więc brak strefy interpretujemy jako UTC.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export interface GroupKey {
  type: string
  /** `null` oznacza atak rozproszony (wiele źródeł) — backend zapisuje wtedy „*”. */
  source: string | null
  target: string
}

/** Format klucza grupy alertu (netguard/alert_engine.py): `TYP|źródło|cel`. */
export function parseGroupKey(key: string | null | undefined): GroupKey | null {
  if (!key) return null
  const parts = key.split('|')
  if (parts.length !== 3 || parts.some((part) => part === '')) return null
  return { type: parts[0], source: parts[1] === '*' ? null : parts[1], target: parts[2] }
}

const FLOW_COUNT_RE = /^\s*(\d+)\s+flows?\b/i
const CONFIDENCE_RE = /\((\d(?:\.\d+)?)\)\s*$/
const METHOD_RE = /\[(rules|statistical|ml)\]/i

export interface AlertView {
  alert: Alert
  id: number
  type: string | null
  source: string | null
  distributed: boolean
  target: string | null
  severity: Severity | null
  status: AlertStatus | null
  createdAt: Date | null
  /** Liczba flow w grupie — API nie ma osobnego pola, więc czytamy ją z opisu („150 flows, …”). */
  flowCount: number | null
  /** Pewność najsilniejszej detekcji — j.w., z końcówki opisu („… confidence high (0.91)”). */
  confidence: number | null
  /** Metoda detekcji — j.w., ze znacznika na początku wyjaśnienia („[rules] PORT_SCAN: …”). */
  method: DetectionMethod | null
  searchText: string
}

export function toView(alert: Alert): AlertView {
  const group = parseGroupKey(alert.group_key)
  const description = alert.description ?? ''
  const flowCount = FLOW_COUNT_RE.exec(description)
  const confidence = CONFIDENCE_RE.exec(description)
  const method = METHOD_RE.exec(description)

  return {
    alert,
    id: alert.id,
    type: group?.type ?? null,
    source: group?.source ?? null,
    distributed: group !== null && group.source === null,
    target: group?.target ?? null,
    severity: asSeverity(alert.priority),
    status: asStatus(alert.status),
    createdAt: parseApiDate(alert.created_at),
    flowCount: flowCount ? Number(flowCount[1]) : null,
    confidence: confidence ? Number(confidence[1]) : null,
    method: method ? (method[1].toLowerCase() as DetectionMethod) : null,
    searchText: [alert.id, alert.title, alert.description, alert.group_key]
      .filter((part) => part !== null && part !== undefined)
      .join(' ')
      .toLowerCase(),
  }
}

// ---------------------------------------------------------------------------
// Filtrowanie i sortowanie
// ---------------------------------------------------------------------------

export type StatusFilter = 'ALL' | 'OPEN' | AlertStatus
export type SortKey = 'newest' | 'oldest' | 'severity' | 'confidence'

export interface AlertFilters {
  query: string
  status: StatusFilter
  severity: Severity | 'ALL'
  type: string
  sort: SortKey
}

export const DEFAULT_FILTERS: AlertFilters = {
  query: '',
  status: 'ALL',
  severity: 'ALL',
  type: 'ALL',
  sort: 'newest',
}

export function isFiltered(filters: AlertFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.status !== 'ALL' ||
    filters.severity !== 'ALL' ||
    filters.type !== 'ALL'
  )
}

export function filterAlerts(views: AlertView[], filters: AlertFilters): AlertView[] {
  const query = filters.query.trim().toLowerCase()
  return views.filter((view) => {
    if (query && !view.searchText.includes(query)) return false
    if (filters.status === 'OPEN') {
      if (!view.status || !OPEN_STATUSES.includes(view.status)) return false
    } else if (filters.status !== 'ALL' && view.status !== filters.status) {
      return false
    }
    if (filters.severity !== 'ALL' && view.severity !== filters.severity) return false
    if (filters.type !== 'ALL' && view.type !== filters.type) return false
    return true
  })
}

function byNewest(a: AlertView, b: AlertView): number {
  const at = a.createdAt?.getTime() ?? -Infinity
  const bt = b.createdAt?.getTime() ?? -Infinity
  return bt - at || b.id - a.id
}

export function sortAlerts(views: AlertView[], sort: SortKey): AlertView[] {
  const copy = [...views]
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => -byNewest(a, b))
    case 'severity':
      return copy.sort(
        (a, b) =>
          (b.severity ? SEVERITY_RANK[b.severity] : -1) -
            (a.severity ? SEVERITY_RANK[a.severity] : -1) || byNewest(a, b),
      )
    case 'confidence':
      return copy.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || byNewest(a, b))
    default:
      return copy.sort(byNewest)
  }
}

// ---------------------------------------------------------------------------
// Statystyki do dashboardu
// ---------------------------------------------------------------------------

export interface Counted {
  key: string
  count: number
}

/** Zlicza wystąpienia i sortuje malejąco (przy remisie alfabetycznie). */
export function countBy(keys: string[]): Counted[] {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export interface Overview {
  total: number
  open: number
  fresh: number
  urgentOpen: number
  resolved: number
  falsePositive: number
  byType: Counted[]
  bySeverity: Counted[]
  topSources: Counted[]
  topTargets: Counted[]
}

export function buildOverview(views: AlertView[]): Overview {
  const isOpen = (view: AlertView) => view.status !== null && OPEN_STATUSES.includes(view.status)

  return {
    total: views.length,
    open: views.filter(isOpen).length,
    fresh: views.filter((v) => v.status === 'NEW').length,
    urgentOpen: views.filter(
      (v) => isOpen(v) && (v.severity === 'CRITICAL' || v.severity === 'HIGH'),
    ).length,
    resolved: views.filter((v) => v.status === 'RESOLVED').length,
    falsePositive: views.filter((v) => v.status === 'FALSE_POSITIVE').length,
    byType: countBy(views.flatMap((v) => (v.type ? [v.type] : []))),
    bySeverity: SEVERITIES.map((severity) => ({
      key: severity,
      count: views.filter((v) => v.severity === severity).length,
    })),
    topSources: countBy(views.flatMap((v) => (v.source ? [v.source] : []))),
    topTargets: countBy(views.flatMap((v) => (v.target ? [v.target] : []))),
  }
}

export interface TimelineBucket {
  start: Date
  end: Date
  count: number
}

export interface Timeline {
  buckets: TimelineBucket[]
  unit: 'minute' | 'hour' | 'day'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const BUCKET_SIZES: { ms: number; unit: Timeline['unit'] }[] = [
  { ms: MINUTE, unit: 'minute' },
  { ms: 5 * MINUTE, unit: 'minute' },
  { ms: 15 * MINUTE, unit: 'minute' },
  { ms: 30 * MINUTE, unit: 'minute' },
  { ms: HOUR, unit: 'hour' },
  { ms: 3 * HOUR, unit: 'hour' },
  { ms: 6 * HOUR, unit: 'hour' },
  { ms: 12 * HOUR, unit: 'hour' },
  { ms: 24 * HOUR, unit: 'day' },
]

function startOfLocalDay(ms: number, offsetDays = 0): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays).getTime()
}

/**
 * Dzieli oś czasu na równe przedziały od pierwszego alertu do „teraz”.
 * Rozmiar przedziału dobiera się tak, by było ich najwyżej `maxBuckets`;
 * gdy danych jest mało, oś jest uzupełniana pustymi przedziałami (min. `minBuckets`).
 */
export function buildTimeline(
  dates: Date[],
  now: Date = new Date(),
  maxBuckets = 24,
  minBuckets = 8,
): Timeline {
  if (dates.length === 0) return { buckets: [], unit: 'minute' }

  const times = dates.map((date) => date.getTime())
  const first = Math.min(...times)
  const last = Math.max(Math.max(...times), now.getTime())
  const span = last - first

  const size =
    BUCKET_SIZES.find((candidate) => span / candidate.ms <= maxBuckets - 1) ??
    BUCKET_SIZES[BUCKET_SIZES.length - 1]
  const isDay = size.unit === 'day'

  const alignDown = (ms: number) => (isDay ? startOfLocalDay(ms) : Math.floor(ms / size.ms) * size.ms)
  const next = (ms: number) => (isDay ? startOfLocalDay(ms, 1) : ms + size.ms)
  const prev = (ms: number) => (isDay ? startOfLocalDay(ms, -1) : ms - size.ms)

  const starts: number[] = []
  for (let cursor = alignDown(first); cursor <= last; cursor = next(cursor)) starts.push(cursor)
  while (starts.length > maxBuckets) starts.shift()
  while (starts.length < minBuckets) starts.unshift(prev(starts[0]))

  const buckets: TimelineBucket[] = starts.map((start) => ({
    start: new Date(start),
    end: new Date(next(start)),
    count: 0,
  }))
  for (const time of times) {
    const bucket = buckets.find((b) => time >= b.start.getTime() && time < b.end.getTime())
    if (bucket) bucket.count += 1
  }
  return { buckets, unit: size.unit }
}
