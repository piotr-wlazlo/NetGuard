
import { test, expect } from '../support/fixtures'

test('TC-UI-07: wykrywanie ataku DDoS', async ({
  api,
  analysisPage,
  alertsPage,
}) => {
  await analysisPage.open()

  await expect(analysisPage.heading).toBeVisible()

  await analysisPage.chooseMethod('Reguły')
  await analysisPage.chooseScenario('DDoS')

  await analysisPage.flowCountInput.fill('250')

  await expect(analysisPage.flowCountInput).toHaveValue('250')

  await analysisPage.run()

  await expect(analysisPage.resultHeading).toBeVisible()

  await expect(
    analysisPage.resultValue('Wysłane flow')
  ).toHaveText('250')

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
    alertsPage.rowWith('DDoS')
  ).toBeVisible()

  await expect(alertsPage.rows).toHaveCount(1)

  const drawer = await alertsPage.openAlert('DDoS')

  await expect(drawer.root).toBeVisible()

  await expect(
    drawer.statusButton('Nowy')
  ).toHaveAttribute('aria-pressed', 'true')

  await expect(
    drawer.detail('Źródło')
  ).toHaveText('Wiele źródeł (atak rozproszony)')

  await expect(
    drawer.detail('Cel')
  ).toContainText('10.0.0.')

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(1)
  expect(alerts[0].group_key).toMatch(/^DDOS\|\*\|/)
  expect(alerts[0].status).toBe('NEW')
})
