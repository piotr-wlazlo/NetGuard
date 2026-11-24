import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { queryKeys, useAnalyze, usePcapJob, useUploadPcap } from '../api/hooks'
import type { DetectionMethod, FlowInput } from '../api/types'
import { MethodTag, SeverityBadge } from '../components/Badges'
import { Meter } from '../components/Charts'
import { PcapResult } from '../components/PcapResult'
import { InlineError } from '../components/States'
import { useToast } from '../components/Toast'
import { Icon } from '../components/icons'
import { asSeverity, countBy, toView } from '../lib/alerts'
import { parseFlowsJson } from '../lib/flows-input'
import { METHOD_LABELS, formatBytes, formatNumber, plural, typeLabel } from '../lib/format'
import { SCENARIOS, generateScenario, getScenario } from '../lib/scenarios'
import type { ScenarioId } from '../lib/scenarios'
import { usePageTitle } from '../lib/use-page-title'

type SourceMode = 'scenario' | 'json' | 'pcap'

const METHODS: DetectionMethod[] = ['rules', 'statistical', 'ml']
const METHOD_HINTS: Record<DetectionMethod, string> = {
  rules: 'Sztywne progi z konfiguracji. Działa dla dowolnej liczby flow.',
  statistical:
    'Odchylenie od typowego ruchu w partii (robust z-score). Wymaga min. 10 flow i ruchu, na tle którego wyróżnia się atak.',
  ml: 'Isolation Forest uczony na partii (min. 10 flow). Typ ataku i tak wynika z progów, jak w regułach.',
}

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_PCAP_BYTES = 200 * 1024 * 1024
const PCAP_EXTENSIONS = ['.pcap', '.pcapng', '.cap']
const DETECTIONS_PREVIEW = 15

export function Analysis() {
  usePageTitle('Analiza')
  const analyze = useAnalyze()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const pcapInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const upload = useUploadPcap()

  const [method, setMethod] = useState<DetectionMethod>('rules')
  const [mode, setMode] = useState<SourceMode>('scenario')
  const [scenarioId, setScenarioId] = useState<ScenarioId>('mixed')
  const [count, setCount] = useState(String(getScenario('mixed').defaultCount))
  const [jsonText, setJsonText] = useState('')
  const [jsonErrors, setJsonErrors] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  const [pcapFile, setPcapFile] = useState<File | null>(null)
  const [pcapError, setPcapError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = usePcapJob(jobId)
  const jobStatus = job.data?.status
  const pcapRunning =
    upload.isPending || (jobId !== null && !job.isError && jobStatus !== 'done' && jobStatus !== 'failed')

  // Po zakończeniu importu: odświeżenie listy alertów i powiadomienie (raz na zadanie)
  const announced = useRef<string | null>(null)
  useEffect(() => {
    const data = job.data
    if (!data || announced.current === data.job_id) return
    if (data.status === 'done') {
      announced.current = data.job_id
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts })
      toast.success(`Import PCAP zakończony: ${data.detection_count} detekcji, ${data.alert_count} nowych alertów.`)
    } else if (data.status === 'failed') {
      announced.current = data.job_id
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts })
      toast.error('Import PCAP zakończył się błędem.')
    }
  }, [job.data, queryClient, toast])

  const scenario = getScenario(scenarioId)
  const countValue = Number(count)
  const countError =
    mode !== 'scenario'
      ? null
      : !Number.isInteger(countValue) || countValue < scenario.min || countValue > scenario.max
        ? `Podaj liczbę całkowitą od ${scenario.min} do ${scenario.max}.`
        : null

  function chooseScenario(id: ScenarioId) {
    setScenarioId(id)
    setCount(String(getScenario(id).defaultCount))
  }

  function choosePcap(file: File | undefined) {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!PCAP_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      setPcapFile(null)
      setPcapError('Wybierz plik z rozszerzeniem .pcap, .pcapng albo .cap.')
      return
    }
    if (file.size > MAX_PCAP_BYTES) {
      setPcapFile(null)
      setPcapError(`Plik jest za duży (${formatBytes(file.size)}). Limit to 200 MB.`)
      return
    }
    setPcapFile(file)
    setPcapError(null)
  }

  function runPcap() {
    if (!pcapFile) {
      setPcapError('Wybierz plik PCAP.')
      return
    }
    setJobId(null)
    upload.mutate({ file: pcapFile, method }, { onSuccess: (created) => setJobId(created.job_id) })
  }

  function run() {
    if (mode === 'pcap') {
      runPcap()
      return
    }
    let flows: FlowInput[]
    if (mode === 'scenario') {
      flows = generateScenario(scenarioId, { count: countValue })
    } else {
      const parsed = parseFlowsJson(jsonText)
      if (!parsed.ok) {
        setJsonErrors(parsed.errors)
        return
      }
      setJsonErrors([])
      flows = parsed.flows
    }
    setShowAll(false)
    analyze.mutate(
      { flows, method },
      {
        onSuccess: (result) =>
          toast.success(
            `Analiza zakończona: ${result.detection_count} detekcji, ${result.alert_count} nowych alertów.`,
          ),
      },
    )
  }

  async function loadFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setJsonErrors([`Plik jest za duży (${Math.round(file.size / 1024 / 1024)} MB). Limit to 5 MB.`])
      return
    }
    setJsonText(await file.text())
    setJsonErrors([])
  }

  function insertExample() {
    const example = generateScenario('port_scan', { count: 10 }).slice(0, 3)
    setJsonText(JSON.stringify({ flows: example }, null, 2))
    setJsonErrors([])
  }

  const result = analyze.data
  const sentFlows = analyze.variables?.flows.length ?? 0
  const sentMethod = analyze.variables?.method
  const byType = useMemo(
    () => countBy((result?.detections ?? []).map((detection) => detection.anomaly_type ?? '—')),
    [result],
  )
  const createdAlerts = useMemo(() => (result?.alerts ?? []).map(toView), [result])
  const visibleDetections = showAll ? result?.detections : result?.detections.slice(0, DETECTIONS_PREVIEW)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Analiza ruchu</h1>
          <p>Wyślij flow do silnika detekcji, wybierz metodę i sprawdź, jakie anomalie zostaną wykryte.</p>
        </div>
      </header>

      <div className="grid grid-split">
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault()
            run()
          }}
        >
          <div className="card-body stack">
            <div className="field">
              <span className="field-label" id="method-label">
                Metoda detekcji
              </span>
              <div className="segmented" role="group" aria-labelledby="method-label">
                {METHODS.map((item) => (
                  <button key={item} type="button" aria-pressed={method === item} onClick={() => setMethod(item)}>
                    {METHOD_LABELS[item].replace(' (Isolation Forest)', '')}
                  </button>
                ))}
              </div>
              <p className="hint">{METHOD_HINTS[method]}</p>
            </div>

            <div className="field">
              <span className="field-label" id="source-label">
                Źródło danych
              </span>
              <div className="segmented" role="group" aria-labelledby="source-label">
                <button type="button" aria-pressed={mode === 'scenario'} onClick={() => setMode('scenario')}>
                  Scenariusz testowy
                </button>
                <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>
                  Własny JSON
                </button>
                <button type="button" aria-pressed={mode === 'pcap'} onClick={() => setMode('pcap')}>
                  Plik PCAP
                </button>
              </div>
            </div>

            {mode === 'scenario' ? (
              <>
                <fieldset className="choice-grid" style={{ border: 0, margin: 0, padding: 0 }}>
                  <legend className="sr-only">Scenariusz</legend>
                  {SCENARIOS.map((item) => (
                    <label className="choice" key={item.id}>
                      <input
                        type="radio"
                        name="scenario"
                        value={item.id}
                        checked={scenarioId === item.id}
                        onChange={() => chooseScenario(item.id)}
                      />
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </label>
                  ))}
                </fieldset>

                <div className="field">
                  <label htmlFor="scenario-count">{scenario.countLabel}</label>
                  <input
                    id="scenario-count"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={scenario.min}
                    max={scenario.max}
                    value={count}
                    aria-invalid={countError !== null}
                    aria-describedby="scenario-expect"
                    onChange={(event) => setCount(event.target.value)}
                  />
                  {countError ? (
                    <span className="error-text">{countError}</span>
                  ) : (
                    <span className="hint" id="scenario-expect">
                      {scenario.expectation}
                    </span>
                  )}
                </div>
                <p className="hint">
                  Dane są generowane w przeglądarce jako syntetyczne metadane flow (zakres adresów
                  dokumentacyjnych); nic nie opuszcza Twojej sieci poza wywołaniem API.
                </p>
              </>
            ) : mode === 'pcap' ? (
              <div className="field">
                <span className="field-label" id="pcap-label">
                  Plik z przechwyconym ruchem
                </span>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    aria-describedby="pcap-label"
                    onClick={() => pcapInput.current?.click()}
                  >
                    <Icon name="upload" size={15} /> Wybierz plik PCAP
                  </button>
                  <span className={pcapFile ? undefined : 'muted'} data-testid="pcap-file">
                    {pcapFile ? `${pcapFile.name} · ${formatBytes(pcapFile.size)}` : 'Nie wybrano pliku'}
                  </span>
                  <input
                    ref={pcapInput}
                    type="file"
                    accept=".pcap,.pcapng,.cap,application/vnd.tcpdump.pcap"
                    hidden
                    data-testid="pcap-input"
                    onChange={(event) => {
                      choosePcap(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </div>
                <span className="hint">
                  Pliki .pcap i .pcapng do 200 MB. Plik jest analizowany na serwerze w tle: pakiety trafiają przez
                  kolejkę Redis do silnika detekcji, a wykryte anomalie do alertów.
                </span>
                {pcapError && (
                  <div className="notice" data-tone="error" role="alert">
                    <Icon name="alert" size={18} />
                    <div>{pcapError}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="field">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <label htmlFor="flows-json">Flow w formacie JSON</label>
                  <div className="row">
                    <button type="button" className="btn btn-sm" onClick={insertExample}>
                      Wstaw przykład
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
                      <Icon name="upload" size={15} /> Wczytaj plik
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={(event) => {
                        void loadFile(event.target.files?.[0])
                        event.target.value = ''
                      }}
                    />
                  </div>
                </div>
                <textarea
                  id="flows-json"
                  className="textarea"
                  spellCheck={false}
                  placeholder='{"flows": [{"source_ip": "10.0.0.1", "destination_ip": "10.0.0.2", ...}]}'
                  value={jsonText}
                  aria-invalid={jsonErrors.length > 0}
                  onChange={(event) => setJsonText(event.target.value)}
                />
                <span className="hint">Tablica flow albo obiekt {'{"flows": [...]}'}, maksymalnie 1000 flow.</span>
                {jsonErrors.length > 0 && (
                  <div className="notice" data-tone="error" role="alert">
                    <Icon name="alert" size={18} />
                    <ul style={{ margin: 0 }}>
                      {jsonErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={analyze.isPending || pcapRunning || countError !== null}
            >
              <Icon name="play" size={16} className={analyze.isPending || pcapRunning ? 'spin' : undefined} />
              {mode === 'pcap' && upload.isPending
                ? 'Wysyłam plik…'
                : analyze.isPending || pcapRunning
                  ? 'Analizuję…'
                  : 'Uruchom analizę'}
            </button>
          </div>
        </form>

        <div className="stack" aria-live="polite">
          {mode === 'pcap' ? (
            <>
              {upload.isError && <InlineError error={upload.error} />}
              {job.isError && <InlineError error={job.error} />}
              {job.data ? (
                <PcapResult job={job.data} />
              ) : (
                !upload.isError &&
                !job.isError && (
                  <div className="card">
                    <div className="state">
                      <span className="state-icon">
                        <Icon name="upload" size={22} />
                      </span>
                      <h3>{pcapRunning ? 'Wysyłanie pliku…' : 'Wyniki importu pojawią się tutaj'}</h3>
                      <p>
                        Wybierz plik PCAP i uruchom analizę. Postęp importu jest widoczny na bieżąco, a utworzone
                        alerty od razu trafiają do zakładki Alerty.
                      </p>
                    </div>
                  </div>
                )
              )}
            </>
          ) : (
          <>
          {analyze.isError && <InlineError error={analyze.error} />}

          {!result && !analyze.isError && (
            <div className="card">
              <div className="state">
                <span className="state-icon">
                  <Icon name="play" size={22} />
                </span>
                <h3>Wyniki pojawią się tutaj</h3>
                <p>
                  Wybierz metodę i dane, a następnie uruchom analizę. Wykryte anomalie trafią do bazy i
                  zostaną zgrupowane w alerty.
                </p>
              </div>
            </div>
          )}

          {result && (
            <>
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Wynik analizy</h2>
                  {sentMethod && <MethodTag method={sentMethod} />}
                </div>
                <div className="card-body stack">
                  <div className="result-tiles">
                    <div className="tile">
                      <span className="tile-label">Wysłane flow</span>
                      <span className="tile-value">{formatNumber(sentFlows || result.flow_count)}</span>
                    </div>
                    <div className="tile">
                      <span className="tile-label">Detekcje</span>
                      <span className="tile-value">{formatNumber(result.detection_count)}</span>
                    </div>
                    <div className="tile">
                      <span className="tile-label">Nowe alerty</span>
                      <span className="tile-value">{formatNumber(result.alert_count)}</span>
                    </div>
                  </div>

                  {byType.length > 0 && (
                    <div className="chips">
                      {byType.map((item) => (
                        <span className="tag" key={item.key}>
                          {typeLabel(item.key)}: {formatNumber(item.count)}
                        </span>
                      ))}
                    </div>
                  )}

                  {result.detection_count === 0 && (
                    <div className="notice" data-tone="warning">
                      <Icon name="alert" size={18} />
                      <div>
                        <strong>Brak detekcji.</strong>{' '}
                        {sentMethod === 'rules' ? (
                          <>
                            Żadne flow nie przekroczyło progów. Zwiększ liczbę flow albo obniż progi w{' '}
                            <Link to="/settings">Konfiguracji</Link>.
                          </>
                        ) : (
                          <>
                            Metody statystyczna i ML porównują flow z resztą partii, więc w czystym ataku
                            (bez ruchu tła) nic się nie wyróżnia. Spróbuj scenariusza „Ruch mieszany” albo
                            metody reguł.
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {result.detection_count > 0 && result.alert_count === 0 && (
                    <div className="notice">
                      <Icon name="alert" size={18} />
                      <div>
                        Nie utworzono nowych alertów: dla tych grup (typ, źródło, cel) alerty są już
                        otwarte. Zamknij je w zakładce <Link to="/alerts">Alerty</Link> albo wygeneruj dane
                        ponownie.
                      </div>
                    </div>
                  )}

                  {result.alert_count > 0 && (
                    <p className="explain">
                      Wiele detekcji jest łączonych w jeden alert na grupę „typ, źródło, cel”, dlatego alertów
                      jest mniej niż detekcji.
                    </p>
                  )}
                </div>
              </div>

              {createdAlerts.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Utworzone alerty</h2>
                    <span className="card-sub">{createdAlerts.length}</span>
                  </div>
                  <ul className="recent" style={{ marginTop: 8 }}>
                    {createdAlerts.map((view) => (
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
                          <span className="muted nowrap">{view.flowCount ?? '—'} flow</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {visibleDetections && visibleDetections.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Detekcje</h2>
                    <span className="card-sub">
                      {formatNumber(result.detection_count)}{' '}
                      {plural(result.detection_count, 'detekcja', 'detekcje', 'detekcji')}
                    </span>
                  </div>
                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Flow</th>
                          <th scope="col">Typ</th>
                          <th scope="col">Priorytet</th>
                          <th scope="col">Pewność</th>
                          <th scope="col">Wyjaśnienie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDetections.map((detection, index) => (
                          <tr key={detection.id ?? index}>
                            <td className="nowrap muted">#{detection.flow_id ?? '—'}</td>
                            <td className="nowrap">{typeLabel(detection.anomaly_type)}</td>
                            <td>
                              <SeverityBadge severity={asSeverity(detection.severity)} raw={detection.severity} />
                            </td>
                            <td>
                              <Meter value={detection.confidence} />
                            </td>
                            <td>{detection.explanation ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!showAll && result.detections.length > DETECTIONS_PREVIEW && (
                    <div className="pager">
                      <span>
                        Pokazano {DETECTIONS_PREVIEW} z {formatNumber(result.detections.length)}
                      </span>
                      <button type="button" className="btn btn-sm" onClick={() => setShowAll(true)}>
                        Pokaż wszystkie
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
