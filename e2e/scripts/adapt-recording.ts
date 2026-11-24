interface AdaptOptions {
  /** Adres aplikacji użyty podczas nagrywania, np. http://127.0.0.1:5180 */
  uiUrl: string
  /** Czy nagrywano na bazie z zasianymi alertami (--seed). */
  seeded: boolean
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Dopasowuje surowe nagranie z `playwright codegen` do tego projektu, żeby od razu dało się je uruchomić
 * razem z pozostałymi testami:
 *  - `test` i `expect` pochodzą z support/fixtures (automatyczne czyszczenie stanu, obiekty stron, `api`),
 *  - adresy bez hosta (`page.goto('/alerts')`), bo host i port ustawia baseURL w konfiguracji.
 */
export function adaptRecording(code: string, { uiUrl, seeded }: AdaptOptions): string {
  const adapted = code
    .replace(/from\s+(['"])@playwright\/test\1/, "from '../support/fixtures'")
    .replace(new RegExp(`(['"\`])${escapeRegExp(uiUrl)}/?`, 'g'), '$1/')

  const header = [
    '// Nagranie z codegen. Zanim je zacommitujesz:',
    '//  - nadaj tytuł zgodny z Planem Testów (TC-UI-xx) i dodaj asercje (expect), bo samo nagranie niczego nie sprawdza,',
    '//  - przenieś powtarzalne kroki do obiektów stron (pages/),',
    '//  - dopóki test jest niedopracowany, oznacz go jako test.fixme(...), żeby nie psuł `npm test` całemu zespołowi.',
    ...(seeded
      ? [
          '// Nagrano na bazie z zasianymi alertami (--seed): odtwórz je w teście, np. await api.seedPortScanAlert(),',
          '// bo każdy test zaczyna od pustej bazy.',
        ]
      : []),
    '',
    '',
  ].join('\n')

  return header + adapted
}
