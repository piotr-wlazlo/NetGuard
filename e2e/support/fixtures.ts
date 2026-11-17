import { test as base } from '@playwright/test'

import { AlertsPage } from '../pages/alerts-page'
import { AnalysisPage } from '../pages/analysis-page'
import { DashboardPage } from '../pages/dashboard-page'
import { SettingsPage } from '../pages/settings-page'
import { ApiClient } from './api-client'

interface NetGuardFixtures {
  /** Fasada REST API do przygotowania stanu i dodatkowych weryfikacji. */
  api: ApiClient
  dashboard: DashboardPage
  alertsPage: AlertsPage
  analysisPage: AnalysisPage
  settingsPage: SettingsPage
  /** Automatyczny: przed każdym testem czyści alerty i przywraca domyślną konfigurację. */
  cleanState: void
}

/**
 * Własne `test` z wstrzykiwanymi obiektami stron (mechanizm fixtures Playwrighta).
 * Wszystkie testy importują `test` i `expect` z tego pliku, a nie z '@playwright/test'.
 */
export const test = base.extend<NetGuardFixtures>({
  api: async ({ request }, use) => {
    await use(new ApiClient(request))
  },

  cleanState: [
    async ({ api }, use) => {
      await api.deleteAllAlerts()
      await api.resetConfig()
      await use()
    },
    { auto: true },
  ],

  dashboard: async ({ page }, use) => {
    await use(new DashboardPage(page))
  },
  alertsPage: async ({ page }, use) => {
    await use(new AlertsPage(page))
  },
  analysisPage: async ({ page }, use) => {
    await use(new AnalysisPage(page))
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page))
  },
})

export { expect } from '@playwright/test'
