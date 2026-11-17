import { defineConfig, devices } from '@playwright/test'

import { UI_URL, assertPrerequisites, backendServer, frontendServer, shellCommand } from './stack/servers'

/*
 * Domyślnie `npm test` sam uruchamia backend (SQLite) i frontend na osobnych portach, wykonuje testy
 * i wszystko zamyka. Żeby przetestować już działającą aplikację, ustaw E2E_BASE_URL
 * (patrz global-setup.ts: testy czyszczą alerty i resetują konfigurację, więc wymaga to potwierdzenia).
 */

const externalBaseUrl = process.env.E2E_BASE_URL
const baseURL = externalBaseUrl ?? UI_URL

if (!externalBaseUrl) assertPrerequisites()

export default defineConfig({
  testDir: './tests',
  // jedna współdzielona baza => testy idą po kolei, a każdy zaczyna od czystego stanu (fixture cleanState)
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',

  use: {
    baseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    // ślady, zrzuty i wideo tylko dla testów, które nie przeszły
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Kolejne przeglądarki: npx playwright install firefox webkit i odkomentuj.
    // { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],

  webServer: externalBaseUrl
    ? undefined
    : [backendServer(), frontendServer()].map((spec) => ({
        command: shellCommand(spec),
        cwd: spec.cwd,
        env: spec.env,
        url: spec.url,
        timeout: 90_000,
        // nigdy nie podłączamy się do cudzego serwera na tym porcie (mógłby mieć prawdziwą bazę)
        reuseExistingServer: process.env.E2E_REUSE_SERVERS === '1',
        stdout: 'ignore' as const,
        stderr: 'pipe' as const,
      })),
})
