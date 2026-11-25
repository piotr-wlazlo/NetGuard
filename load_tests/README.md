# Testy obciążeniowe NetGuard (Locust)

Testy działają w kontenerze Locusta w tej samej sieci co system i wysyłają ruch przez nginx
(`http://frontend`), czyli tą samą drogą co przeglądarka.

## Scenariusze (typy użytkowników)

| Użytkownik | Waga | Co robi |
|---|---|---|
| `DashboardViewer` | 6 | lista alertów (jak odświeżanie Przeglądu), szczegóły alertu, konfiguracja, `/health` |
| `Analyst` | 2 | `POST /analysis/flows`: 100 i 1000 flow metodą `rules`, 1000 flow metodami `statistical` i `ml` |
| `PcapUploader` | 1 | wgrywa PCAP (2150 pakietów, w tym skan portów) i czeka na wynik; pozycja `PCAP: upload -> wynik` to czas całego importu |

Dane są generowane w locie (`traffic.py`). Każda analiza ma nowy adres atakującego, więc tworzy nowe alerty
i baza rośnie w trakcie testu, tak jak w działającym systemie.

## Uruchomienie

System musi działać: `docker compose up --build -d`.

1. Zasilenie bazy alertami (opcjonalnie, żeby lista alertów nie była pusta):
   ```bash
   docker compose --profile loadtest run --rm --entrypoint python locust seed.py --host http://frontend --alerts 2000
   ```
2. Test bez interfejsu z raportem (30 użytkowników, przyrost 5/s, 3 minuty):
   ```bash
   docker compose --profile loadtest run --rm locust --headless -u 30 -r 5 -t 3m \
     --csv results/baseline --html results/baseline.html
   ```
   Raport HTML i pliki CSV trafiają do `load_tests/results/`.
3. Albo interaktywnie z wykresami na żywo: `docker compose --profile loadtest up locust`, potem http://localhost:8089.

W trakcie testu zużycie CPU i pamięci przez kontenery: `docker stats`.

## Co porównujemy

Pomiar bazowy (`baseline`) przed optymalizacją i ten sam test po zmianach (`optimized`):
mediana i 95. percentyl czasu odpowiedzi, liczba żądań na sekundę i odsetek błędów dla każdej pozycji raportu.
