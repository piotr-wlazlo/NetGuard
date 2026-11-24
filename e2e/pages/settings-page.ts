import type { Locator, Page } from '@playwright/test'

import { BasePage } from './base-page'

/** Widok „Konfiguracja”: progi i parametry detekcji. */
export class SettingsPage extends BasePage {
  readonly path = '/settings'
  readonly heading: Locator
  readonly saveButton: Locator
  readonly discardButton: Locator
  readonly resetButton: Locator
  readonly unsavedBar: Locator

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { level: 1, name: 'Konfiguracja detekcji' })
    this.saveButton = page.getByRole('button', { name: /Zapisz zmiany/ })
    this.discardButton = page.getByRole('button', { name: 'Odrzuć zmiany' })
    this.resetButton = page.getByRole('button', { name: 'Przywróć domyślne' })
    this.unsavedBar = page.getByRole('region', { name: 'Zapis zmian' })
  }

  /** Pole parametru po etykiecie, np. field('Skan portów: min. liczba portów'). */
  field(label: string): Locator {
    return this.page.getByLabel(label)
  }

  async setValue(label: string, value: string): Promise<void> {
    await this.field(label).fill(value)
  }

  async save(): Promise<void> {
    await this.saveButton.click()
  }

  async resetToDefaults(): Promise<void> {
    await this.resetButton.click()
    await this.page
      .getByRole('dialog', { name: 'Przywrócić wartości domyślne?' })
      .getByRole('button', { name: 'Przywróć', exact: true })
      .click()
  }
}
