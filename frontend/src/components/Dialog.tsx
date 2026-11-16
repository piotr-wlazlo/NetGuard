import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  className: string
  label: string
  children: ReactNode
}

/**
 * Cienka nakładka na natywny <dialog>: focus trap, zamykanie klawiszem Esc, tło (::backdrop)
 * i przywracanie fokusu zapewnia przeglądarka.
 */
export function Dialog({ open, onClose, className, label, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // Programowe zamknięcie (cleanup efektu) też wywołuje zdarzenie „close” — nie traktujemy go
  // jak akcji użytkownika, bo np. w React StrictMode zamykałoby panel zaraz po otwarciu.
  const programmaticClose = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    dialog.showModal()
    return () => {
      if (dialog.open) {
        programmaticClose.current = true
        dialog.close()
      }
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onClose={() => {
        if (programmaticClose.current) {
          programmaticClose.current = false
          return
        }
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open ? children : null}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="modal" label={title}>
      <div className="modal-inner">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Anuluj
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
