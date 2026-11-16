import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Icon } from './icons'

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  text: string
}

type Push = (tone: Tone, text: string) => void

const ToastContext = createContext<Push>(() => {})

const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback<Push>(
    (tone, text) => {
      nextId.current += 1
      const id = nextId.current
      setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, tone, text }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div className="toast" data-tone={item.tone} key={item.id}>
            <p>{item.text}</p>
            <button type="button" className="icon-btn" aria-label="Zamknij powiadomienie" onClick={() => dismiss(item.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const push = useContext(ToastContext)
  return useMemo(
    () => ({
      success: (text: string) => push('success', text),
      error: (text: string) => push('error', text),
      info: (text: string) => push('info', text),
    }),
    [push],
  )
}
