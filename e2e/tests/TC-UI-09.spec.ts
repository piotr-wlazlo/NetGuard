
import { test, expect } from '../support/fixtures'

test('TC-UI-09: zmiana i zapis konfiguracji detekcji', async ({
  page,
  api,
  settingsPage,
}) => {
  const parameter = 'Skan portów: min. liczba portów'

  await settingsPage.open()

  await expect(settingsPage.heading).toBeVisible()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  const initialConfig = await api.getConfig()

  expect(initialConfig.parameters.common.port_scan_min_ports).toBe(100)

  await settingsPage.setValue(parameter, '50')

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('50')

  await expect(settingsPage.unsavedBar).toBeVisible()

  await expect(settingsPage.saveButton).toBeEnabled()

  await settingsPage.save()

  await expect(settingsPage.unsavedBar).toBeHidden()

  await expect.poll(async () => {
    const config = await api.getConfig()
    return config.parameters.common.port_scan_min_ports
  }).toBe(50)

  await page.reload()

  await expect(settingsPage.heading).toBeVisible()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('50')

  await expect(settingsPage.unsavedBar).toBeHidden()

  const savedConfig = await api.getConfig()

  expect(savedConfig.parameters.common.port_scan_min_ports).toBe(50)
})
