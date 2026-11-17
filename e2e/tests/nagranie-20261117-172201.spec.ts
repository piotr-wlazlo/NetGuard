import { test, expect } from '@playwright/test';

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
  await page.goto('http://127.0.0.1:5180/');
  await page.getByRole('link', { name: 'Alerty' }).click();
  await page.getByRole('link', { name: 'Przejdź do analizy' }).click();
  await page.getByRole('button', { name: 'Własny JSON' }).click();
  await page.getByRole('button', { name: 'Uruchom analizę' }).click();
  await page.getByRole('button', { name: 'Scenariusz testowy' }).click();
  await page.getByText('Skanowanie portów').click();
  await page.getByRole('radio', { name: 'Skanowanie portów Jedno źródł' }).check();
  await page.getByRole('button', { name: 'Uruchom analizę' }).click();
  await page.getByRole('button', { name: 'Pokaż wszystkie' }).click();
});