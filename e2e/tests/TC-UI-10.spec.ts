
import { test, expect } from '../support/fixtures'

test('TC-UI-10: przywracanie domyślnej konfiguracji detekcji', async ({
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

  await settingsPage.resetToDefaults()

  await expect.poll(async () => {
    const config = await api.getConfig()
    return config.parameters.common.port_scan_min_ports
  }).toBe(100)

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  await page.reload()

  await expect(settingsPage.heading).toBeVisible()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  const configAfterReload = await api.getConfig()

  expect(
    configAfterReload.parameters.common.port_scan_min_ports
  ).toBe(100)

  await expect(settingsPage.unsavedBar).toBeHidden()
})
