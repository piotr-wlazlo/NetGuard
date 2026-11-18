
import { test, expect } from '../support/fixtures'

test('TC-UI-02: wyszukiwanie alertów po adresie IP', async ({
  api,
  alertsPage,
}) => {

  await api.seedPortScanAlert()
  await api.seedBruteForceAlert()
  await alertsPage.open()

  await expect(alertsPage.rows).toHaveCount(2)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  await alertsPage.search('203.0.113.9')

  await expect(alertsPage.rows).toHaveCount(1)

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toContainText('203.0.113.9')


  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toHaveCount(0)


  const drawer = await alertsPage.openAlert('Brute force')

  await expect(drawer.root).toBeVisible()


  await drawer.close()

  await alertsPage.search('')

  await expect(alertsPage.rows).toHaveCount(2)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

})
