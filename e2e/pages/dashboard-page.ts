import type { Locator, Page } from '@playwright/test'

import { BasePage } from './base-page'

/** Widok „Przegląd”: wskaźniki, wykresy i ostatnie alerty. */
export class DashboardPage extends BasePage {
  readonly path = '/'
  readonly heading: Locator
  readonly emptyState: Locator
  readonly goToAnalysisLink: Locator
  readonly recentAlerts: Locator

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { level: 1, name: 'Przegląd' })
    this.emptyState = page.getByRole('heading', { name: 'Brak wykrytych anomalii' })
    this.goToAnalysisLink = page.getByRole('link', { name: /Przejdź do analizy/ })
    this.recentAlerts = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Ostatnie alerty' }) })
      .getByRole('listitem')
  }

  /** Kafelek wskaźnika, np. tile('Otwarte alerty'). */
  tile(label: string): Locator {
    return this.page.locator('.tile').filter({ hasText: label })
  }

  tileValue(label: string): Locator {
    return this.tile(label).locator('.tile-value')
  }
}
