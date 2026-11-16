import type { Severity } from '../api/types'
import type { AlertFilters, SortKey, StatusFilter } from '../lib/alerts'
import { SEVERITIES, STATUSES } from '../lib/alerts'
import { SEVERITY_LABELS, STATUS_LABELS, typeLabel } from '../lib/format'
import { Icon } from './icons'

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Od najnowszych',
  oldest: 'Od najstarszych',
  severity: 'Wg priorytetu',
  confidence: 'Wg pewności',
}

type Option = [value: string, label: string]

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
}) {
  return (
    <div className="field">
      <select className="select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

interface FilterControlsProps {
  filters: AlertFilters
  onChange: (patch: Partial<AlertFilters>) => void
  typeOptions: string[]
}

/** Pasek wyszukiwania, filtrowania i sortowania historii alertów. */
export function FilterControls({ filters, onChange, typeOptions }: FilterControlsProps) {
  return (
    <div className="toolbar" role="search" aria-label="Filtry alertów">
      <div className="field search">
        <label className="sr-only" htmlFor="alert-search">
          Szukaj alertów
        </label>
        <Icon name="search" size={16} />
        <input
          id="alert-search"
          className="input"
          type="search"
          placeholder="Szukaj po adresie IP, typie, opisie…"
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
        />
      </div>
      <Select
        label="Status"
        value={filters.status}
        onChange={(value) => onChange({ status: value as StatusFilter })}
        options={[
          ['ALL', 'Wszystkie statusy'],
          ['OPEN', 'Otwarte (nowe + potwierdzone)'],
          ...STATUSES.map((status): Option => [status, STATUS_LABELS[status]]),
        ]}
      />
      <Select
        label="Priorytet"
        value={filters.severity}
        onChange={(value) => onChange({ severity: value as Severity | 'ALL' })}
        options={[
          ['ALL', 'Wszystkie priorytety'],
          ...SEVERITIES.map((severity): Option => [severity, SEVERITY_LABELS[severity]]),
        ]}
      />
      <Select
        label="Typ anomalii"
        value={filters.type}
        onChange={(value) => onChange({ type: value })}
        options={[['ALL', 'Wszystkie typy'], ...typeOptions.map((type): Option => [type, typeLabel(type)])]}
      />
      <Select
        label="Sortowanie"
        value={filters.sort}
        onChange={(value) => onChange({ sort: value as SortKey })}
        options={(Object.keys(SORT_LABELS) as SortKey[]).map((key): Option => [key, SORT_LABELS[key]])}
      />
    </div>
  )
}
