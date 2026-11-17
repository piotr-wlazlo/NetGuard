import { describe, expect, it } from "vitest"

import { MAX_FLOWS, SCENARIOS, generateScenario, getScenario } from "./scenarios"
import type { ScenarioId } from "./scenarios"

const NOW = new Date('2026-11-16T12:00:00Z')
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function distinct<T>(values: T[]): number {
    return new Set(values).size
}

describe('SCENARIOS', () => {
    it('have unique ids', () => {
        expect(distinct(SCENARIOS.map((scenario) => scenario.id))).toBe(SCENARIOS.length)
    })

    it.each(SCENARIOS)('"$id" has default count within its allowed range', (scenario) => {
        expect(scenario.min).toBeGreaterThan(0)
        expect(scenario.max).toBeLessThanOrEqual(MAX_FLOWS)
        expect(scenario.defaultCount).toBeGreaterThanOrEqual(scenario.min)
        expect(scenario.defaultCount).toBeLessThanOrEqual(scenario.max)
    })

    it('limit mixed scenario so that attacks still fit in API limit', () => {
        expect(getScenario('mixed').max).toBe(MAX_FLOWS - 370)
    })
})

describe('getScenario', () => {
    it('returns scenario with given id', () => {
        expect(getScenario('ddos').label).toBe('DDoS')
    })

    it('falls back to first scenario for unknown id', () => {
        expect(getScenario('unknown' as ScenarioId)).toBe(SCENARIOS[0])
    })
})

describe('generateScenario: API constraints', () => {
    it.each(SCENARIOS.map((s) => s.id))('"%s": every flow meets FlowInput constraints', (id) => {
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
            expect(Date.parse(flow.end_time) - Date.parse(flow.start_time)).toBe(flow.duration_ms)
            expect(flow.source_type).toBe('ui')
            expect(flow.source_name).toBe('ui-scenario')

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

    it('uses documentation address range for attacker', () => {
        const flows = generateScenario('port_scan', { seed: 1, now: NOW })

        expect(flows[0].source_ip).toMatch(/^203\.0\.113\./)
    })
})

describe('generateScenario: count', () => {
    it.each(SCENARIOS.filter((s) => s.id !== 'mixed'))('"$id" uses default count when not given', (scenario) => {
        expect(generateScenario(scenario.id, { seed: 1, now: NOW })).toHaveLength(scenario.defaultCount)
    })

    it('rounds fractional count', () => {
        expect(generateScenario('port_scan', { seed: 1, count: 12.6, now: NOW })).toHaveLength(13)
    })

    it.each<[ScenarioId, number, number]>([
        ['port_scan', 1, 10],
        ['brute_force', 0, 5],
        ['ddos', 99_999, 1000],
        ['mixed', 99_999, 630],
    ])('"%s": clamps count to allowed range (%i → %i)', (id, requested, expected) => {
        const flows = generateScenario(id, { seed: 9, count: requested, now: NOW })
        const attackFlows = id === 'mixed' ? 370 : 0

        expect(flows.length - attackFlows).toBe(expected)
        expect(flows.length).toBeLessThanOrEqual(MAX_FLOWS)
    })
})

describe('generateScenario: randomness', () => {
    it('same seed gives the same data, different seed different data', () => {
        const a = generateScenario('normal', { seed: 1, now: NOW })
        const b = generateScenario('normal', { seed: 1, now: NOW })
        const c = generateScenario('normal', { seed: 2, now: NOW })

        expect(a).toEqual(b)
        expect(a).not.toEqual(c)
    })

    it('without seed picks new attacker and victim on each run', () => {
        const runs = Array.from({ length: 5 }, () => generateScenario('port_scan', { count: 10, now: NOW })[0])

        expect(distinct(runs.map((flow) => `${flow.source_ip}>${flow.destination_ip}`))).toBeGreaterThan(1)
    })

    it('places normal traffic in the minute before "now"', () => {
        const flows = generateScenario('normal', { seed: 3, now: NOW })
        const starts = flows.map((flow) => Date.parse(flow.start_time))

        expect(Math.min(...starts)).toBeGreaterThanOrEqual(NOW.getTime() - 60_000)
        expect(Math.max(...starts)).toBeLessThanOrEqual(NOW.getTime())
    })

    it('uses current time when "now" is not given', () => {
        const before = Date.now()
        const flows = generateScenario('port_scan', { seed: 1, count: 10 })
        const first = Date.parse(flows[0].start_time)

        expect(first).toBeGreaterThanOrEqual(before - 60_000)
        expect(first).toBeLessThanOrEqual(Date.now())
    })
})

describe('generateScenario: attack shapes', () => {
    it('port scan: one source and target, one port per flow, small flows', () => {
        const flows = generateScenario('port_scan', { seed: 3, count: 150, now: NOW })

        expect(flows).toHaveLength(150)
        expect(distinct(flows.map((f) => f.source_ip))).toBe(1)
        expect(distinct(flows.map((f) => f.destination_ip))).toBe(1)
        expect(flows.map((f) => f.destination_port)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1))
        expect(flows.every((f) => f.packet_count <= 3)).toBe(true)
    })

    it('brute force: one service (host:port) and many attempts from one source', () => {
        const flows = generateScenario('brute_force', { seed: 4, count: 40, now: NOW })

        expect(distinct(flows.map((f) => `${f.source_ip}>${f.destination_ip}:${f.destination_port}`))).toBe(1)
        expect([22, 3389, 21]).toContain(flows[0].destination_port)
        expect(flows.every((f) => f.packet_count > 3)).toBe(true)
    })

    it('DDoS: unique sources to one web server', () => {
        const flows = generateScenario('ddos', { seed: 5, count: 1000, now: NOW })

        expect(distinct(flows.map((f) => f.source_ip))).toBe(1000)
        expect(distinct(flows.map((f) => f.destination_ip))).toBe(1)
        expect(flows.every((f) => f.destination_port === 80 || f.destination_port === 443)).toBe(true)
    })

    it('normal traffic stays well below default detection thresholds', () => {
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

    it('mixed traffic: normal flows plus three attacks, sorted by time', () => {
        const flows = generateScenario('mixed', { seed: 8, count: 400, now: NOW })
        const times = flows.map((f) => f.start_time)

        expect(flows).toHaveLength(400 + 120 + 30 + 220)
        expect([...times].sort()).toEqual(times)
    })
})