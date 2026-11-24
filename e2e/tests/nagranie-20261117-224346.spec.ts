// Nagranie z codegen. Zanim je zacommitujesz:
//  - nadaj tytuł zgodny z Planem Testów (TC-UI-xx) i dodaj asercje (expect), bo samo nagranie niczego nie sprawdza,
//  - przenieś powtarzalne kroki do obiektów stron (pages/),
//  - dopóki test jest niedopracowany, oznacz go jako test.fixme(...), żeby nie psuł `npm test` całemu zespołowi.

import { test, expect } from '../support/fixtures';

test.use({
  colorScheme: 'light',
  locale: 'pl-PL',
  timezoneId: 'Europe/Warsaw',
  viewport: {
    height: 900,
    width: 1440
  }
});

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Przejdź do analizy' }).click();
  await page.getByText('Źródło danych').click();
  await page.getByRole('button', { name: 'Własny JSON' }).click();
  await page.getByRole('button', { name: 'Statystyczna' }).click();
  await page.getByRole('group', { name: 'Metoda detekcji' }).click();
  await page.locator('form').click();
  await page.getByRole('button', { name: 'Scenariusz testowy' }).click();
  await page.getByRole('link', { name: 'Konfiguracja' }).click();
  await page.getByText('Rozmiar partii (batch)').click();
  await page.getByRole('textbox', { name: 'Rozmiar partii (batch)' }).click();
  await page.getByRole('textbox', { name: 'Rozmiar partii (batch)' }).click();
  await page.getByRole('textbox', { name: 'Maks. liczba pakietów „małego' }).click();
  await page.getByRole('textbox', { name: 'Skan portów: min. liczba port' }).click();
  await page.getByText('Maks. liczba pakietów „małego” flowDo wykrywania skanowania portów liczą się').click();
  await page.getByRole('textbox', { name: 'Skan portów: min. liczba port' }).click();
  await page.getByRole('textbox', { name: 'DDoS: min. liczba źródeł' }).dblclick();
  await page.getByRole('button', { name: 'Przywróć domyślne' }).click();
  await page.getByRole('button', { name: 'Przywróć', exact: true }).click();
  await page.locator('div').filter({ hasText: 'Metoda statystycznaRobust z-' }).nth(3).click();
  await page.getByText('Dolna granica MADZabezpiecza').click();
  await page.getByText('Min. liczba flow w partii').click();
  await page.locator('div').nth(3).click();
  await page.getByRole('link', { name: 'Analiza' }).click();
  await page.getByText('Skanowanie portów').click();
  await page.getByRole('radio', { name: 'Skanowanie portów Jedno źródł' }).check();
  await page.locator('.state-icon').click();
  await page.getByText('Import plików PCAP. Backend').click();
  await page.getByText('Jedno źródło wielokrotnie łą').click();
  await page.getByRole('radio', { name: 'Brute force Jedno źródło' }).check();
  await page.getByText('Wyniki pojawią się tutajWybierz metodę i dane, a następnie uruchom analizę.').click();
  await page.getByText('Wyniki pojawią się tutajWybierz metodę i dane, a następnie uruchom analizę.').click();
  await page.getByText('Klienci z sieci lokalnej łącz').click();
  await page.getByRole('radio', { name: 'Ruch normalny Klienci z sieci' }).check();
  await page.getByText('Wyniki pojawią się tutajWybierz metodę i dane, a następnie uruchom analizę.').click();
  await page.getByText('Wyniki pojawią się tutajWybierz metodę i dane, a następnie uruchom analizę.').click();
  await page.getByText('DDoS', { exact: true }).click();
  await page.getByRole('radio', { name: 'DDoS Wiele różnych źródeł' }).check();
  await page.getByText('Wyniki pojawią się tutajWybierz metodę i dane, a następnie uruchom analizę.').click();
});