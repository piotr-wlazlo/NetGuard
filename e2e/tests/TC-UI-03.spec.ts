
import { test, expect } from '../support/fixtures'

test('TC-UI-03: filtrowanie alertów według statusu i typu', async ({
  api,
  alertsPage,
}) => {

  await api.seedPortScanAlert()
  const bruteForceAlert = await api.seedBruteForceAlert()

  await alertsPage.open()

  await expect(alertsPage.rows).toHaveCount(2)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  const drawer = await alertsPage.openAlert('Brute force')

  await drawer.setStatus('Rozwiązany')

  await expect(
    drawer.statusButton('Rozwiązany')
  ).toHaveAttribute('aria-pressed', 'true')

  await expect.poll(async () =>
    (await api.getAlert(bruteForceAlert.id)).status
  ).toBe('RESOLVED')


  await drawer.close()

  await alertsPage.statusFilter.selectOption('NEW')

  await expect(alertsPage.rows).toHaveCount(1)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toHaveCount(0)

  await alertsPage.typeFilter.selectOption('BRUTE_FORCE')

  await expect(
    alertsPage.noMatchesState
  ).toBeVisible()

  await expect(alertsPage.rows).toHaveCount(0)

  await alertsPage.statusFilter.selectOption('RESOLVED')

  await expect(alertsPage.rows).toHaveCount(1)

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toHaveCount(0)

  const reopenedDrawer = await alertsPage.openAlert('Brute force')

  await expect(reopenedDrawer.root).toBeVisible()

  await expect(
    reopenedDrawer.statusButton('Rozwiązany')
  ).toHaveAttribute('aria-pressed', 'true')

  await reopenedDrawer.close()

  await alertsPage.clearFiltersButton.click()

  await expect(alertsPage.rows).toHaveCount(2)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  await expect(
    alertsPage.rowWith('Brute force')
  ).toBeVisible()

  await expect(alertsPage.statusFilter).toHaveValue('ALL')
  await expect(alertsPage.typeFilter).toHaveValue('ALL')

})
