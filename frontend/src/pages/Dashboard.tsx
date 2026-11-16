import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useAlerts } from '../api/hooks'
import { SeverityBadge } from '../components/Badges'
import { BarList, TimelineChart } from '../components/Charts'
import type { BarItem } from '../components/Charts'
import { EmptyBlock, ErrorBlock, LoadingBlock, Skeleton } from '../components/States'
import { Icon } from '../components/icons'
import { buildOverview, buildTimeline, toView } from '../lib/alerts'
import { SEVERITY_LABELS, formatNumber, formatRelative, formatTime, plural, typeLabel } from '../lib/format'
import { usePageTitle } from '../lib/use-page-title'

const TOP_N = 5
const RECENT_N = 6

export function Dashboard() {
  usePageTitle('Przegląd')
  const query = useAlerts()

  const views = useMemo(() => (query.data ?? []).map(toView), [query.data])
  const overview = useMemo(() => buildOverview(views), [views])
  const timeline = useMemo(
    () => buildTimeline(views.flatMap((view) => (view.createdAt ? [view.createdAt] : []))),
    // „teraz” jest częścią osi czasu, więc przeliczamy ją przy każdym odświeżeniu danych
    [views, query.dataUpdatedAt],
  )

  const severityItems: BarItem[] = overview.bySeverity
    .filter((item) => item.key !== 'INFO' || item.count > 0)
    .map((item) => ({
      key: item.key,
      label: SEVERITY_LABELS[item.key as keyof typeof SEVERITY_LABELS],
      value: item.count,
      tone: item.key.toLowerCase(),
    }))
  const typeItems: BarItem[] = overview.byType.map((item) => ({
    key: item.key,
    label: typeLabel(item.key),
    value: item.count,
  }))
  const toItems = (counted: { key: string; count: number }[]): BarItem[] =>
    counted.slice(0, TOP_N).map((item) => ({ key: item.key, label: item.key, value: item.count }))

  const closed = overview.resolved + overview.falsePositive
  const recent = [...views]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id - a.id)
    .slice(0, RECENT_N)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Przegląd</h1>
          <p>Stan wykrytych anomalii. Dane odświeżają się automatycznie co 10 sekund.</p>
        </div>
        <div className="page-actions">
          {query.dataUpdatedAt > 0 && <span>Odświeżono {formatTime(new Date(query.dataUpdatedAt))}</span>}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" size={15} className={query.isFetching ? 'spin' : undefined} /> Odśwież
          </button>
        </div>
      </header>

      {query.isPending ? (
        <>
          <div className="grid grid-4" role="status" aria-label="Ładowanie danych">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="card tile" key={index}>
                <Skeleton height={14} width="55%" />
                <Skeleton height={32} width="40%" />
                <Skeleton height={12} width="70%" />
              </div>
            ))}
          </div>
          <div className="card">
            <LoadingBlock rows={5} />
          </div>
        </>
      ) : query.isError ? (
        <div className="card">
          <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : overview.total === 0 ? (
        <div className="card">
          <EmptyBlock icon="shield" title="Brak wykrytych anomalii">
            <p>Nie ma jeszcze żadnych alertów. Uruchom analizę ruchu, aby system mógł wykryć anomalie.</p>
            <Link to="/analysis" className="btn btn-primary">
              <Icon name="play" size={16} /> Przejdź do analizy
            </Link>
          </EmptyBlock>
        </div>
      ) : (
        <>
          <section className="grid grid-4" aria-label="Najważniejsze wskaźniki">
            <div className="card tile" data-tone={overview.open > 0 ? 'attention' : 'ok'}>
              <span className="tile-label">Otwarte alerty</span>
              <span className="tile-value">{formatNumber(overview.open)}</span>
              <span className="tile-sub">w tym {formatNumber(overview.fresh)} nowych</span>
            </div>
            <div className="card tile" data-tone={overview.urgentOpen > 0 ? 'danger' : 'ok'}>
              <span className="tile-label">Krytyczne i wysokie</span>
              <span className="tile-value">{formatNumber(overview.urgentOpen)}</span>
              <span className="tile-sub">spośród otwartych alertów</span>
            </div>
            <div className="card tile">
              <span className="tile-label">Wszystkie alerty</span>
              <span className="tile-value">{formatNumber(overview.total)}</span>
              <span className="tile-sub">
                {formatNumber(overview.resolved)} rozwiązanych · {formatNumber(overview.falsePositive)}{' '}
                {plural(overview.falsePositive, 'fałszywy', 'fałszywe', 'fałszywych')}
              </span>
            </div>
            <div className="card tile">
              <span className="tile-label">Fałszywe alarmy</span>
              <span className="tile-value">
                {closed > 0 ? `${Math.round((overview.falsePositive / closed) * 100)}%` : '—'}
              </span>
              <span className="tile-sub">
                {closed > 0
                  ? `z ${formatNumber(closed)} zamkniętych ${plural(closed, 'alertu', 'alertów', 'alertów')}`
                  : 'brak zamkniętych alertów'}
              </span>
            </div>
          </section>

          <section className="grid grid-main">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Alerty w czasie</h2>
                <span className="card-sub">
                  {timeline.unit === 'day' ? 'dziennie' : timeline.unit === 'hour' ? 'godzinowo' : 'w minutach'}
                </span>
              </div>
              <div className="card-body">
                <TimelineChart timeline={timeline} />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Według priorytetu</h2>
              </div>
              <div className="card-body">
                <BarList items={severityItems} />
              </div>
            </div>
          </section>

          <section className="grid grid-3">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Typy anomalii</h2>
              </div>
              <div className="card-body">
                <BarList items={typeItems} />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Najczęstsze źródła</h2>
                <span className="card-sub">bez ataków rozproszonych</span>
              </div>
              <div className="card-body">
                <BarList items={toItems(overview.topSources)} emptyText="Brak alertów z jednym źródłem." />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Najczęściej atakowane cele</h2>
              </div>
              <div className="card-body">
                <BarList items={toItems(overview.topTargets)} />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Ostatnie alerty</h2>
              <Link to="/alerts">Zobacz wszystkie</Link>
            </div>
            <ul className="recent" style={{ marginTop: 8 }}>
              {recent.map((view) => (
                <li key={view.id}>
                  <Link to={`/alerts/${view.id}`}>
                    <SeverityBadge severity={view.severity} raw={view.alert.priority} />
                    <span className="what">
                      {view.type ? typeLabel(view.type) : (view.alert.title ?? `Alert #${view.id}`)}
                      {view.target && (
                        <span className="muted">
                          {' '}
                          · {view.distributed ? 'wiele źródeł' : view.source} → {view.target}
                        </span>
                      )}
                    </span>
                    <span className="muted nowrap">{formatRelative(view.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
