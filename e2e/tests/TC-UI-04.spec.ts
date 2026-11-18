import { test, expect } from '../support/fixtures'

test('TC-UI-04: usuwanie alertu z potwierdzeniem', async ({
  api,
  alertsPage,
}) => {

  const alert = await api.seedPortScanAlert()

  await alertsPage.open()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  const drawer = await alertsPage.openAlert(
    'Skanowanie portów'
  )

  await expect(drawer.root).toBeVisible()

  await drawer.requestDelete()

  await expect(
    drawer.deleteConfirmation
  ).toBeVisible()

  await drawer.cancelDelete()

  await expect(
    drawer.deleteConfirmation
  ).not.toBeVisible()

  const alertAfterCancel = await api.getAlert(alert.id)

  expect(alertAfterCancel.id).toBe(alert.id)

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toBeVisible()

  const reopenedDrawer = await alertsPage.openAlert(
    'Skanowanie portów'
  )

  await expect(reopenedDrawer.root).toBeVisible()

  await reopenedDrawer.requestDelete()

  await expect(
    reopenedDrawer.deleteConfirmation
  ).toBeVisible()

  await reopenedDrawer.confirmDelete()
  await expect(
    reopenedDrawer.root
  ).not.toBeVisible()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toHaveCount(0)

  await expect.poll(async () => {
    const alerts = await api.listAlerts()
    return alerts.some(a => a.id === alert.id)
  }).toBe(false)

})