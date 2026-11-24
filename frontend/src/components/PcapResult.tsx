import { Link } from 'react-router-dom'

import type { PcapJob } from '../api/types'
import { formatBytes, formatNumber, plural, typeLabel } from '../lib/format'
import { MethodTag } from './Badges'
import { Icon } from './icons'

const STATUS_LABELS: Record<PcapJob['status'], string> = {
  queued: 'W kolejce',
  processing: 'Przetwarzanie',
  done: 'Zakończono',
  failed: 'Błąd',
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

function packets(n: number): string {
  return `${formatNumber(n)} ${plural(n, 'pakiet', 'pakiety', 'pakietów')}`
}

/** Opis pominiętych pakietów; pokazuje tylko niezerowe grupy. */
function ignoredText(skipped: number, rejected: number): string {
  const parts = [
    skipped > 0 ? `${packets(skipped)} bez warstwy IP lub spoza TCP, UDP i ICMP` : null,
    rejected > 0 ? `${packets(rejected)} z niepoprawnymi danymi` : null,
  ].filter(Boolean)
  return `Pominięto ${parts.join(' oraz ')}.`
}

/** Status i wynik zadania importu PCAP (odświeżany przez odpytywanie API). */
export function PcapResult({ job }: { job: PcapJob }) {
  const running = job.status === 'queued' || job.status === 'processing'
  const byType = Object.entries(job.detections_by_type)
  const ignored = job.packets_skipped + job.packets_rejected

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Import PCAP</h2>
        <MethodTag method={job.method} />
      </div>
      <div className="card-body stack">
        <p className="muted" style={{ margin: 0 }}>
          {job.filename} · {formatBytes(job.size_bytes)}
        </p>

        <div className="notice" data-tone={job.status === 'failed' ? 'error' : undefined} role="status" data-testid="pcap-status">
          <Icon name={running ? 'refresh' : job.status === 'failed' ? 'alert' : 'check'} size={18} className={running ? 'spin' : undefined} />
          <div>
            <strong>{STATUS_LABELS[job.status]}</strong>
            {running && <> · przetworzono {formatNumber(job.packets_sent)} pakietów</>}
            {job.status === 'done' && job.duration_ms !== null && <> w {formatSeconds(job.duration_ms)}</>}
            {job.status === 'failed' && job.error && <> · {job.error}</>}
          </div>
        </div>

        {!running && (
          <>
            <div className="result-tiles">
              <div className="tile">
                <span className="tile-label">Pakiety</span>
                <span className="tile-value">{formatNumber(job.packets_sent)}</span>
              </div>
              <div className="tile">
                <span className="tile-label">Detekcje</span>
                <span className="tile-value">{formatNumber(job.detection_count)}</span>
              </div>
              <div className="tile">
                <span className="tile-label">Nowe alerty</span>
                <span className="tile-value">{formatNumber(job.alert_count)}</span>
              </div>
            </div>

            {ignored > 0 && <p className="explain">{ignoredText(job.packets_skipped, job.packets_rejected)}</p>}

            {byType.length > 0 && (
              <div className="chips">
                {byType.map(([type, count]) => (
                  <span className="tag" key={type}>
                    {typeLabel(type)}: {formatNumber(count)}
                  </span>
                ))}
              </div>
            )}

            {job.status === 'done' && job.detection_count === 0 && (
              <div className="notice" data-tone="warning">
                <Icon name="alert" size={18} />
                <div>
                  <strong>Brak detekcji.</strong> Ruch w pliku nie przekroczył progów wybranej metody. Progi
                  zmienisz w <Link to="/settings">Konfiguracji</Link>.
                </div>
              </div>
            )}

            {job.alert_ids.length > 0 && (
              <div className="chips" aria-label="Utworzone alerty">
                {job.alert_ids.map((id) => (
                  <Link className="tag" key={id} to={`/alerts/${id}`}>
                    Alert #{id}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
