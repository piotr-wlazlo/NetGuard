import type { Locator, Page } from '@playwright/test'

export type AlertStatusLabel = 'Nowy' | 'Potwierdzony' | 'Rozwiązany' | 'Fałszywy alarm'

/**
 * Obiekt komponentu (Component Object): panel szczegółów alertu otwierany z listy.
 * To fragment strony używany w kilku widokach, więc ma osobną klasę.
 */
export class AlertDrawer {
  readonly root: Locator
  readonly title: Locator
  readonly closeButton: Locator
  readonly deleteButton: Locator
  readonly deleteConfirmation: Locator
  private readonly statusGroup: Locator

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: /Szczegóły alertu/ })
    this.title = this.root.getByRole('heading', { level: 3 })
    this.closeButton = this.root.getByRole('button', { name: 'Zamknij panel' })
    this.deleteButton = this.root.getByRole('button', { name: /Usuń alert/ })
    this.deleteConfirmation = page.getByRole('dialog', { name: /Usunąć alert/ })
    this.statusGroup = this.root.getByRole('group', { name: 'Zmień status alertu' })
  }

  statusButton(label: AlertStatusLabel): Locator {
    return this.statusGroup.getByRole('button', { name: label, exact: true })
  }

  async setStatus(label: AlertStatusLabel): Promise<void> {
    await this.statusButton(label).click()
  }

  /** Wartość z listy „Szczegóły”, np. detail('Flow w grupie'). */
  detail(term: string): Locator {
    return this.root.locator('dt', { hasText: term }).locator('xpath=following-sibling::dd[1]')
  }

  async requestDelete(): Promise<void> {
    await this.deleteButton.click()
  }

  async confirmDelete(): Promise<void> {
    await this.deleteConfirmation.getByRole('button', { name: 'Usuń', exact: true }).click()
  }

  async cancelDelete(): Promise<void> {
    await this.deleteConfirmation.getByRole('button', { name: 'Anuluj' }).click()
  }

  async close(): Promise<void> {
    await this.closeButton.click()
  }
}
