import type { AlertStatus, Severity } from '../api/types'
import { METHOD_LABELS, SEVERITY_LABELS, STATUS_LABELS, typeLabel } from '../lib/format'

/** Priorytet jest zawsze oznaczony tekstem, nie tylko kolorem. */
export function SeverityBadge({ severity, raw }: { severity: Severity | null; raw?: string | null }) {
  const label = severity ? SEVERITY_LABELS[severity] : (raw ?? '—')
  return (
    <span className="badge" data-tone={severity ? severity.toLowerCase() : 'info'}>
      {label}
    </span>
  )
}

export function StatusBadge({ status, raw }: { status: AlertStatus | null; raw?: string | null }) {
  const label = status ? STATUS_LABELS[status] : (raw ?? '—')
  return (
    <span className="badge" data-tone={status ? status.toLowerCase() : 'info'}>
      {label}
    </span>
  )
}

export function TypeTag({ type }: { type: string | null | undefined }) {
  return <span className="tag">{typeLabel(type)}</span>
}

export function MethodTag({ method }: { method: string | null | undefined }) {
  const label = method ? (METHOD_LABELS[method as keyof typeof METHOD_LABELS] ?? method) : '—'
  return <span className="tag">{label}</span>
}
