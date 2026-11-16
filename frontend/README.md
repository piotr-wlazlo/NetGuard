# NetGuard — interfejs użytkownika

Zakres: wymagania interfejsu do 7. tygodnia włącznie (dashboard, historia anomalii, szczegóły alertów,
integracja z API) oraz konfiguracja detekcji i uruchamianie analiz przez istniejące endpointy.
Vite + React 19 + TypeScript, React Router, TanStack Query. Bez bibliotek UI i wykresów:
style to własne tokeny CSS (jasny i ciemny motyw wg ustawień systemu), wykresy to HTML/CSS.

## Uruchomienie

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Backend musi pochodzić z `origin/main` (ma alerty i SQLModel). Z katalogu głównego projektu:

```bash
docker compose up -d                                         # Postgres (+ Redis)
python -c "from netguard.db import init_db; init_db()"       # tabele (API samo ich nie tworzy)
uvicorn netguard.api.main:app --port 8000
```

Serwer Vite przekierowuje `/api` i `/health` na backend (backend nie ma CORS). Gdy port 8000 jest
zajęty, uruchom API na innym i wskaż go w `frontend/.env.local`:

```bash
cp .env.example .env.local     # Vite nie czyta pliku .env.example, tylko .env i .env.local
```

| Skrypt | Działanie |
|---|---|
| `npm run dev` | serwer deweloperski z proxy do API |
| `npm run build` | sprawdzenie typów + build produkcyjny do `dist/` |
| `npm run preview` | podgląd buildu (to samo proxy) |
| `npm test` | testy jednostkowe i komponentów (Vitest, Testing Library) |
| `npm run typecheck` | sam `tsc --noEmit` |

## Widoki i wymagania, które realizują

| Widok | Co robi | Wymaganie | Endpointy |
|---|---|---|---|
| Przegląd `/` | KPI, alerty w czasie, priorytety, typy, najczęstsze źródła i cele, ostatnie alerty; odświeżanie co 10 s | tydz. 7: dashboard, bieżące statystyki, wykresy, lista alertów | `GET /api/v1/alerts` |
| Alerty `/alerts` | wyszukiwanie (IP, typ, opis), filtry (status, priorytet, typ), sortowanie, paginacja | tydz. 6: historia anomalii, wyszukiwanie, sortowanie, filtrowanie | `GET /api/v1/alerts` |
| Alert `/alerts/:id` | panel szczegółów: typ, źródło, cel, liczba flow, pewność, metoda detekcji, uzasadnienie, zmiana statusu, usuwanie | tydz. 7: szczegóły detekcji; alert z priorytetem, opisem i uzasadnieniem | `PUT /api/v1/alerts/{id}/status`, `DELETE /api/v1/alerts/{id}` |
| Analiza `/analysis` | wybór metody (reguły / statystyczna / ML), scenariusz testowy lub własny JSON, wynik z detekcjami i utworzonymi alertami | tydz. 7: integracja z API (endpoint analizy) | `POST /api/v1/analysis/flows?method=…` |
| Konfiguracja `/settings` | edycja progów z walidacją, wysyłane są tylko zmienione parametry; przywracanie domyślnych | konfiguracja parametrów detekcji (API z raportu, pkt 2.3.6) | `GET`/`PUT /api/v1/detection/config`, `POST /api/v1/detection/reset` |
| pasek boczny | status API, liczba nowych alertów | integracja z API | `GET /health` |

Poza zakresem tego etapu (celowo nie ma): import PCAP i symulator w UI (komponenty backendu z tyg. 3–4),
raporty, eksport CSV, filtr czasu, trendy, role użytkowników, miary jakości detekcji (tydz. 9), Docker.

## Wygląd

Oprawa w barwach ŁKS Łódź (czerwień, biel, czerń), tokeny w [src/styles/tokens.css](src/styles/tokens.css).

- Czerwień herbu to `#ec192e`, ale biały tekst na niej ma kontrast 4,4:1 (poniżej progu AA 4,5:1), więc elementy
  z tekstem używają `#e4152b` (4,7:1). W ciemnym motywie czerwony tekst jest jaśniejszy (`#ff5c6c`).
- Czerwień jest kolorem marki, dlatego **priorytety alertów nie są czerwone**: skala to czarny (krytyczny),
  pomarańczowy, żółty i szary (niski). Priorytet i status mają zawsze podpis tekstowy, nie tylko kolor.
- Kroje: Barlow Condensed (nagłówki, liczby) i Barlow (tekst), paczki `@fontsource/*` osadzone w buildzie,
  bez zapytań do zewnętrznych serwerów. Podzbiór `latin-ext` zawiera polskie znaki.
- Herb w pasku bocznym to `public/favicon.svg`: podmiana tego pliku zmienia też logo w aplikacji.
- Jasny i ciemny motyw wg ustawień systemu; układ mobilny z nawigacją pod czerwonym paskiem.

## Czego backend jeszcze nie ma (wpływ na UI)

- **Brak endpointów z listą detekcji, flow i statystykami ruchu.** Dlatego Przegląd liczy wszystko z alertów
  i nie ma „statystyk ruchu sieciowego” z dokumentu wizji. Liczba flow, pewność i metoda detekcji są
  odczytywane z tekstu `description` („150 flows, [rules] …, confidence high (0.91)”); gdy format się zmieni,
  UI pokaże „—”. Najprościej dodać te pola do `AlertOut`.
- **Filtrowanie i sortowanie historii robi przeglądarka** na pobranej liście: API filtruje tylko po statusie
  i zwraca wszystkie alerty naraz. Przy dużej liczbie alertów potrzebne byłyby filtry i paginacja po stronie API.
- **Import PCAP nie ma endpointu.** Skrypt `python -m netguard.main` zapisuje detekcje, ale nie tworzy alertów
  (`AlertService.generate` jest wołany tylko z `POST /analysis/flows`), więc jego wyniki nie pojawią się w UI.
  Stąd generator scenariuszy na stronie Analiza.
- **API nie tworzy tabel przy starcie** (`init_db()` jest tylko w skryptach), nie ma CORS ani uwierzytelniania.
- Backend nie pilnuje przejść statusów alertu (dowolny status → dowolny); UI pozwala na każdą zmianę.

## Struktura

```
src/
  api/        klient HTTP (ApiError, parsowanie błędów FastAPI), typy, hooki React Query
  lib/        czysta logika: alerty (parsowanie, filtry, statystyki, oś czasu), generator scenariuszy,
              walidacja JSON i parametrów, formatowanie, etykiety
  components/ układ, badge, wykresy, filtry, dialogi (natywny <dialog>), toasty, panel alertu
  pages/      Dashboard, Alerts, Analysis, Settings
  styles/     tokeny (kolory, motywy), baza i układ, komponenty
  test/       mock fetch i render całej aplikacji do testów
```

## Uwagi

- Daty z API bez strefy czasowej traktujemy jako UTC (backend zapisuje `datetime.now(timezone.utc)`).
- Scenariusze używają adresów dokumentacyjnych (203.0.113.0/24) i syntetycznych metadanych flow, nie pakietów.
  Każde uruchomienie losuje źródło i cel ataku, bo backend nie tworzy duplikatu alertu dla grupy
  `typ|źródło|cel`, która jest jeszcze otwarta.
- Metody statystyczna i ML porównują flow z resztą partii: w czystym ataku (bez ruchu tła) mediana przesuwa się
  na atak i nic się nie wyróżnia. Metoda statystyczna potrafi też zgłosić pojedyncze fałszywe alarmy na zwykłym
  ruchu. Reguły działają na sztywnych progach i nie mają tych ograniczeń.
