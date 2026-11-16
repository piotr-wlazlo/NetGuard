import { useState } from 'react'

import { useConfig, useResetConfig, useUpdateConfig } from '../api/hooks'
import type { ConfigUpdate } from '../api/types'
import { TypeTag } from '../components/Badges'
import { ConfirmDialog } from '../components/Dialog'
import { ErrorBlock, InlineError, LoadingBlock } from '../components/States'
import { useToast } from '../components/Toast'
import { Icon } from '../components/icons'
import { SECTION_META, paramMeta, paramOrder, sectionOrder, toNumber, validateParam } from '../lib/config-meta'
import { TYPE_HELP, plural } from '../lib/format'
import { usePageTitle } from '../lib/use-page-title'

/** Edycje trzymamy osobno (klucz „sekcja.parametr”); bez edycji pole pokazuje wartość z serwera. */
type Edits = Record<string, string>

const keyOf = (section: string, name: string) => `${section}.${name}`

export function Settings() {
  usePageTitle('Konfiguracja')
  const config = useConfig()
  const update = useUpdateConfig()
  const reset = useResetConfig()
  const toast = useToast()

  const [edits, setEdits] = useState<Edits>({})
  const [confirmingReset, setConfirmingReset] = useState(false)

  const parameters = config.data?.parameters ?? {}

  const errors: Record<string, string> = {}
  const changes: ConfigUpdate = {}
  let changedCount = 0
  for (const [section, values] of Object.entries(parameters)) {
    for (const [name, serverValue] of Object.entries(values)) {
      const raw = edits[keyOf(section, name)]
      if (raw === undefined) continue
      const error = validateParam(name, raw)
      if (error) {
        errors[keyOf(section, name)] = error
        continue
      }
      const value = toNumber(raw)
      if (value !== serverValue) {
        changes[section] = { ...changes[section], [name]: value }
        changedCount += 1
      }
    }
  }
  const hasErrors = Object.keys(errors).length > 0
  const dirty = changedCount > 0 || hasErrors

  function save() {
    update.mutate(changes, {
      onSuccess: () => {
        setEdits({})
        toast.success(
          `Zapisano ${changedCount} ${plural(changedCount, 'parametr', 'parametry', 'parametrów')}. Nowe progi obowiązują od następnej analizy.`,
        )
      },
    })
  }

  function resetToDefaults() {
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirmingReset(false)
        setEdits({})
        toast.success('Przywrócono wartości domyślne.')
      },
      onError: () => {
        setConfirmingReset(false)
        toast.error('Nie udało się przywrócić wartości domyślnych.')
      },
    })
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Konfiguracja detekcji</h1>
          <p>Progi i parametry silnika detekcji. Zmiany dotyczą wszystkich kolejnych analiz.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!config.data || reset.isPending}
            onClick={() => setConfirmingReset(true)}
          >
            Przywróć domyślne
          </button>
        </div>
      </header>

      {config.isPending ? (
        <div className="card">
          <LoadingBlock rows={6} label="Ładowanie konfiguracji" />
        </div>
      ) : config.isError ? (
        <div className="card">
          <ErrorBlock error={config.error} onRetry={() => void config.refetch()} />
        </div>
      ) : (
        <>
          {sectionOrder(Object.keys(parameters)).map((section) => {
            const meta = SECTION_META[section] ?? { title: section, description: '' }
            return (
              <section className="card" key={section} aria-labelledby={`section-${section}`}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" id={`section-${section}`}>
                      {meta.title}
                    </h2>
                    {meta.description && <p className="card-sub">{meta.description}</p>}
                  </div>
                </div>
                <div className="card-body config-grid">
                  {paramOrder(Object.keys(parameters[section])).map((name) => {
                    const key = keyOf(section, name)
                    const info = paramMeta(name)
                    const serverValue = parameters[section][name]
                    const value = edits[key] ?? String(serverValue)
                    const error = errors[key]
                    const isDirty = edits[key] !== undefined && !error && toNumber(edits[key]) !== serverValue
                    const id = `param-${section}-${name}`
                    return (
                      <div className="field" key={key} data-dirty={isDirty}>
                        <label htmlFor={id}>{info.label}</label>
                        <input
                          id={id}
                          className="input"
                          inputMode="decimal"
                          autoComplete="off"
                          value={value}
                          aria-invalid={error !== undefined}
                          aria-describedby={`${id}-hint`}
                          onChange={(event) => setEdits((current) => ({ ...current, [key]: event.target.value }))}
                        />
                        {error ? (
                          <span className="error-text" id={`${id}-hint`}>
                            {error}
                          </span>
                        ) : (
                          info.hint && (
                            <span className="hint" id={`${id}-hint`}>
                              {info.hint}
                            </span>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <section className="card" aria-labelledby="section-types">
            <div className="card-header">
              <h2 className="card-title" id="section-types">
                Wykrywane typy anomalii
              </h2>
            </div>
            <div className="card-body">
              <ul className="type-list">
                {config.data.anomaly_types.map((type) => (
                  <li key={type}>
                    <span>
                      <TypeTag type={type} />
                    </span>
                    <p>{TYPE_HELP[type] ?? '—'}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {update.isError && <InlineError error={update.error} />}

          {dirty && (
            <div className="savebar" role="region" aria-label="Zapis zmian">
              <span>
                {hasErrors
                  ? 'Popraw błędne pola, aby zapisać zmiany.'
                  : `Niezapisane zmiany: ${changedCount}`}
              </span>
              <div className="row">
                <button type="button" className="btn" onClick={() => setEdits({})} disabled={update.isPending}>
                  Odrzuć zmiany
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={hasErrors || changedCount === 0 || update.isPending}
                >
                  <Icon name="check" size={16} /> {update.isPending ? 'Zapisuję…' : 'Zapisz zmiany'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmingReset}
        title="Przywrócić wartości domyślne?"
        message="Wszystkie progi i parametry wrócą do wartości fabrycznych. Tej operacji nie można cofnąć."
        confirmLabel="Przywróć"
        danger
        busy={reset.isPending}
        onConfirm={resetToDefaults}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  )
}
