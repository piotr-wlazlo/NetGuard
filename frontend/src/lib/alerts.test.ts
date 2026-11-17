import { describe, expect, it } from "vitest"

import type { Alert } from "../api/types"
import {
    DEFAULT_FILTERS,
    asSeverity,
    asStatus,
    buildOverview,
    buildTimeline,
    countBy,
    filterAlerts,
    isFiltered,
    parseApiDate,
    parseGroupKey,
    sortAlerts,
    toView,
} from "./alerts"

function makeAlert(overrides: Partial<Alert> = {}): Alert {
    return {
        id: 1,
        detection_id: 10,
        group_key: 'PORT_SCAN|203.0.113.7|10.0.0.21',
        title: 'PORT_SCAN 203.0.113.7 → 10.0.0.21',
        description: '150 flows, [rules] PORT_SCAN: 203.0.113.7 -> 10.0.0.21 (above threshold x1.50), confidence medium (0.61)',
        priority: 'MEDIUM',
        status: 'NEW',
        created_at: '2026-11-16T10:00:00+00:00',
        ...overrides,
    }
}

function ids(views: { id: number }[]) {
    return views.map((view) => view.id)
}

describe('asSeverity and asStatus', () => {
    it('accept known values', () => {
        expect(asSeverity('CRITICAL')).toBe('CRITICAL')
        expect(asStatus('FALSE_POSITIVE')).toBe('FALSE_POSITIVE')
    })

    it('return null for unknown or missing values', () => {
        for (const value of ['critical', 'P1', '', null, undefined]) {
            expect(asSeverity(value)).toBeNull()
            expect(asStatus(value)).toBeNull()
        }
    })
})

describe('parseGroupKey', () => {
    it('splits key into type, source and target', () => {
        expect(parseGroupKey('PORT_SCAN|1.1.1.1|2.2.2.2')).toEqual({
            type: 'PORT_SCAN',
            source: '1.1.1.1',
            target: '2.2.2.2',
        })
    })

    it('treats asterisk as distributed attack without single source', () => {
        expect(parseGroupKey('DDOS|*|10.0.0.6')).toEqual({ type: 'DDOS', source: null, target: '10.0.0.6' })
    })

    it.each([null, undefined, '', 'manual|1', 'a|b|c|d', 'A||C'])('rejects invalid key %j', (key) => {
        expect(parseGroupKey(key)).toBeNull()
    })
})

describe('parseApiDate', () => {
    it('treats date without time zone as UTC', () => {
        expect(parseApiDate('2026-11-16T10:00:00.123456')?.toISOString()).toBe('2026-11-16T10:00:00.123Z')
    })

    it('respects explicit time zone in every format', () => {
        expect(parseApiDate('2026-11-16T11:00:00+01:00')?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
        expect(parseApiDate('2026-11-16T11:00:00+0100')?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
        expect(parseApiDate('2026-11-16T10:00:00Z')?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
    })

    it('returns null for missing or invalid date', () => {
        for (const value of [null, undefined, '', 'not-a-date']) {
            expect(parseApiDate(value)).toBeNull()
        }
    })
})

describe('toView', () => {
    it('extracts type, source, target, flow count and confidence', () => {
        expect(toView(makeAlert())).toMatchObject({
            id: 1,
            type: 'PORT_SCAN',
            source: '203.0.113.7',
            target: '10.0.0.21',
            distributed: false,
            severity: 'MEDIUM',
            status: 'NEW',
            flowCount: 150,
            confidence: 0.61,
            method: 'rules',
        })
    })

    it('parses creation date', () => {
        expect(toView(makeAlert()).createdAt?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
    })

    it('marks distributed attacks', () => {
        const view = toView(makeAlert({ group_key: 'DDOS|*|10.0.0.6' }))

        expect(view.distributed).toBe(true)
        expect(view.source).toBeNull()
    })

    it('does not mark alert without group key as distributed', () => {
        expect(toView(makeAlert({ group_key: null })).distributed).toBe(false)
    })

    it('handles unusual description and unknown values', () => {
        const view = toView(makeAlert({ description: 'ręcznie dodany alert', priority: 'P2', status: 'WEIRD', group_key: null }))

        expect(view.flowCount).toBeNull()
        expect(view.confidence).toBeNull()
        expect(view.severity).toBeNull()
        expect(view.status).toBeNull()
        expect(view.type).toBeNull()
        expect(view.method).toBeNull()
    })

    it('handles missing description', () => {
        const view = toView(makeAlert({ description: null }))

        expect(view.flowCount).toBeNull()
        expect(view.confidence).toBeNull()
    })

    it('builds lowercase search text from id, title, description and key, skipping nulls', () => {
        const view = toView(makeAlert({ id: 42, title: 'Big SCAN', description: null }))

        expect(view.searchText).toBe('42 big scan port_scan|203.0.113.7|10.0.0.21')
    })

    it.each([
        ['[rules] PORT_SCAN: a -> b (above threshold x1.50)', 'rules'],
        ['3 flows, [statistical] PORT_SCAN (robust z=4.68)', 'statistical'],
        ['10 flows, [ml] BRUTE_FORCE (IsolationForest score=0.71)', 'ml'],
        ['[RULES] upper case', 'rules'],
        ['manual alert without marker', null],
    ])('reads detection method from "%s" as %s', (description, expected) => {
        expect(toView(makeAlert({ description })).method).toBe(expected)
    })
})

describe('isFiltered', () => {
    it('returns false for default filters', () => {
        expect(isFiltered(DEFAULT_FILTERS)).toBe(false)
    })

    it('ignores whitespace-only query and sort order', () => {
        expect(isFiltered({ ...DEFAULT_FILTERS, query: '   ', sort: 'severity' })).toBe(false)
    })

    it('returns true when any filter is set', () => {
        expect(isFiltered({ ...DEFAULT_FILTERS, query: 'ddos' })).toBe(true)
        expect(isFiltered({ ...DEFAULT_FILTERS, status: 'OPEN' })).toBe(true)
        expect(isFiltered({ ...DEFAULT_FILTERS, severity: 'LOW' })).toBe(true)
        expect(isFiltered({ ...DEFAULT_FILTERS, type: 'DDOS' })).toBe(true)
    })
})

describe('filterAlerts', () => {
    const views = [
        toView(makeAlert({ id: 1, priority: 'LOW', status: 'NEW', created_at: '2026-11-16T10:00:00Z' })),
        toView(
            makeAlert({
                id: 2,
                group_key: 'DDOS|*|10.0.0.6',
                title: 'DDOS multiple sources → 10.0.0.6',
                description: '220 flows, x, confidence high (0.92)',
                priority: 'CRITICAL',
                status: 'ACKNOWLEDGED',
                created_at: '2026-11-16T11:00:00Z',
            }),
        ),
        toView(makeAlert({ id: 3, priority: 'HIGH', status: 'RESOLVED', created_at: '2026-11-16T09:00:00Z' })),
        toView(makeAlert({ id: 4, priority: 'HIGH', status: 'WEIRD', created_at: '2026-11-16T08:00:00Z' })),
    ]

    it('returns everything for default filters', () => {
        expect(ids(filterAlerts(views, DEFAULT_FILTERS))).toEqual([1, 2, 3, 4])
    })

    it('filters by text, ignoring case and surrounding spaces', () => {
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, query: '10.0.0.6' }))).toEqual([2])
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, query: ' port_scan ' }))).toEqual([1, 3, 4])
    })

    it('"open" status covers NEW and ACKNOWLEDGED only', () => {
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, status: 'OPEN' }))).toEqual([1, 2])
    })

    it('filters by single status', () => {
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, status: 'RESOLVED' }))).toEqual([3])
    })

    it('filters by severity and type', () => {
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, severity: 'CRITICAL' }))).toEqual([2])
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, type: 'DDOS' }))).toEqual([2])
    })

    it('combines filters with AND', () => {
        expect(ids(filterAlerts(views, { ...DEFAULT_FILTERS, severity: 'HIGH', type: 'PORT_SCAN', status: 'RESOLVED' }))).toEqual([3])
    })
})

describe('sortAlerts', () => {
    const views = [
        toView(makeAlert({ id: 1, priority: 'LOW', created_at: '2026-11-16T10:00:00Z' })),
        toView(makeAlert({ id: 2, priority: 'CRITICAL', description: 'x, confidence high (0.92)', created_at: '2026-11-16T11:00:00Z' })),
        toView(makeAlert({ id: 3, priority: 'HIGH', created_at: '2026-11-16T09:00:00Z' })),
    ]

    it('sorts by newest, oldest, severity and confidence', () => {
        expect(ids(sortAlerts(views, 'newest'))).toEqual([2, 1, 3])
        expect(ids(sortAlerts(views, 'oldest'))).toEqual([3, 1, 2])
        expect(ids(sortAlerts(views, 'severity'))).toEqual([2, 3, 1])
        expect(ids(sortAlerts(views, 'confidence'))).toEqual([2, 1, 3])
    })

    it('uses higher id as tie-breaker for equal dates', () => {
        const same = [5, 9, 7].map((id) => toView(makeAlert({ id })))

        expect(ids(sortAlerts(same, 'newest'))).toEqual([9, 7, 5])
        expect(ids(sortAlerts(same, 'oldest'))).toEqual([5, 7, 9])
    })

    it('puts alerts without date, severity or confidence last', () => {
        const mixed = [
            toView(makeAlert({ id: 1, created_at: null, priority: 'P2', description: null })),
            toView(makeAlert({ id: 2 })),
        ]

        for (const input of [mixed, [...mixed].reverse()]) {
            expect(ids(sortAlerts(input, 'newest'))).toEqual([2, 1])
            expect(ids(sortAlerts(input, 'severity'))).toEqual([2, 1])
            expect(ids(sortAlerts(input, 'confidence'))).toEqual([2, 1])
        }
    })

    it('uses newest as tie-breaker for equal severity', () => {
        const equal = [
            toView(makeAlert({ id: 1, priority: 'HIGH', created_at: '2026-11-16T09:00:00Z' })),
            toView(makeAlert({ id: 2, priority: 'HIGH', created_at: '2026-11-16T10:00:00Z' })),
        ]

        expect(ids(sortAlerts(equal, 'severity'))).toEqual([2, 1])
    })

    it('does not modify input array', () => {
        const before = ids(views)

        sortAlerts(views, 'oldest')

        expect(ids(views)).toEqual(before)
    })
})

describe('countBy', () => {
    it('sorts by count descending, then alphabetically', () => {
        expect(countBy(['b', 'a', 'b', 'c', 'a'])).toEqual([
            { key: 'a', count: 2 },
            { key: 'b', count: 2 },
            { key: 'c', count: 1 },
        ])
    })

    it('returns empty array for empty input', () => {
        expect(countBy([])).toEqual([])
    })
})

describe('buildOverview', () => {
    it('counts indicators and rankings', () => {
        const overview = buildOverview([
            toView(makeAlert({ id: 1, priority: 'CRITICAL', status: 'NEW' })),
            toView(makeAlert({ id: 2, priority: 'HIGH', status: 'ACKNOWLEDGED' })),
            toView(makeAlert({ id: 3, priority: 'LOW', status: 'RESOLVED' })),
            toView(makeAlert({ id: 4, priority: 'HIGH', status: 'FALSE_POSITIVE', group_key: 'DDOS|*|10.0.0.6' })),
        ])

        expect(overview).toMatchObject({ total: 4, open: 2, fresh: 1, urgentOpen: 2, resolved: 1, falsePositive: 1 })
        expect(overview.byType).toEqual([
            { key: 'PORT_SCAN', count: 3 },
            { key: 'DDOS', count: 1 },
        ])
        expect(overview.topSources).toEqual([{ key: '203.0.113.7', count: 3 }])
        expect(overview.topTargets[0]).toEqual({ key: '10.0.0.21', count: 3 })
    })

    it('lists every severity, also with zero count, from highest', () => {
        const overview = buildOverview([toView(makeAlert({ priority: 'HIGH' }))])

        expect(overview.bySeverity).toEqual([
            { key: 'CRITICAL', count: 0 },
            { key: 'HIGH', count: 1 },
            { key: 'MEDIUM', count: 0 },
            { key: 'LOW', count: 0 },
            { key: 'INFO', count: 0 },
        ])
    })

    it('does not count closed alerts as urgent', () => {
        const overview = buildOverview([toView(makeAlert({ priority: 'CRITICAL', status: 'RESOLVED' }))])

        expect(overview.urgentOpen).toBe(0)
    })

    it('ignores alerts with unknown status and missing group key in rankings', () => {
        const overview = buildOverview([toView(makeAlert({ status: 'WEIRD', group_key: null }))])

        expect(overview).toMatchObject({ total: 1, open: 0, byType: [], topSources: [], topTargets: [] })
    })

    it('works for empty list', () => {
        expect(buildOverview([])).toMatchObject({ total: 0, open: 0, byType: [], topSources: [] })
    })
})

describe('buildTimeline', () => {
    const now = new Date('2026-11-16T12:00:30Z')

    function total(timeline: ReturnType<typeof buildTimeline>) {
        return timeline.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
    }

    it('returns empty axis for no data', () => {
        expect(buildTimeline([], now)).toEqual({ buckets: [], unit: 'minute' })
    })

    it('pads axis with empty buckets up to the minimum', () => {
        const timeline = buildTimeline([now], now)

        expect(timeline.buckets).toHaveLength(8)
        expect(timeline.buckets.at(-1)?.count).toBe(1)
        expect(total(timeline)).toBe(1)
    })

    it('fills gaps and does not lose alerts', () => {
        const dates = [new Date('2026-11-16T11:59:10Z'), new Date('2026-11-16T11:59:40Z'), now]
        const timeline = buildTimeline(dates, now)

        expect(timeline.buckets.length).toBeGreaterThanOrEqual(8)
        expect(total(timeline)).toBe(3)
        expect(timeline.buckets.at(-1)?.count).toBe(1)
        expect(timeline.unit).toBe('minute')
    })

    it('makes continuous, non-overlapping buckets', () => {
        const { buckets } = buildTimeline([new Date('2026-11-15T08:00:00Z'), new Date('2026-11-16T11:00:00Z')], now)

        for (let i = 1; i < buckets.length; i += 1) {
            expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime())
        }
    })

    it('chooses hourly buckets for a range of a few days', () => {
        const timeline = buildTimeline([new Date('2026-11-14T12:00:00Z'), now], now)

        expect(timeline.unit).toBe('hour')
        expect(timeline.buckets.length).toBeLessThanOrEqual(24)
        expect(timeline.buckets.length).toBeGreaterThan(8)
        expect(total(timeline)).toBe(2)
    })

    it('switches to daily buckets for long range and limits their number', () => {
        const timeline = buildTimeline([new Date('2026-08-01T10:00:00Z'), now], now, 24)

        expect(timeline.unit).toBe('day')
        expect(timeline.buckets.length).toBeLessThanOrEqual(24)
    })

    it('drops oldest alerts that do not fit on the axis', () => {
        const timeline = buildTimeline([new Date('2026-08-01T10:00:00Z'), now], now, 24)

        expect(total(timeline)).toBe(1)
    })

    it('pads daily axis with whole previous days', () => {
        const timeline = buildTimeline([new Date('2026-11-04T12:00:00Z'), now], now, 24, 20)
        const { buckets } = timeline

        expect(timeline.unit).toBe('day')
        expect(buckets).toHaveLength(20)
        for (const bucket of buckets) {
            expect(bucket.start.getHours()).toBe(0)
            expect(bucket.start.getMinutes()).toBe(0)
        }
        for (let i = 1; i < buckets.length; i += 1) {
            expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime())
        }
        expect(total(timeline)).toBe(2)
    })

    it('respects custom bucket limits', () => {
        const timeline = buildTimeline([new Date('2026-11-16T11:00:00Z'), now], now, 6, 4)

        expect(timeline.buckets.length).toBeLessThanOrEqual(6)
        expect(timeline.buckets.length).toBeGreaterThanOrEqual(4)
        expect(total(timeline)).toBe(2)
    })
})