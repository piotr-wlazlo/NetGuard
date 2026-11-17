import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Definicje serwerów testowych, wspólne dla playwright.config.ts (testy) i scripts/codegen.ts (nagrywanie).
 *
 * Środowisko jest hermetyczne: własny backend na jednorazowej bazie SQLite i własny serwer Vite na
 * osobnych portach, żeby testy nie mogły zmienić danych w Twojej codziennej instancji.
 */

const here = dirname(fileURLToPath(import.meta.url))
export const E2E_DIR = resolve(here, '..')
export const REPO_DIR = resolve(E2E_DIR, '..')
export const FRONTEND_DIR = join(REPO_DIR, 'frontend')

export const API_PORT = Number(process.env.E2E_API_PORT ?? 8101)
export const UI_PORT = Number(process.env.E2E_UI_PORT ?? 5180)
// 127.0.0.1 zamiast „localhost”: Vite i uvicorn nasłuchują dokładnie tam, bez niespodzianek z IPv6
export const API_URL = `http://127.0.0.1:${API_PORT}`
export const UI_URL = `http://127.0.0.1:${UI_PORT}`

export interface ServerSpec {
  name: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  /** Adres, który odpowiada, gdy serwer jest gotowy. */
  url: string
}

/** Python z wirtualnego środowiska projektu (Linux/macOS i Windows) albo wskazany w E2E_PYTHON. */
export function findPython(): string {
  const candidates = [
    process.env.E2E_PYTHON,
    join(REPO_DIR, '.venv', 'bin', 'python'),
    join(REPO_DIR, '.venv', 'Scripts', 'python.exe'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      [
        'Nie znaleziono Pythona z zainstalowanym backendem NetGuard.',
        `Szukano: ${candidates.join(', ')}`,
        'Utwórz środowisko w katalogu głównym projektu: python -m venv .venv && .venv/bin/pip install -r requirements.txt',
        'albo wskaż interpreter zmienną E2E_PYTHON.',
      ].join('\n'),
    )
  }
  return found
}

export function viteBin(): string {
  return join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
}

/** Czytelny błąd zamiast niejasnego „serwer się nie uruchomił”. */
export function assertPrerequisites(): void {
  findPython()
  if (!existsSync(viteBin())) {
    throw new Error(
      `Brak zależności frontendu (${viteBin()}).\nUruchom: cd ${FRONTEND_DIR} && npm install`,
    )
  }
}

export function backendServer(): ServerSpec {
  return {
    name: 'api',
    command: findPython(),
    args: [join(E2E_DIR, 'scripts', 'run_test_backend.py')],
    cwd: REPO_DIR,
    env: { E2E_API_PORT: String(API_PORT), PYTHONUNBUFFERED: '1' },
    url: `${API_URL}/health`,
  }
}

export function frontendServer(): ServerSpec {
  return {
    name: 'ui',
    command: process.execPath,
    args: [viteBin(), '--host', '127.0.0.1', '--port', String(UI_PORT), '--strictPort'],
    cwd: FRONTEND_DIR,
    env: { VITE_PROXY_TARGET: API_URL },
    url: UI_URL,
  }
}

const quote = (part: string) => `"${part.replaceAll('"', '\\"')}"`

/** Pełne polecenie jako tekst, dla opcji webServer.command w Playwrighcie. */
export function shellCommand(spec: ServerSpec): string {
  return [spec.command, ...spec.args].map(quote).join(' ')
}
