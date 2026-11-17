/*
 * Środowisko do nagrywania testów UI (Playwright codegen).
 *
 *   npm run codegen              nagrywanie na pustej, jednorazowej bazie
 *   npm run codegen -- --seed    nagrywanie na bazie z dwoma gotowymi alertami (skan portów, brute force)
 *   npm run codegen -- --check   tylko sprawdza, że środowisko wstaje (bez okna przeglądarki)
 *   npm run stack                tylko uruchamia aplikację (bez nagrywania), do ręcznego klikania
 *
 * Skrypt stawia własny backend (SQLite) i frontend na osobnych portach, otwiera `playwright codegen`
 * na aplikacji, a po zamknięciu okna przeglądarki zatrzymuje serwery. Nagranie zapisuje się od razu w tests/
 * (po dopasowaniu do projektu, patrz adapt-recording.ts). Dane z nagrywania nie trafiają do Waszej codziennej bazy.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { ServerSpec } from '../stack/servers'
import { API_PORT, E2E_DIR, UI_PORT, UI_URL, assertPrerequisites, backendServer, frontendServer } from '../stack/servers'
import { FlowBuilder } from '../support/flow-builder'
import { adaptRecording } from './adapt-recording'

const OWN_FLAGS = ['--seed', '--check', '--stack-only']
const args = process.argv.slice(2)
const has = (flag: string) => args.includes(flag)
const codegenArgs = args.filter((arg) => !OWN_FLAGS.includes(arg))

const children: ChildProcess[] = []

function stopServers(): void {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
}
process.on('exit', stopServers)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopServers()
    process.exit(130)
  })
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
}

async function ensurePortsFree(): Promise<void> {
  for (const [name, port, variable] of [
    ['API', API_PORT, 'E2E_API_PORT'],
    ['frontend', UI_PORT, 'E2E_UI_PORT'],
  ] as const) {
    if (!(await isPortFree(port))) {
      throw new Error(
        `Port ${port} (${name}) jest zajęty. Zamknij proces, który go używa (np. inne nagrywanie lub testy), ` +
          `albo ustaw inny port zmienną ${variable}. Nie podłączam się do cudzego serwera, bo mógłby mieć prawdziwą bazę.`,
      )
    }
  }
}

async function startServer(spec: ServerSpec): Promise<void> {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.resume()
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(`[${spec.name}] ${chunk}`))

  let exited = false
  child.once('exit', () => {
    exited = true
  })

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Serwer „${spec.name}” zakończył się przed uruchomieniem (${spec.command} ${spec.args.join(' ')}).`)
    try {
      const response = await fetch(spec.url)
      if (response.status < 500) return
    } catch {
      // jeszcze się uruchamia
    }
    await sleep(300)
  }
  throw new Error(`Serwer „${spec.name}” nie odpowiedział pod ${spec.url} w ciągu 90 s.`)
}

async function seedAlerts(): Promise<void> {
  const traffic = [
    new FlowBuilder().portScan(150),
    new FlowBuilder().from('203.0.113.9').to('10.0.0.22').bruteForce(40),
  ]
  for (const flows of traffic) {
    const response = await fetch(`${UI_URL}/api/v1/analysis/flows?method=rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flows }),
    })
    if (!response.ok) throw new Error(`Nie udało się zasiać danych: ${response.status} ${await response.text()}`)
  }
}

function timestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

async function main(): Promise<void> {
  assertPrerequisites()
  await ensurePortsFree()

  console.log('Uruchamiam backend testowy (SQLite) i frontend…')
  await startServer(backendServer())
  await startServer(frontendServer())
  if (has('--seed')) await seedAlerts()
  console.log(`Aplikacja działa: ${UI_URL}${has('--seed') ? ' (z 2 zasianymi alertami)' : ' (pusta baza)'}`)

  if (has('--check')) {
    const health = await fetch(`${UI_URL}/health`)
    console.log(`Sprawdzenie ścieżki przeglądarka -> Vite -> API: GET /health = ${health.status}. Środowisko jest sprawne.`)
    return
  }

  if (has('--stack-only')) {
    console.log('Naciśnij Ctrl+C, aby zakończyć.')
    await new Promise(() => {})
  }

  const userChoseOutput = codegenArgs.some((arg) => arg === '-o' || arg.startsWith('--output'))
  const output = join(E2E_DIR, 'tests', `nagranie-${timestamp()}.spec.ts`)

  console.log(
    [
      '',
      'Otwieram Playwright codegen. Jak nagrywać:',
      '  1. Klikaj po aplikacji w oknie przeglądarki. Kod pojawia się w oknie „Playwright Inspector”.',
      '  2. Na pasku narzędzi przeglądarki użyj „Assert visibility / text / value”, żeby dodać asercje.',
      '  3. „Pick locator” pokazuje lokator wskazanego elementu bez nagrywania akcji.',
      '  4. Zamknij okno przeglądarki, żeby zakończyć. Serwery zatrzymają się same, a test zostanie w tests/.',
      userChoseOutput ? '' : `Nagranie zapisze się w: ${relative(process.cwd(), output) || output}`,
      '',
    ].join('\n'),
  )

  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
  const codegen = spawn(
    process.execPath,
    [
      cli,
      'codegen',
      '--browser=chromium',
      '--viewport-size=1440,900',
      '--lang=pl-PL',
      '--timezone=Europe/Warsaw',
      '--color-scheme=light',
      '--target=playwright-test',
      ...(userChoseOutput ? [] : [`--output=${output}`]),
      ...codegenArgs,
      UI_URL,
    ],
    { cwd: E2E_DIR, stdio: 'inherit' },
  )
  const code = await new Promise<number | null>((resolve) => codegen.on('exit', resolve))

  if (!userChoseOutput && existsSync(output)) {
    writeFileSync(output, adaptRecording(readFileSync(output, 'utf8'), { uiUrl: UI_URL, seeded: has('--seed') }))
    console.log(`\nNagranie zapisane w tests/: ${relative(process.cwd(), output) || output}`)
    console.log('Uruchom je: npm run test:headed -- ' + relative(E2E_DIR, output))
  }
  process.exitCode = code ?? 0
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
  .finally(() => {
    // --stack-only działa do Ctrl+C, a pozostałe tryby kończą się po main()
    if (!has('--stack-only')) {
      stopServers()
      setTimeout(() => process.exit(), 500).unref()
    }
  })
