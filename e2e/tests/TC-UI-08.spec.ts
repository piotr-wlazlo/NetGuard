
import { test, expect } from '../support/fixtures'

test('TC-UI-08: walidacja niepoprawnego JSON', async ({
  page,
  api,
  analysisPage,
}) => {
  let analysisRequests = 0

  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v1/analysis/flows'
    ) {
      analysisRequests++
    }
  })

  await analysisPage.open()

  await expect(analysisPage.heading).toBeVisible()

  await analysisPage.chooseMethod('Reguły')
  await analysisPage.useCustomJson()

  await expect(analysisPage.jsonInput).toBeVisible()

  await analysisPage.jsonInput.fill('{"flows":[')

  await expect(analysisPage.jsonInput)
    .toHaveValue('{"flows":[')

  await analysisPage.run()

  await expect(analysisPage.errorNotice).toBeVisible()

  await expect(analysisPage.errorNotice)
    .toContainText('Niepoprawny JSON:')

  await expect(analysisPage.resultHeading).toHaveCount(0)

  expect(analysisRequests).toBe(0)

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(0)
})
