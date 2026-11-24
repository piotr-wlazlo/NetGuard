import type { ReactNode } from 'react'

import { ApiError } from '../api/client'
import { Icon } from './icons'
import type { IconName } from './icons'

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />
}

export function LoadingBlock({ rows = 4, label = 'Ładowanie…' }: { rows?: number; label?: string }) {
  return (
    <div className="card-body stack" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={18} width={`${92 - index * 9}%`} />
      ))}
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Wystąpił nieoczekiwany błąd.'
}

/** Pełnoblokowy komunikat o błędzie ładowania danych, z przyciskiem ponowienia. */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.status === 0
  return (
    <div className="state" data-tone="error" role="alert">
      <span className="state-icon">
        <Icon name="alert" size={22} />
      </span>
      <h3>Nie udało się pobrać danych</h3>
      <p>{errorMessage(error)}</p>
      {offline && (
        <p className="hint">
          Uruchom bazę (<code>docker compose up -d</code>) i API (
          <code>uvicorn netguard.api.main:app --port 8000</code>).
        </p>
      )}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Spróbuj ponownie
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({
  icon = 'inbox',
  title,
  children,
}: {
  icon?: IconName
  title: string
  children?: ReactNode
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

/** Komunikat błędu operacji (zapis, analiza) z listą szczegółów walidacji z API. */
export function InlineError({ error }: { error: unknown }) {
  const details = error instanceof ApiError ? error.details : []
  const shown = details.slice(0, 8)
  return (
    <div className="notice" data-tone="error" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>{errorMessage(error)}</strong>
        {shown.length > 0 && (
          <ul>
            {shown.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
            {details.length > shown.length && <li>…oraz {details.length - shown.length} kolejnych.</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
