import type { FullConfig } from '@playwright/test'

/**
 * Bezpieczniki przed startem testów.
 *
 * Fixture `cleanState` przed każdym testem KASUJE WSZYSTKIE ALERTY i RESETUJE konfigurację detekcji.
 * Na własnym backendzie testowym (domyślnie) to nieszkodliwe, ale na prawdziwej instancji oznaczałoby
 * utratę danych, dlatego użycie zewnętrznego adresu wymaga jawnego potwierdzenia.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const external = process.env.E2E_BASE_URL
  if (external && process.env.E2E_ALLOW_DESTRUCTIVE !== '1') {
    throw new Error(
      [
        `E2E_BASE_URL=${external} wskazuje na istniejącą aplikację.`,
        'Testy skasują w niej wszystkie alerty i zresetują konfigurację detekcji.',
        'Jeśli to jest świadome (np. dedykowana instancja testowa), ustaw także E2E_ALLOW_DESTRUCTIVE=1.',
      ].join('\n'),
    )
  }

  // Sprawdzamy całą ścieżkę przeglądarka -> Vite -> proxy -> API, zanim ruszy pierwszy test.
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('Brak baseURL w konfiguracji Playwrighta.')

  let response: Response
  try {
    response = await fetch(`${baseURL}/health`)
  } catch (error) {
    throw new Error(`Aplikacja nie odpowiada pod ${baseURL}: ${error instanceof Error ? error.message : error}`)
  }
  if (!response.ok) {
    throw new Error(`GET ${baseURL}/health zwrócił ${response.status}. Czy backend działa i proxy Vite wskazuje na niego?`)
  }
}
