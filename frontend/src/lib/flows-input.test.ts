import { describe, expect, it } from "vitest"

import { parseFlowsJson } from "./flows-input"
import type { ParseResult } from "./flows-input"

const flow = {
    source_ip: '10.0.0.1',
    destination_ip: '10.0.0.2',
    source_port: 1234,
    destination_port: 80,
    protocol: 'TCP',
    packet_count: 3,
    byte_count: 300,
    start_time: '2026-11-16T10:00:00Z',
    end_time: '2026-11-16T10:00:01Z',
    duration_ms: 1000,
}

function errorsOf(result: ParseResult): string[] {
    if (result.ok) throw new Error('Expected parsing to fail, but it succeeded.')
    return result.errors
}

describe('parseFlowsJson: accepted input', () => {
    it('accepts plain array', () => {
        expect(parseFlowsJson(JSON.stringify([flow]))).toEqual({ ok: true, flows: [flow] })
    })

    it('accepts object with flows field', () => {
        expect(parseFlowsJson(JSON.stringify({ flows: [flow] }))).toEqual({ ok: true, flows: [flow] })
    })

    it('accepts flow without optional ports and extra fields', () => {
        const icmp = { ...flow, protocol: 'ICMP', source_port: null, destination_port: null, note: 'extra' }

        expect(parseFlowsJson(JSON.stringify([icmp]))).toEqual({ ok: true, flows: [icmp] })
    })

    it('accepts exactly 1000 flows', () => {
        const result = parseFlowsJson(JSON.stringify(Array.from({ length: 1000 }, () => flow)))

        expect(result.ok).toBe(true)
    })

    it('accepts zero as a value of required field', () => {
        expect(parseFlowsJson(JSON.stringify([{ ...flow, duration_ms: 0 }])).ok).toBe(true)
    })
})

describe('parseFlowsJson: rejected input', () => {
    it('rejects empty or whitespace-only text', () => {
        for (const text of ['', '   ', '\n\t']) {
            expect(errorsOf(parseFlowsJson(text))).toEqual(['Wklej JSON z listą flow albo wczytaj plik.'])
        }
    })

    it('rejects invalid JSON with parser reason', () => {
        const errors = errorsOf(parseFlowsJson('{not json'))

        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/^Niepoprawny JSON: /)
    })

    it.each(['{"a": 1}', '{"flows": "x"}', '"text"', '42', 'null'])('rejects wrong shape %s', (text) => {
        expect(errorsOf(parseFlowsJson(text))).toEqual(['Oczekiwano tablicy flow albo obiektu {"flows": [...]}.'])
    })

    it('rejects empty list', () => {
        expect(errorsOf(parseFlowsJson('[]'))).toEqual(['Lista flow jest pusta.'])
        expect(errorsOf(parseFlowsJson('{"flows": []}'))).toEqual(['Lista flow jest pusta.'])
    })

    it('rejects more than 1000 flows', () => {
        const errors = errorsOf(parseFlowsJson(JSON.stringify(Array.from({ length: 1001 }, () => flow))))

        expect(errors).toEqual(['Zbyt wiele flow: 1001. API przyjmuje maksymalnie 1000 na jedno żądanie.'])
    })
})

describe('parseFlowsJson: per-flow errors', () => {
    it('names every missing field of a flow', () => {
        const { source_ip: _ip, packet_count: _packets, ...broken } = flow

        expect(errorsOf(parseFlowsJson(JSON.stringify([flow, broken])))).toEqual([
            'flows[1]: brak pól „source_ip”, „packet_count”.',
        ])
    })

    it('treats null as missing value', () => {
        expect(errorsOf(parseFlowsJson(JSON.stringify([{ ...flow, protocol: null }])))).toEqual([
            'flows[0]: brak pól „protocol”.',
        ])
    })

    it('rejects items that are not objects', () => {
        expect(errorsOf(parseFlowsJson(JSON.stringify([flow, 'text', [1], null])))).toEqual([
            'flows[1]: oczekiwano obiektu.',
            'flows[2]: oczekiwano obiektu.',
            'flows[3]: oczekiwano obiektu.',
        ])
    })

    it('shows at most 5 errors and counts the rest', () => {
        const { source_ip: _ip, ...withoutIp } = flow
        const errors = errorsOf(parseFlowsJson(JSON.stringify(Array.from({ length: 8 }, () => withoutIp))))

        expect(errors).toHaveLength(6)
        expect(errors[0]).toBe('flows[0]: brak pól „source_ip”.')
        expect(errors[4]).toBe('flows[4]: brak pól „source_ip”.')
        expect(errors[5]).toBe('…oraz 3 kolejnych błędnych flow.')
    })

    it('counts non-object items in the summary too', () => {
        const errors = errorsOf(parseFlowsJson(JSON.stringify(Array.from({ length: 7 }, () => 1))))

        expect(errors).toHaveLength(6)
        expect(errors[5]).toBe('…oraz 2 kolejnych błędnych flow.')
    })
})