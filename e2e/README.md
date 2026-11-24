# NetGuard: testy UI (Playwright)

Wspólny projekt zespołu do testów interfejsu. Playwright + TypeScript, wzorce: Page Object, Component Object,
Fixtures, Builder i Facade (patrz „Struktura”).

## Szybki start

Wymagania: Node 20+, działający frontend (`cd ../frontend && npm install`) oraz Python z backendem
(`python -m venv .venv && .venv/bin/pip install -r requirements.txt` w katalogu głównym projektu).

```bash
cd e2e
npm install
npm run install:browsers     # jednorazowo: pobiera Chromium (ok. 200 MB)

npm test                     # wszystkie testy, bez okna przeglądarki
npm run test:headed          # z widoczną przeglądarką
npm run test:ui              # tryb interaktywny Playwrighta (podgląd kroków, ponowne uruchamianie)
npm run test:debug           # krokowe debugowanie z Inspectorem
npm run report               # raport HTML z ostatniego przebiegu
```

Nic nie trzeba uruchamiać ręcznie: `npm test` sam startuje backend i frontend, wykonuje testy i zamyka serwery.

## Nagrywanie testów (codegen)

```bash
npm run codegen              # pusta baza
npm run codegen -- --seed    # baza z 2 gotowymi alertami (skan portów, brute force)
```

Skrypt stawia własną, jednorazową aplikację, otwiera przeglądarkę z oknem **Playwright Inspector** i po jej zamknięciu
sprząta. Nagranie zapisuje się od razu w `tests/nagranie-<data>.spec.ts`, a kod widać na żywo w Inspectorze.

1. Klikaj po aplikacji: każda akcja pojawia się w Inspectorze jako kod.
2. Asercje dodasz przyciskami na pasku narzędzi: **Assert visibility**, **Assert text**, **Assert value**.
3. **Pick locator** pokazuje lokator wskazanego elementu bez nagrywania akcji.
4. Zamknij okno przeglądarki. Zakończy się nagrywanie i zatrzymają serwery.

Przydatne dodatki: `npm run codegen -- --device="iPhone 13"` (widok mobilny), `npm run codegen -- --color-scheme=dark`.
Samą aplikację (bez nagrywania) uruchomisz przez `npm run stack`.

**Nagranie trafia do `tests/` i jest uruchamiane razem z resztą (`npm test`), ale to wciąż szkic.** Po zakończeniu sesji skrypt
automatycznie dopasowuje je do projektu: `test` i `expect` pochodzą z `../support/fixtures` (czyszczenie stanu przed testem,
obiekty stron, `api`), a `page.goto('/…')` jest względne wobec `baseURL`. Co zostaje do zrobienia:

- nadaj tytuł zgodny z Planem Testów (`TC-UI-xx`) zamiast `test`,
- dodaj asercje, bo codegen nagrywa akcje, a nie oczekiwania (nagranie bez nich „przechodzi”, nawet gdy wynik jest zły),
- stan początkowy ustaw przez API (`api.seedPortScanAlert()`), a nie przez klikanie; po nagraniu z `--seed` jest to konieczne,
  bo każdy test zaczyna od pustej bazy,
- przenieś powtarzalne kroki do obiektów stron (`pages/`),
- dopóki test jest niedopracowany, oznacz go `test.fixme(...)`, żeby nie psuł `npm test` całemu zespołowi.

Codegen domyślnie generuje lokatory po roli i etykiecie (`getByRole`, `getByLabel`), które w tej aplikacji są stabilne.
Unikaj lokatorów po klasach CSS i `nth()`: ich zmiana psuje testy bez zmiany zachowania aplikacji.

## Jak dodać test

1. Opisz przypadek w Planie Testów (identyfikator `TC-UI-xx`, cel, warunki wstępne, kroki, oczekiwany wynik).
2. Dodaj test w `tests/<widok>.spec.ts`. Tytuł zaczyna się od identyfikatora:

```ts
import { expect, test } from '../support/fixtures'

test('TC-UI-07: zmiana statusu alertu zapisuje się w systemie', async ({ api, alertsPage }) => {
  const alert = await api.seedPortScanAlert()          // stan początkowy: przez API
  await alertsPage.open()

  const drawer = await alertsPage.openAlert('Skanowanie portów')   // akcja: przez UI
  await drawer.setStatus('Potwierdzony')

  await expect(drawer.statusButton('Potwierdzony')).toHaveAttribute('aria-pressed', 'true')  // sprawdzenie w UI
  expect((await api.getAlert(alert.id)).status).toBe('ACKNOWLEDGED')                         // i w API
})
```

Testy w `tests/` są **przykładami** (tytuły z `PRZYKŁAD:`). Zastąp je swoimi przypadkami albo przepisz na własne.

## Struktura

```
e2e/
  playwright.config.ts      konfiguracja: przeglądarka, język, ślady, serwery testowe
  global-setup.ts           bezpieczniki przed startem (patrz „Bezpieczeństwo”)
  tests/                    scenariusze (jeden plik na widok)
  pages/                    Page Object: DashboardPage, AlertsPage, AnalysisPage, SettingsPage
    alert-drawer.ts         Component Object: panel szczegółów alertu
  support/
    fixtures.ts             własne `test`: wstrzykuje strony i `api`, czyści stan przed każdym testem
    api-client.ts           Facade na REST API (seed, sprzątanie, weryfikacja)
    flow-builder.ts         Builder danych: portScan(), bruteForce(), ddos()
  stack/servers.ts          definicje backendu i frontendu testowego (wspólne dla testów i codegen)
  scripts/                  run_test_backend.py (API na SQLite), codegen.ts (nagrywanie)
```

## Stan początkowy testów

Przed każdym testem fixture `cleanState` kasuje wszystkie alerty i przywraca domyślną konfigurację, więc testy są od siebie
niezależne i można je uruchamiać pojedynczo (`npx playwright test tests/alerts.spec.ts -g "usunięcie"`).
Dane do testów (150 flow z `10.0.0.1` do `192.168.10.50`, port 1–150) są takie same jak w dokumencie przypadków testowych API.

## Bezpieczeństwo

`npm test` i `npm run codegen` używają **własnego** backendu na jednorazowej bazie SQLite (`e2e/.tmp/`, porty 8101 i 5180),
więc nie dotykają Postgresa ani Waszych danych. Skrypty odmawiają startu, jeśli te porty są zajęte, żeby nie podłączyć się
do cudzego serwera.

Testy można skierować na istniejącą aplikację (`E2E_BASE_URL=http://localhost:5173 npm test`), ale kasują w niej alerty
i resetują konfigurację, więc wymaga to jawnego potwierdzenia `E2E_ALLOW_DESTRUCTIVE=1`.

| Zmienna | Znaczenie |
|---|---|
| `E2E_API_PORT`, `E2E_UI_PORT` | porty backendu i frontendu testowego (8101, 5180) |
| `E2E_PYTHON` | interpreter Pythona z backendem (domyślnie `../.venv`) |
| `E2E_BASE_URL` + `E2E_ALLOW_DESTRUCTIVE=1` | test istniejącej aplikacji zamiast własnej |
| `E2E_REUSE_SERVERS=1` | użyj już działających serwerów testowych (szybsze iteracje) |

## Rozwiązywanie problemów

- **„Port … jest zajęty”**: został stary proces testowy. Znajdź go przez `lsof -i :8101` albo zmień port zmienną `E2E_API_PORT`.
- **„Nie znaleziono Pythona”**: utwórz `.venv` w katalogu głównym i zainstaluj `requirements.txt` albo ustaw `E2E_PYTHON`.
- **„Brak zależności frontendu”**: `cd ../frontend && npm install`.
- **Test nie przeszedł**: `npm run report` otwiera raport z zrzutem ekranu, wideo i śladem (Trace Viewer) krok po kroku.
- **Inne przeglądarki**: `npx playwright install firefox webkit` i odkomentuj projekty w `playwright.config.ts`.
