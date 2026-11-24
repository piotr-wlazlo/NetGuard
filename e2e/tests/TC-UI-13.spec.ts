import { test, expect } from '../support/fixtures'
import { portScanPcap } from '../support/pcap-builder'

// Wymaga działającego Redisa na localhost:6379 (np. docker compose up -d redis): import PCAP idzie przez strumień Redis.
test('TC-UI-13: import pliku PCAP ze skanowaniem portów', async ({
  api,
  analysisPage,
  alertsPage,
}) => {
  await analysisPage.open()

  await expect(analysisPage.heading).toBeVisible()

  await analysisPage.chooseMethod('Reguły')
  await analysisPage.usePcapFile()

  // plik PCAP budowany w teście: 150 pakietów SYN z 10.66.0.1 na kolejne porty 192.168.50.10
  await analysisPage.choosePcap('scan.pcap', portScanPcap())

  await expect(analysisPage.pcapFileName).toContainText('scan.pcap')

  await analysisPage.run()

  await expect(analysisPage.pcapStatus).toContainText('Zakończono', { timeout: 30_000 })

  await expect(analysisPage.resultValue('Pakiety')).toHaveText('150')
  await expect(analysisPage.resultValue('Nowe alerty')).toHaveText('1')
  await expect(analysisPage.detectionsOfType('Skanowanie portów: 150')).toBeVisible()

  const alerts = await api.listAlerts()

  expect(alerts).toHaveLength(1)
  expect(alerts[0].group_key).toBe('PORT_SCAN|10.66.0.1|192.168.50.10')

  await analysisPage.alertLink(alerts[0].id).click()

  const drawer = alertsPage.drawer

  await expect(drawer.root).toBeVisible()
  await expect(drawer.detail('Typ anomalii')).toContainText('Skanowanie portów')
})
