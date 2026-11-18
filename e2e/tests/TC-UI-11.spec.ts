
import { test, expect } from '../support/fixtures'

test('TC-UI-11: walidacja niepoprawnych parametrów konfiguracji', async ({
  page,
  api,
  settingsPage,
}) => {
  const parameter = 'Skan portów: min. liczba portów'
  let updateRequests = 0

  page.on('request', request => {
    if (
      request.method() === 'PUT' &&
      new URL(request.url()).pathname === '/api/v1/detection/config'
    ) {
      updateRequests++
    }
  })

  await settingsPage.open()

  await expect(settingsPage.heading).toBeVisible()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  const initialConfig = await api.getConfig()

  expect(
    initialConfig.parameters.common.port_scan_min_ports
  ).toBe(100)

  await settingsPage.setValue(parameter, '-1')

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('-1')

  await expect(
    settingsPage.field(parameter)
  ).toHaveAttribute('aria-invalid', 'true')

  await expect(
    page.getByText('Wartość musi być większa od zera.')
  ).toBeVisible()

  await expect(settingsPage.unsavedBar).toBeVisible()

  await expect(settingsPage.unsavedBar)
    .toContainText('Popraw błędne pola')

  await expect(settingsPage.saveButton).toBeDisabled()

  expect(updateRequests).toBe(0)

  const configAfterValidation = await api.getConfig()

  expect(
    configAfterValidation.parameters.common.port_scan_min_ports
  ).toBe(100)

  await settingsPage.discardButton.click()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  await expect(settingsPage.unsavedBar).toBeHidden()

  await page.reload()

  await expect(settingsPage.heading).toBeVisible()

  await expect(
    settingsPage.field(parameter)
  ).toHaveValue('100')

  const configAfterReload = await api.getConfig()

  expect(
    configAfterReload.parameters.common.port_scan_min_ports
  ).toBe(100)

  expect(updateRequests).toBe(0)
})
