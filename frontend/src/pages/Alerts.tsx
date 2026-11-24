import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAlerts } from '../api/hooks'
import { AlertDrawer } from '../components/AlertDrawer'
import { SeverityBadge, StatusBadge } from '../components/Badges'
import { Meter } from '../components/Charts'
import { FilterControls } from '../components/FilterControls'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/States'
import { Icon } from '../components/icons'
import { DEFAULT_FILTERS, filterAlerts, isFiltered, sortAlerts, toView } from '../lib/alerts'
import type { AlertFilters } from '../lib/alerts'
import { TYPE_LABELS, formatDateTime, formatRelative, plural, typeLabel } from '../lib/format'
import { usePageTitle } from '../lib/use-page-title'

const PAGE_SIZE = 20

export function Alerts() {
  usePageTitle('Alerty')
  const { id } = useParams()
  const navigate = useNavigate()
  const query = useAlerts()

  const [filters, setFilters] = useState<AlertFilters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)

  const views = useMemo(() => (query.data ?? []).map(toView), [query.data])
  const typeOptions = useMemo(
    () => [...new Set([...Object.keys(TYPE_LABELS), ...views.flatMap((v) => (v.type ? [v.type] : []))])],
    [views],
  )
  const filtered = useMemo(
    () => sortAlerts(filterAlerts(views, filters), filters.sort),
    [views, filters],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const first = (currentPage - 1) * PAGE_SIZE
  const rows = filtered.slice(first, first + PAGE_SIZE)

  const selectedId = id !== undefined && /^\d+$/.test(id) ? Number(id) : null

  function update(patch: Partial<AlertFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Alerty</h1>
          <p>Historia wykrytych anomalii. Wyszukuj, filtruj i sortuj, a po kliknięciu zobaczysz szczegóły.</p>
        </div>
      </header>

      <div className="card">
        <FilterControls filters={filters} onChange={update} typeOptions={typeOptions} />

        {query.isPending ? (
          <LoadingBlock rows={6} label="Ładowanie alertów" />
        ) : query.isError ? (
          <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
        ) : views.length === 0 ? (
          <EmptyBlock icon="shield" title="Brak alertów">
            <p>Nie wykryto jeszcze żadnych anomalii. Uruchom analizę, aby wygenerować alerty.</p>
            <Link to="/analysis" className="btn btn-primary">
              <Icon name="play" size={16} /> Przejdź do analizy
            </Link>
          </EmptyBlock>
        ) : (
          <>
            <div className="toolbar-meta" aria-live="polite">
              <span>
                {filtered.length === 0
                  ? 'Brak wyników'
                  : `${first + 1}–${first + rows.length} z ${filtered.length} ${plural(filtered.length, 'alertu', 'alertów', 'alertów')}`}
                {isFiltered(filters) && ` (przefiltrowano z ${views.length})`}
              </span>
              <div className="row">
                {isFiltered(filters) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => update({ ...DEFAULT_FILTERS, sort: filters.sort })}
                  >
                    <Icon name="x" size={14} /> Wyczyść filtry
                  </button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyBlock icon="search" title="Żaden alert nie pasuje do filtrów">
                <p>Zmień kryteria wyszukiwania albo wyczyść filtry.</p>
              </EmptyBlock>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Priorytet</th>
                      <th scope="col">Alert</th>
                      <th scope="col" className="num">
                        Flow
                      </th>
                      <th scope="col">Pewność</th>
                      <th scope="col">Status</th>
                      <th scope="col">Utworzono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((view) => (
                      <tr
                        key={view.id}
                        className={`clickable${view.id === selectedId ? ' selected' : ''}`}
                        onClick={() => navigate(`/alerts/${view.id}`)}
                      >
                        <td>
                          <SeverityBadge severity={view.severity} raw={view.alert.priority} />
                        </td>
                        <td>
                          <div className="cell-title">
                            <Link to={`/alerts/${view.id}`}>
                              {view.type ? typeLabel(view.type) : (view.alert.title ?? `Alert #${view.id}`)}
                              {view.target && (
                                <span className="muted" style={{ fontWeight: 450 }}>
                                  {' '}
                                  · {view.distributed ? 'wiele źródeł' : view.source} → {view.target}
                                </span>
                              )}
                            </Link>
                            <span className="cell-sub" title={view.alert.description ?? undefined}>
                              {view.alert.description ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="num">{view.flowCount ?? '—'}</td>
                        <td>
                          <Meter value={view.confidence} />
                        </td>
                        <td>
                          <StatusBadge status={view.status} raw={view.alert.status} />
                        </td>
                        <td className="nowrap" title={formatDateTime(view.createdAt)}>
                          {formatRelative(view.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageCount > 1 && (
              <nav className="pager" aria-label="Strony wyników">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <Icon name="chevron-left" size={15} /> Poprzednia
                </button>
                <span>
                  Strona {currentPage} z {pageCount}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Następna <Icon name="chevron-right" size={15} />
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {selectedId !== null && (
        <AlertDrawer
          key={selectedId}
          id={selectedId}
          view={views.find((view) => view.id === selectedId)}
          loading={query.isPending}
          onClose={() => navigate('/alerts')}
        />
      )}
    </div>
  )
}
