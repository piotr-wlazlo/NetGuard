import { describe, expect, it } from "vitest"

import { paramMeta, paramOrder, sectionOrder, toNumber, validateParam } from "./config-meta"

describe('sectionOrder', () => {
    it('returns known sections in fixed order', () => {
        expect(sectionOrder(['ml', 'common', 'statistical'])).toEqual(['common', 'statistical', 'ml'])
    })

    it('puts unknown sections at the end, sorted alphabetically', () => {
        expect(sectionOrder(['zeta', 'ml', 'alpha', 'common'])).toEqual(['common', 'ml', 'alpha', 'zeta'])
    })

    it('skips known sections missing from input', () => {
        expect(sectionOrder(['ml'])).toEqual(['ml'])
    })

    it('returns empty array for empty input', () => {
        expect(sectionOrder([])).toEqual([])
    })
})

describe('paramOrder', () => {
    it('returns known params in PARAM_META order', () => {
        expect(paramOrder(['z_threshold', 'ddos_min_sources', 'batch_size'])).toEqual([
            'batch_size',
            'ddos_min_sources',
            'z_threshold',
        ])
    })

    it('puts unknown params at the end, sorted alphabetically', () => {
        expect(paramOrder(['unknown_b', 'batch_size', 'unknown_a'])).toEqual([
            'batch_size',
            'unknown_a',
            'unknown_b',
        ])
    })

    it('does not modify input array', () => {
        const input = ['z_threshold', 'batch_size']

        paramOrder(input)

        expect(input).toEqual(['z_threshold', 'batch_size'])
    })
})

describe('paramMeta', () => {
    it('returns metadata for known param', () => {
        const meta = paramMeta('port_scan_min_ports')

        expect(meta.label).toBe('Skan portów: min. liczba portów')
        expect(meta.integer).toBe(true)
    })

    it('returns param name as label for unknown param', () => {
        expect(paramMeta('new_knob')).toEqual({ label: 'new_knob', hint: '' })
    })
})

describe('toNumber', () => {
    it('parses dot and comma as decimal separator', () => {
        expect(toNumber('3.5')).toBe(3.5)
        expect(toNumber('3,5')).toBe(3.5)
    })

    it('ignores surrounding whitespace', () => {
        expect(toNumber('  100 ')).toBe(100)
    })

    it('returns NaN for non-numeric text', () => {
        expect(toNumber('abc')).toBeNaN()
    })
})

describe('validateParam', () => {
    it('accepts valid values, also with decimal comma', () => {
        expect(validateParam('z_threshold', '3,5')).toBeNull()
        expect(validateParam('z_threshold', '3.25')).toBeNull()
        expect(validateParam('batch_size', '5000')).toBeNull()
    })

    it('rejects empty value', () => {
        expect(validateParam('z_threshold', '')).toBe('Podaj wartość.')
        expect(validateParam('z_threshold', '   ')).toBe('Podaj wartość.')
    })

    it('rejects text that is not a number', () => {
        expect(validateParam('z_threshold', 'abc')).toBe('To nie jest liczba.')
    })

    it('rejects zero and negative values, like backend', () => {
        expect(validateParam('z_threshold', '0')).toBe('Wartość musi być większa od zera.')
        expect(validateParam('z_threshold', '-1')).toBe('Wartość musi być większa od zera.')
    })

    it('requires integer for counter params', () => {
        expect(validateParam('port_scan_min_ports', '100.5')).toBe('Wymagana liczba całkowita.')
        expect(validateParam('port_scan_min_ports', '100')).toBeNull()
    })

    it('enforces upper limit of ML threshold', () => {
        expect(validateParam('ml_score_threshold', '1')).toBe('Maksymalna wartość to 0.99.')
        expect(validateParam('ml_score_threshold', '0.99')).toBeNull()
    })

    it('treats unknown param as any positive number', () => {
        expect(validateParam('future_param', '2.5')).toBeNull()
    })
})