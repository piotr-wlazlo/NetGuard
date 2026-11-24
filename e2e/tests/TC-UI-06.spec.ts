
import { test, expect } from '../support/fixtures'

test('TC-UI-06: wykrywanie ataku Brute Force', async ({
  api,
  analysisPage,
  alertsPage,
}) => {
  await analysisPage.open()

  await expect(analysisPage.heading).toBeVisible()

  await analysisPage.chooseMethod('Reguły')
  await analysisPage.chooseScenario('Brute force')

  await analysisPage.flowCountInput.fill('40')

  await expect(analysisPage.flowCountInput).toHaveValue('40')

  await analysisPage.run()

  await expect(analysisPage.resultHeading).toBeVisible()

  await expect(
    analysisPage.resultValue('Wysłane flow')
  ).toHaveText('40')

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
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  await expect(alertsPage.rows).toHaveCount(1)

  const drawer = await alertsPage.openAlert('Brute force')

  await expect(drawer.root).toBeVisible()

  await expect(
    drawer.statusButton('Nowy')
  ).toHaveAttribute('aria-pressed', 'true')

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(1)
  expect(alerts[0].group_key).toMatch(/^BRUTE_FORCE\|/)
  expect(alerts[0].status).toBe('NEW')
})
