import { useState } from 'react'

import { ApiError } from '../api/client'
import { useDeleteAlert, useSetAlertStatus } from '../api/hooks'
import type { AlertStatus } from '../api/types'
import { STATUSES } from '../lib/alerts'
import type { AlertView } from '../lib/alerts'
import { STATUS_LABELS, TYPE_HELP, formatDateTime, formatRelative, methodLabel, typeLabel } from '../lib/format'
import { SeverityBadge, StatusBadge, TypeTag } from './Badges'
import { Meter } from './Charts'
import { ConfirmDialog, Dialog } from './Dialog'
import { Icon } from './icons'
import { Skeleton } from './States'
import { useToast } from './Toast'

interface AlertDrawerProps {
  id: number
  /** `undefined` = lista jest załadowana, ale nie ma na niej tego alertu. */
  view: AlertView | undefined
  loading: boolean
  onClose: () => void
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Operacja nie powiodła się.'
}

export function AlertDrawer({ id, view, loading, onClose }: AlertDrawerProps) {
  const setStatus = useSetAlertStatus()
  const remove = useDeleteAlert()
  const toast = useToast()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function changeStatus(status: AlertStatus) {
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Alert #${id}: status „${STATUS_LABELS[status]}”.`),
        onError: (error) => toast.error(`Nie zmieniono statusu: ${messageOf(error)}`),
      },
    )
  }

  function deleteAlert() {
    remove.mutate(id, {
      onSuccess: () => {
        setConfirmingDelete(false)
        toast.success(`Usunięto alert #${id}.`)
        onClose()
      },
      onError: (error) => {
        setConfirmingDelete(false)
        toast.error(`Nie usunięto alertu: ${messageOf(error)}`)
      },
    })
  }

  return (
    <Dialog open onClose={onClose} className="drawer" label={`Szczegóły alertu #${id}`}>
      <div className="drawer-inner">
        <div className="drawer-head">
          <h2>Alert #{id}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zamknij panel">
            <Icon name="x" />
          </button>
        </div>

        <div className="drawer-body">
          {loading ? (
            <div className="stack">
              <Skeleton height={24} width="70%" />
              <Skeleton height={16} />
              <Skeleton height={16} width="85%" />
              <Skeleton height={16} width="60%" />
            </div>
          ) : !view ? (
            <div className="notice" data-tone="warning" role="alert">
              <Icon name="alert" size={18} />
              <div>
                <strong>Nie znaleziono alertu #{id}.</strong>
                <p>Mógł zostać usunięty. Wróć do listy alertów.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="drawer-title">
                <div className="row">
                  <SeverityBadge severity={view.severity} raw={view.alert.priority} />
                  <StatusBadge status={view.status} raw={view.alert.status} />
                </div>
                <h3>{view.type ? typeLabel(view.type) : (view.alert.title ?? `Alert #${id}`)}</h3>
                {view.target && (
                  <p className="route">
                    {view.distributed ? 'wiele źródeł' : (view.source ?? '—')} → {view.target}
                  </p>
                )}
              </div>

              <section>
                <h4 className="section-title">Szczegóły</h4>
                <dl className="dl">
                  <dt>Typ anomalii</dt>
                  <dd>
                    <TypeTag type={view.type} />
                  </dd>
                  <dt>Źródło</dt>
                  <dd>{view.distributed ? 'Wiele źródeł (atak rozproszony)' : (view.source ?? '—')}</dd>
                  <dt>Cel</dt>
                  <dd>{view.target ?? '—'}</dd>
                  <dt>Flow w grupie</dt>
                  <dd>{view.flowCount ?? '—'}</dd>
                  <dt>Pewność</dt>
                  <dd>
                    <Meter value={view.confidence} />
                  </dd>
                  <dt>Metoda detekcji</dt>
                  <dd>{methodLabel(view.method)}</dd>
                  <dt>Utworzono</dt>
                  <dd>
                    {formatDateTime(view.createdAt)}{' '}
                    <span className="muted">({formatRelative(view.createdAt)})</span>
                  </dd>
                  <dt>ID detekcji</dt>
                  <dd>{view.alert.detection_id ?? '—'}</dd>
                  <dt>Klucz grupy</dt>
                  <dd>{view.alert.group_key ? <code>{view.alert.group_key}</code> : '—'}</dd>
                </dl>
              </section>

              <section>
                <h4 className="section-title">Uzasadnienie detekcji</h4>
                {view.type && TYPE_HELP[view.type] && <p className="callout">{TYPE_HELP[view.type]}</p>}
                {view.alert.description && <p className="callout prewrap">{view.alert.description}</p>}
              </section>

              <section>
                <h4 className="section-title">Status</h4>
                <div className="segmented" role="group" aria-label="Zmień status alertu">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={view.status === status}
                      disabled={setStatus.isPending}
                      onClick={() => view.status !== status && changeStatus(status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="section-title">Zarządzanie</h4>
                <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={16} /> Usuń alert
                </button>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Usunąć alert #${id}?`}
        message="Alert zostanie trwale usunięty z bazy. Detekcje i flow, z których powstał, pozostaną."
        confirmLabel="Usuń"
        danger
        busy={remove.isPending}
        onConfirm={deleteAlert}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Dialog>
  )
}
