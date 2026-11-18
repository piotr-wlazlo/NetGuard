
import { test, expect } from '../support/fixtures'

test('TC-UI-05: wykrywanie skanowania portów', async ({
  api,
  analysisPage,
  alertsPage,
}) => {
  await analysisPage.open()

  await expect(analysisPage.heading).toBeVisible()

  await analysisPage.chooseMethod('Reguły')
  await analysisPage.chooseScenario('Skanowanie portów')

  await analysisPage.flowCountInput.fill('150')

  await expect(
    analysisPage.flowCountInput
  ).toHaveValue('150')

  await analysisPage.run()

  await expect(analysisPage.resultHeading).toBeVisible()

  await expect(
    analysisPage.resultValue('Wysłane flow')
  ).toHaveText('150')

  await expect.poll(async () => {
    const value = await analysisPage.resultValue('Detekcje').innerText()
    return Number(value)
  }).toBeGreaterThan(0)

  await expect(
    analysisPage.resultValue('Nowe alerty')
  ).toHaveText('1')

  await expect(analysisPage.createdAlerts).toBeVisible()

  await alertsPage.open()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(alertsPage.rows).toHaveCount(1)

  const drawer = await alertsPage.openAlert('Skanowanie portów')

  await expect(drawer.root).toBeVisible()

  await expect(
    drawer.statusButton('Nowy')
  ).toHaveAttribute('aria-pressed', 'true')

  await expect(
    drawer.detail('Typ anomalii')
  ).toContainText('Skanowanie portów')

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(1)
  expect(alerts[0].group_key).toMatch(/^PORT_SCAN\|/)
  expect(alerts[0].status).toBe('NEW')
})
