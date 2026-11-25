import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { BasePage } from './base-page'

export type MethodLabel = 'Reguły' | 'Statystyczna' | 'ML'
export type ScenarioLabel = 'Ruch normalny' | 'Skanowanie portów' | 'Brute force' | 'DDoS' | 'Ruch mieszany'

/** Widok „Analiza”: wybór metody i danych, uruchomienie analizy, wynik. */
export class AnalysisPage extends BasePage {
  readonly path = '/analysis'
  readonly heading: Locator
  readonly runButton: Locator
  readonly flowCountInput: Locator
  readonly jsonInput: Locator
  readonly resultHeading: Locator
  readonly createdAlerts: Locator
  readonly errorNotice: Locator
  readonly pcapInput: Locator
  readonly pcapFileName: Locator
  readonly pcapStatus: Locator

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { level: 1, name: 'Analiza ruchu' })
    this.runButton = page.getByRole('button', { name: 'Uruchom analizę' })
    // w trybie „Scenariusz testowy” jest jedno pole liczbowe: liczba flow
    this.flowCountInput = page.getByRole('spinbutton')
    this.jsonInput = page.getByRole('textbox', { name: 'Flow w formacie JSON' })
    this.resultHeading = page.getByRole('heading', { name: 'Wynik analizy' })
    this.createdAlerts = page.getByRole('heading', { name: 'Utworzone alerty' })
    this.errorNotice = page.getByRole('alert')
    // ukryte pole <input type="file"> trybu „Plik PCAP”; Playwright podstawia do niego plik bez okna wyboru
    this.pcapInput = page.getByTestId('pcap-input')
    this.pcapFileName = page.getByTestId('pcap-file')
    this.pcapStatus = page.getByTestId('pcap-status')
  }

  async chooseMethod(label: MethodLabel): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click()
  }

  async chooseScenario(label: ScenarioLabel): Promise<void> {
    // pole radio jest wizualnie ukryte wewnątrz klikalnej etykiety, więc klikamy tak jak użytkownik: w nazwę scenariusza
    await this.page.getByRole('group', { name: 'Scenariusz' }).getByText(label, { exact: true }).click()
    await expect(this.page.getByRole('radio', { name: new RegExp(`^${label}`) })).toBeChecked()
  }

  async useCustomJson(): Promise<void> {
    await this.page.getByRole('button', { name: 'Własny JSON' }).click()
  }

  async usePcapFile(): Promise<void> {
    await this.page.getByRole('button', { name: 'Plik PCAP' }).click()
  }

  async choosePcap(name: string, buffer: Buffer): Promise<void> {
    await this.pcapInput.setInputFiles({ name, mimeType: 'application/vnd.tcpdump.pcap', buffer })
  }

  /** Odnośnik do alertu utworzonego przez import PCAP. */
  alertLink(id: number): Locator {
    return this.page.getByRole('link', { name: `Alert #${id}` })
  }

  /** Etykieta z liczbą detekcji danego typu, np. „Skanowanie portów: 150”. */
  detectionsOfType(text: string): Locator {
    return this.page.locator('.chips .tag').filter({ hasText: text })
  }

  async run(): Promise<void> {
    await this.runButton.click()
  }

  /** Kafelek wyniku, np. resultTile('Detekcje'). */
  resultTile(label: string): Locator {
    return this.page.locator('.result-tiles .tile').filter({ hasText: label })
  }

  resultValue(label: string): Locator {
    return this.resultTile(label).locator('.tile-value')
  }
}
