import type { Timeline } from '../lib/alerts'
import { formatNumber, formatPercent, plural } from '../lib/format'

export interface BarItem {
  key: string
  label: string
  value: number
  /** Kolor słupka — klucz priorytetu (critical/high/medium/low/info); domyślnie kolor wykresu. */
  tone?: string
}

export function BarList({ items, emptyText = 'Brak danych.' }: { items: BarItem[]; emptyText?: string }) {
  if (items.length === 0) return <p className="hint">{emptyText}</p>
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className="barlist">
      {items.map((item) => (
        <li key={item.key} data-zero={item.value === 0}>
          <span className="label" title={item.label}>
            {item.label}
          </span>
          <span className="track" aria-hidden="true">
            <span
              className="fill"
              data-tone={item.tone}
              style={{ width: item.value === 0 ? 0 : `${Math.max(3, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="value">{formatNumber(item.value)}</span>
        </li>
      ))}
    </ul>
  )
}

const hourMinute = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' })
const full = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
const dayMonthTime = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function TimelineChart({ timeline }: { timeline: Timeline }) {
  const { buckets, unit } = timeline
  if (buckets.length === 0) return <p className="hint">Brak alertów do wyświetlenia.</p>

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  // przy osi dłuższej niż doba same godziny byłyby niejednoznaczne, więc dodajemy datę
  const spanMs = buckets[buckets.length - 1].end.getTime() - buckets[0].start.getTime()
  const axis = unit === 'day' ? dayMonth : spanMs > 36 * 3_600_000 ? dayMonthTime : hourMinute
  const middle = buckets[Math.floor(buckets.length / 2)]

  return (
    <div
      role="img"
      aria-label={`Liczba alertów w czasie: łącznie ${total}, najwięcej ${max} w jednym przedziale.`}
    >
      <div className="timeline">
        {buckets.map((bucket) => (
          <div
            className="col"
            key={bucket.start.getTime()}
            title={`${full.format(bucket.start)}: ${bucket.count} ${plural(bucket.count, 'alert', 'alerty', 'alertów')}`}
          >
            <div
              className="bar"
              data-empty={bucket.count === 0}
              style={bucket.count > 0 ? { height: `${(bucket.count / max) * 100}%` } : undefined}
            />
          </div>
        ))}
      </div>
      <div className="timeline-axis" aria-hidden="true">
        <span>{axis.format(buckets[0].start)}</span>
        <span>{axis.format(middle.start)}</span>
        <span>{axis.format(buckets[buckets.length - 1].start)}</span>
      </div>
    </div>
  )
}

export function Meter({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <span className="meter" title={`Pewność detekcji: ${value.toFixed(2)}`}>
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${clamped * 100}%` }} />
      </span>
      <span>{formatPercent(clamped)}</span>
    </span>
  )
}
