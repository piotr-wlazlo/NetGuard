import { describe, expect, it } from 'vitest'

import { MAX_FLOWS, SCENARIOS, generateScenario } from './scenarios'
import type { ScenarioId } from './scenarios'

const NOW = new Date('2026-11-16T12:00:00Z')
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function distinct<T>(values: T[]): number {
  return new Set(values).size
}

describe('generateScenario', () => {
  it.each(SCENARIOS.map((s) => s.id))('„%s”: każde flow spełnia ograniczenia FlowInput z API', (id) => {
    const flows = generateScenario(id, { seed: 7, now: NOW })

    expect(flows.length).toBeGreaterThan(0)
    expect(flows.length).toBeLessThanOrEqual(MAX_FLOWS)
    for (const flow of flows) {
      for (const ip of [flow.source_ip, flow.destination_ip]) {
        const match = IPV4.exec(ip)
        expect(match, ip).not.toBeNull()
        expect(match!.slice(1).every((octet) => Number(octet) <= 255), ip).toBe(true)
      }
      expect(flow.packet_count).toBeGreaterThanOrEqual(1)
      expect(flow.byte_count).toBeGreaterThanOrEqual(1)
      expect(flow.duration_ms).toBeGreaterThanOrEqual(0)
      expect(Date.parse(flow.end_time)).toBeGreaterThanOrEqual(Date.parse(flow.start_time))

      if (flow.protocol === 'ICMP') {
        expect(flow.source_port).toBeNull()
        expect(flow.destination_port).toBeNull()
      } else {
        for (const port of [flow.source_port, flow.destination_port]) {
          expect(port).not.toBeNull()
          expect(port!).toBeGreaterThanOrEqual(0)
          expect(port!).toBeLessThanOrEqual(65_535)
        }
      }
    }
  })

  it('ten sam seed daje te same dane, inny seed — inne', () => {
    const a = generateScenario('normal', { seed: 1, now: NOW })
    const b = generateScenario('normal', { seed: 1, now: NOW })
    const c = generateScenario('normal', { seed: 2, now: NOW })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('skan portów: jedno źródło i cel, tyle różnych portów ile flow, flow „małe”', () => {
    const flows = generateScenario('port_scan', { seed: 3, count: 150, now: NOW })
    expect(flows).toHaveLength(150)
    expect(distinct(flows.map((f) => f.source_ip))).toBe(1)
    expect(distinct(flows.map((f) => f.destination_ip))).toBe(1)
    expect(distinct(flows.map((f) => f.destination_port))).toBe(150)
    expect(flows.every((f) => f.packet_count <= 3)).toBe(true)
  })

  it('brute force: jedna usługa (host:port) i wiele prób z jednego źródła', () => {
    const flows = generateScenario('brute_force', { seed: 4, count: 40, now: NOW })
    expect(distinct(flows.map((f) => `${f.source_ip}>${f.destination_ip}:${f.destination_port}`))).toBe(1)
    expect(flows.every((f) => f.packet_count > 3)).toBe(true)
  })

  it('DDoS: unikalne źródła do jednego celu', () => {
    const flows = generateScenario('ddos', { seed: 5, count: 250, now: NOW })
    expect(distinct(flows.map((f) => f.source_ip))).toBe(250)
    expect(distinct(flows.map((f) => f.destination_ip))).toBe(1)
  })

  it('ruch normalny nie zbliża się do domyślnych progów detekcji', () => {
    const flows = generateScenario('normal', { seed: 6, count: 1000, now: NOW })
    const sourcesPerTarget = new Map<string, Set<string>>()
    const attempts = new Map<string, number>()
    for (const f of flows) {
      sourcesPerTarget.set(f.destination_ip, (sourcesPerTarget.get(f.destination_ip) ?? new Set()).add(f.source_ip))
      const key = `${f.source_ip}>${f.destination_ip}:${f.destination_port}`
      attempts.set(key, (attempts.get(key) ?? 0) + 1)
    }
    expect(Math.max(...[...sourcesPerTarget.values()].map((s) => s.size))).toBeLessThan(200)
    expect(Math.max(...attempts.values())).toBeLessThan(20)
    expect(flows.every((f) => f.packet_count > 3)).toBe(true)
  })

  it('ruch mieszany: normalne + trzy ataki i mieści się w limicie API', () => {
    const flows = generateScenario('mixed', { seed: 8, count: 400, now: NOW })
    expect(flows).toHaveLength(400 + 120 + 30 + 220)
    const times = flows.map((f) => f.start_time)
    expect([...times].sort()).toEqual(times)
  })

  it.each<[ScenarioId, number, number]>([
    ['port_scan', 1, 10],
    ['ddos', 99_999, 1000],
    ['mixed', 99_999, 630],
  ])('„%s”: liczba flow jest przycinana do zakresu (%i → %i)', (id, requested, expected) => {
    const flows = generateScenario(id, { seed: 9, count: requested, now: NOW })
    const attackFlows = id === 'mixed' ? 370 : 0
    expect(flows.length - attackFlows).toBe(expected)
    expect(flows.length).toBeLessThanOrEqual(MAX_FLOWS)
  })
})
