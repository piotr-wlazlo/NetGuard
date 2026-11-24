import type { Locator, Page } from '@playwright/test'

import { AlertDrawer } from './alert-drawer'
import { BasePage } from './base-page'

/** Widok „Alerty”: historia anomalii z wyszukiwaniem, filtrami i sortowaniem. */
export class AlertsPage extends BasePage {
  readonly path = '/alerts'
  readonly heading: Locator
  readonly searchBox: Locator
  readonly statusFilter: Locator
  readonly severityFilter: Locator
  readonly typeFilter: Locator
  readonly sortSelect: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly resultsSummary: Locator
  readonly clearFiltersButton: Locator
  readonly noMatchesState: Locator
  readonly emptyState: Locator
  readonly drawer: AlertDrawer

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { level: 1, name: 'Alerty' })
    this.searchBox = page.getByRole('searchbox')
    this.statusFilter = page.getByRole('combobox', { name: 'Status' })
    this.severityFilter = page.getByRole('combobox', { name: 'Priorytet' })
    this.typeFilter = page.getByRole('combobox', { name: 'Typ anomalii' })
    this.sortSelect = page.getByRole('combobox', { name: 'Sortowanie' })
    this.table = page.getByRole('table')
    this.rows = this.table.locator('tbody').getByRole('row')
    this.resultsSummary = page.locator('.toolbar-meta')
    this.clearFiltersButton = page.getByRole('button', { name: /Wyczyść filtry/ })
    this.noMatchesState = page.getByRole('heading', { name: 'Żaden alert nie pasuje do filtrów' })
    this.emptyState = page.getByRole('heading', { name: 'Brak alertów' })
    this.drawer = new AlertDrawer(page)
  }

  /** Wiersz zawierający podany tekst, np. rowWith('Skanowanie portów'). */
  rowWith(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text })
  }

  async search(text: string): Promise<void> {
    await this.searchBox.fill(text)
  }

  async filterByStatus(label: string): Promise<void> {
    await this.statusFilter.selectOption({ label })
  }

  /** Otwiera panel szczegółów alertu z danego wiersza. */
  async openAlert(rowText: string | RegExp): Promise<AlertDrawer> {
    await this.rowWith(rowText).getByRole('link').click()
    await this.drawer.root.waitFor()
    return this.drawer
  }
}
