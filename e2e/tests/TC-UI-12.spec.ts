
import { test, expect } from '../support/fixtures'

test('TC-UI-12: aktualizacja statystyk Dashboardu', async ({
  page,
  api,
  dashboard,
  alertsPage,
}) => {
  await dashboard.open()

  await expect(dashboard.heading).toBeVisible()

  await expect(dashboard.emptyState).toBeVisible()

  expect(await api.listAlerts()).toHaveLength(0)

  const alert = await api.seedPortScanAlert()

  expect(alert.status).toBe('NEW')

  await page.getByRole('button', {
    name: 'Odśwież'
  }).click()

  await expect(dashboard.emptyState).not.toBeVisible()

  await expect(
    dashboard.tileValue('Wszystkie alerty')
  ).toHaveText('1')

  await expect(
    dashboard.tileValue('Otwarte alerty')
  ).toHaveText('1')

  await expect(
    dashboard.recentAlerts
  ).toContainText(['Skanowanie portów'])

  await alertsPage.open()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  const drawer = await alertsPage.openAlert(
    'Skanowanie portów'
  )

  await drawer.setStatus('Rozwiązany')

  await expect(
    drawer.statusButton('Rozwiązany')
  ).toHaveAttribute('aria-pressed', 'true')

  await expect.poll(async () => {
    const savedAlert = await api.getAlert(alert.id)
    return savedAlert.status
  }).toBe('RESOLVED')

  await drawer.close()

  await dashboard.open()

  await page.getByRole('button', {
    name: 'Odśwież'
  }).click()

  await expect(
    dashboard.tileValue('Wszystkie alerty')
  ).toHaveText('1')

  await expect(
    dashboard.tileValue('Otwarte alerty')
  ).toHaveText('0')

  await expect(
    dashboard.tile('Wszystkie alerty')
  ).toContainText('1 rozwiązanych')

  await expect(
    dashboard.recentAlerts
  ).toContainText(['Skanowanie portów'])

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(1)
  expect(alerts[0].status).toBe('RESOLVED')
})
