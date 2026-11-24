import { describe, expect, it } from "vitest"

import {
    formatDateTime,
    formatNumber,
    formatPercent,
    formatRelative,
    formatTime,
    methodLabel,
    plural,
    typeLabel,
} from "./format"

describe('plural', () => {
    const result = (n: number) => plural(n, 'alert', 'alerty', 'alertów')

    it('returns singular form for 1', () =>{
        expect(result(1)).toBe('alert')
    })

    it('retursn few form for numbers ending in 2-4', () => {
        for (const n of [2, 3, 4, 62, 74]) {
            expect(result(n)).toBe('alerty')
        }
    })

    it('returns many form for 12–14', () => {
        for (const n of [12, 13, 14, 112, 114]) {
            expect(result(n)).toBe('alertów')
        }
    })

    it('returns many form for numbers {0, 1}u[5, 9]', () => {
        for (const n of [0, 5, 11, 21, 37, 67, 100]) {
            expect(result(n)).toBe('alertów')
        }
    })
})

describe('typeLabel', () => {
    it('returns polish label for known type', () => {
        expect(typeLabel('PORT_SCAN')).toBe('Skanowanie portów')
        expect(typeLabel('BRUTE_FORCE')).toBe('Brute force')
        expect(typeLabel('DDOS')).toBe('DDoS')
    })

    it('returns unknown type unchanged', () => {
        expect(typeLabel('SQL_INJECTION')).toBe('SQL_INJECTION')
    })

    it('returns dash for missing value', () => {
        for (const value of [null, undefined, '']) {
            expect(typeLabel(value)).toBe('—')
        }
    })
})

describe('methodLabel', () => {
    it('returns polish label for known method', () => {
        expect(methodLabel('rules')).toBe('Reguły')
        expect(methodLabel('statistical')).toBe('Statystyczna')
        expect(methodLabel('ml')).toBe('ML (Isolation Forest)')
    })

    it('returns unknown method unchanged', () => {
        expect(methodLabel('custom')).toBe('custom')
    })

    it('returns dash for missing value', () => {
        for (const value of [null, undefined, '']) {
            expect(methodLabel(value)).toBe('—')
        }
    })
})

describe('formatNumber', () => {
    it('does not group 4-digit numbers (polish rule)', () => {
        expect(formatNumber(1234)).toBe('1234')
    })

    it('groups thousands with non-breaking space from 5 digits', () => {
        expect(formatNumber(12345)).toBe('12\u00A0345')
        expect(formatNumber(1234567)).toBe('1\u00A0234\u00A0567')
    })

    it('returns small numbers unchanged', () => {
        expect(formatNumber(0)).toBe('0')
        expect(formatNumber(999)).toBe('999')
    })
})

describe('formatPercent', () => {
    it('converts fraction to rounded percent', () => {
        expect(formatPercent(0)).toBe('0%')
        expect(formatPercent(0.5)).toBe('50%')
        expect(formatPercent(0.615)).toBe('62%')
        expect(formatPercent(1)).toBe('100%')
    })
})

describe('formatDateTime and formatTime', () => {
    const date = new Date(2026, 10, 16, 14, 5, 9)

    it('formats date with time', () => {
        expect(formatDateTime(date)).toBe('16.11.2026, 14:05:09')
    })

    it('returns dash for missing date', () => {
        expect(formatDateTime(null)).toBe('—')
    })

    it('formats time only', () => {
        expect(formatTime(date)).toBe('14:05:09')
    })
})

describe('formatRelative', () => {
    const now = new Date('2026-11-16T12:00:00Z')
    const shifted = (seconds: number) => new Date(now.getTime() + seconds * 1000)

    it('returns dash for missing date', () => {
        expect(formatRelative(null, now)).toBe('—')
    })

    it('returns "przed chwilą" below 45 seconds in both directions', () => {
        expect(formatRelative(shifted(-44), now)).toBe('przed chwilą')
        expect(formatRelative(shifted(30), now)).toBe('przed chwilą')
    })

    it('switches to minutes at 45 seconds', () => {
        expect(formatRelative(shifted(-45), now)).toBe('1 minutę temu')
        expect(formatRelative(shifted(-5 * 60), now)).toBe('5 minut temu')
    })

    it('switches to hours at 1 hour', () => {
        expect(formatRelative(shifted(-3600), now)).toBe('1 godzinę temu')
        expect(formatRelative(shifted(-2 * 3600), now)).toBe('2 godziny temu')
    })

    it('switches to days at 24 hours', () => {
        expect(formatRelative(shifted(-86400), now)).toBe('wczoraj')
        expect(formatRelative(shifted(-5 * 86400), now)).toBe('5 dni temu')
    })

    it('describes future dates', () => {
        expect(formatRelative(shifted(3 * 86400), now)).toBe('za 3 dni')
    })
})