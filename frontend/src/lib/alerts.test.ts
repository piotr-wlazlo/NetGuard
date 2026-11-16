import { describe, expect, it } from 'vitest'

import type { Alert } from '../api/types'
import {
  DEFAULT_FILTERS,
  buildOverview,
  buildTimeline,
  countBy,
  filterAlerts,
  parseApiDate,
  parseGroupKey,
  sortAlerts,
  toView,
} from './alerts'

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

describe('parseGroupKey', () => {
  it('rozbija klucz na typ, źródło i cel', () => {
    expect(parseGroupKey('PORT_SCAN|1.1.1.1|2.2.2.2')).toEqual({
      type: 'PORT_SCAN',
      source: '1.1.1.1',
      target: '2.2.2.2',
    })
  })

  it('gwiazdka oznacza atak rozproszony (brak jednego źródła)', () => {
    expect(parseGroupKey('DDOS|*|10.0.0.6')).toEqual({ type: 'DDOS', source: null, target: '10.0.0.6' })
  })

  it.each([null, undefined, '', 'manual|1', 'a|b|c|d', 'A||C'])('odrzuca niepoprawny klucz %j', (key) => {
    expect(parseGroupKey(key)).toBeNull()
  })
})

describe('parseApiDate', () => {
  it('zapis bez strefy traktuje jako UTC', () => {
    expect(parseApiDate('2026-11-16T10:00:00.123456')?.toISOString()).toBe('2026-11-16T10:00:00.123Z')
  })

  it('respektuje jawną strefę', () => {
    expect(parseApiDate('2026-11-16T11:00:00+01:00')?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
    expect(parseApiDate('2026-11-16T10:00:00Z')?.toISOString()).toBe('2026-11-16T10:00:00.000Z')
  })

  it('zwraca null dla pustej lub błędnej daty', () => {
    expect(parseApiDate(null)).toBeNull()
    expect(parseApiDate('nie-data')).toBeNull()
  })
})

describe('toView', () => {
  it('wyciąga typ, źródło, cel, liczbę flow i pewność', () => {
    const view = toView(makeAlert())
    expect(view).toMatchObject({
      type: 'PORT_SCAN',
      source: '203.0.113.7',
      target: '10.0.0.21',
      distributed: false,
      severity: 'MEDIUM',
      status: 'NEW',
      flowCount: 150,
      confidence: 0.61,
    })
  })

  it('oznacza ataki rozproszone', () => {
    const view = toView(makeAlert({ group_key: 'DDOS|*|10.0.0.6' }))
    expect(view.distributed).toBe(true)
    expect(view.source).toBeNull()
  })

  it('nie wywala się na nietypowym opisie i nieznanych wartościach', () => {
    const view = toView(
      makeAlert({ description: 'ręcznie dodany alert', priority: 'P2', status: 'WEIRD', group_key: null }),
    )
    expect(view.flowCount).toBeNull()
    expect(view.confidence).toBeNull()
    expect(view.severity).toBeNull()
    expect(view.status).toBeNull()
    expect(view.type).toBeNull()
  })
})

describe('filtrowanie i sortowanie', () => {
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
  ]

  it('filtruje po tekście (adres IP, typ)', () => {
    expect(filterAlerts(views, { ...DEFAULT_FILTERS, query: '10.0.0.6' }).map((v) => v.id)).toEqual([2])
    expect(filterAlerts(views, { ...DEFAULT_FILTERS, query: ' port_scan ' }).map((v) => v.id)).toEqual([1, 3])
  })

  it('filtr „otwarte” obejmuje NEW i ACKNOWLEDGED', () => {
    expect(filterAlerts(views, { ...DEFAULT_FILTERS, status: 'OPEN' }).map((v) => v.id)).toEqual([1, 2])
  })

  it('łączy filtry (AND)', () => {
    const result = filterAlerts(views, { ...DEFAULT_FILTERS, severity: 'HIGH', type: 'PORT_SCAN' })
    expect(result.map((v) => v.id)).toEqual([3])
  })

  it('sortuje od najnowszych, najstarszych, wg priorytetu i pewności', () => {
    expect(sortAlerts(views, 'newest').map((v) => v.id)).toEqual([2, 1, 3])
    expect(sortAlerts(views, 'oldest').map((v) => v.id)).toEqual([3, 1, 2])
    expect(sortAlerts(views, 'severity').map((v) => v.id)).toEqual([2, 3, 1])
    expect(sortAlerts(views, 'confidence').map((v) => v.id)).toEqual([2, 1, 3])
  })

  it('nie zmienia tablicy wejściowej', () => {
    const before = views.map((v) => v.id)
    sortAlerts(views, 'oldest')
    expect(views.map((v) => v.id)).toEqual(before)
  })
})

describe('buildOverview', () => {
  it('liczy wskaźniki i rankingi', () => {
    const views = [
      toView(makeAlert({ id: 1, priority: 'CRITICAL', status: 'NEW' })),
      toView(makeAlert({ id: 2, priority: 'HIGH', status: 'ACKNOWLEDGED' })),
      toView(makeAlert({ id: 3, priority: 'LOW', status: 'RESOLVED' })),
      toView(makeAlert({ id: 4, priority: 'HIGH', status: 'FALSE_POSITIVE', group_key: 'DDOS|*|10.0.0.6' })),
    ]
    const overview = buildOverview(views)

    expect(overview).toMatchObject({ total: 4, open: 2, fresh: 1, urgentOpen: 2, resolved: 1, falsePositive: 1 })
    expect(overview.byType).toEqual([
      { key: 'PORT_SCAN', count: 3 },
      { key: 'DDOS', count: 1 },
    ])
    expect(overview.bySeverity.find((s) => s.key === 'HIGH')?.count).toBe(2)
    expect(overview.topSources).toEqual([{ key: '203.0.113.7', count: 3 }])
    expect(overview.topTargets[0]).toEqual({ key: '10.0.0.21', count: 3 })
  })

  it('działa na pustej liście', () => {
    expect(buildOverview([])).toMatchObject({ total: 0, open: 0, byType: [], topSources: [] })
  })
})

describe('countBy', () => {
  it('sortuje malejąco, przy remisie alfabetycznie', () => {
    expect(countBy(['b', 'a', 'b', 'c', 'a'])).toEqual([
      { key: 'a', count: 2 },
      { key: 'b', count: 2 },
      { key: 'c', count: 1 },
    ])
  })
})

describe('buildTimeline', () => {
  const now = new Date('2026-11-16T12:00:30Z')

  it('dla pustych danych zwraca pustą oś', () => {
    expect(buildTimeline([], now).buckets).toEqual([])
  })

  it('uzupełnia oś pustymi przedziałami i nie gubi alertów', () => {
    const dates = [new Date('2026-11-16T11:59:10Z'), new Date('2026-11-16T11:59:40Z'), now]
    const timeline = buildTimeline(dates, now)

    expect(timeline.buckets.length).toBeGreaterThanOrEqual(8)
    expect(timeline.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3)
    expect(timeline.buckets.at(-1)?.count).toBe(1)
    expect(timeline.unit).toBe('minute')
  })

  it('przedziały są ciągłe i nie nachodzą na siebie', () => {
    const dates = [new Date('2026-11-15T08:00:00Z'), new Date('2026-11-16T11:00:00Z')]
    const { buckets } = buildTimeline(dates, now)
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime())
    }
  })

  it('dla zakresu kilku dni wybiera przedziały godzinowe, a nie od razu dzienne', () => {
    const dates = [new Date('2026-11-14T12:00:00Z'), now]
    const timeline = buildTimeline(dates, now)
    expect(timeline.unit).toBe('hour')
    expect(timeline.buckets.length).toBeLessThanOrEqual(24)
    expect(timeline.buckets.length).toBeGreaterThan(8)
    expect(timeline.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2)
  })

  it('dla długiego zakresu przechodzi na przedziały dzienne i ogranicza liczbę słupków', () => {
    const dates = [new Date('2026-08-01T10:00:00Z'), now]
    const timeline = buildTimeline(dates, now, 24)
    expect(timeline.unit).toBe('day')
    expect(timeline.buckets.length).toBeLessThanOrEqual(24)
  })
})

describe('metoda detekcji w opisie', () => {
  it.each([
    ['[rules] PORT_SCAN: a -> b (above threshold x1.50)', 'rules'],
    ['3 flows, [statistical] PORT_SCAN (robust z=4.68)', 'statistical'],
    ['10 flows, [ml] BRUTE_FORCE (IsolationForest score=0.71)', 'ml'],
    ['[RULES] wielkie litery', 'rules'],
    ['ręczny alert bez znacznika', null],
  ])('%s -> %s', (description, expected) => {
    expect(toView(makeAlert({ description })).method).toBe(expected)
  })
})
