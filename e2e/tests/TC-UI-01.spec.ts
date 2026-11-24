
import { test, expect } from '../support/fixtures'

test('TC-UI-01: zmiana statusu alertu', async ({
  page,
  api,
  alertsPage,
}) => {

  const alert = await api.seedPortScanAlert()
  expect(alert.status).toBe('NEW')
  await alertsPage.open()

  const drawer = await alertsPage.openAlert('Skanowanie portów')
  await drawer.setStatus('Potwierdzony')
  await expect(
    drawer.statusButton('Potwierdzony')
  ).toHaveAttribute('aria-pressed', 'true')

  await expect.poll(async () =>
    (await api.getAlert(alert.id)).status
  ).toBe('ACKNOWLEDGED')

  await drawer.close()
  await page.reload()

  await alertsPage.openAlert('Skanowanie portów')

  await expect(
    drawer.statusButton('Potwierdzony')
  ).toHaveAttribute('aria-pressed', 'true')

  await drawer.setStatus('Rozwiązany')

  await expect.poll(async () =>
    (await api.getAlert(alert.id)).status
  ).toBe('RESOLVED')

  await drawer.close()
  await page.reload()

  await expect(
    alertsPage.rowWith('Skanowanie portów')
  ).toContainText('Rozwiązany')
})
