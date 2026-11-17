import type { Locator, Page } from '@playwright/test'

export type NavItem = 'Przegląd' | 'Alerty' | 'Analiza' | 'Konfiguracja'

/**
 * Wzorzec Page Object: każdy widok aplikacji ma własną klasę z lokatorami i akcjami użytkownika.
 * Testy mówią „co robi użytkownik” (np. alertsPage.search('10.0.0.1')), a nie „jak to znaleźć w DOM”,
 * więc zmiana wyglądu strony wymaga poprawki w jednym miejscu, a nie w każdym teście.
 *
 * Lokatory są publiczne, żeby asercje (expect) zostały w testach, a nie w klasach stron.
 */
export abstract class BasePage {
  /** Adres widoku względem baseURL. */
  abstract readonly path: string
  /** Nagłówek h1, po którym poznajemy, że widok jest załadowany. */
  abstract readonly heading: Locator

  readonly navigation: Locator
  readonly apiStatus: Locator
  readonly toasts: Locator

  constructor(protected readonly page: Page) {
    this.navigation = page.getByRole('navigation', { name: 'Główna nawigacja' })
    this.apiStatus = page.getByRole('status').filter({ hasText: /^API/ })
    this.toasts = page.locator('.toasts')
  }

  async open(): Promise<void> {
    await this.page.goto(this.path)
    await this.heading.waitFor()
  }

  navLink(item: NavItem): Locator {
    // przy liczniku nowych alertów nazwa linku to np. „Alerty 3 nowych”, więc dopasowujemy początek
    return this.navigation.getByRole('link', { name: new RegExp(`^${item}`) })
  }

  async goTo(item: NavItem): Promise<void> {
    await this.navLink(item).click()
  }
}
