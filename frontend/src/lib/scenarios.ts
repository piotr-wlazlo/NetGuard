import type { FlowInput, Protocol } from '../api/types'

/** Limit backendu: AnalysisRequest.flows ma max_length=1000. */
export const MAX_FLOWS = 1000

export type ScenarioId = 'normal' | 'port_scan' | 'brute_force' | 'ddos' | 'mixed'

export interface ScenarioInfo {
  id: ScenarioId
  label: string
  description: string
  /** Opis pola z liczbą flow dla danego scenariusza. */
  countLabel: string
  defaultCount: number
  min: number
  max: number
  /** Czego spodziewać się przy domyślnych progach detekcji. */
  expectation: string
}

// Anomalie w scenariuszu „mieszany” mają stałą liczebność, powyżej domyślnych progów
// (120 portów ≥ 100, 30 prób ≥ 20, 220 źródeł ≥ 200). Zmienna jest liczba flow normalnych.
const MIXED_PORT_SCAN = 120
const MIXED_BRUTE_FORCE = 30
const MIXED_DDOS = 220
const MIXED_ATTACK_FLOWS = MIXED_PORT_SCAN + MIXED_BRUTE_FORCE + MIXED_DDOS

export const SCENARIOS: ScenarioInfo[] = [
  {
    id: 'normal',
    label: 'Ruch normalny',
    description: 'Klienci z sieci lokalnej łączą się z kilkoma serwerami (HTTP/HTTPS, DNS, NTP, ICMP).',
    countLabel: 'Liczba flow',
    defaultCount: 300,
    min: 10,
    max: MAX_FLOWS,
    expectation: 'Reguły i ML: brak detekcji. Metoda statystyczna może zgłosić pojedyncze fałszywe alarmy.',
  },
  {
    id: 'port_scan',
    label: 'Skanowanie portów',
    description: 'Jedno źródło wysyła krótkie flow na kolejne porty jednego hosta.',
    countLabel: 'Liczba portów (flow)',
    defaultCount: 150,
    min: 10,
    max: MAX_FLOWS,
    expectation: 'Reguły: PORT_SCAN przy ≥ 100 portach (domyślny próg).',
  },
  {
    id: 'brute_force',
    label: 'Brute force',
    description: 'Jedno źródło wielokrotnie łączy się z tą samą usługą (SSH, RDP lub FTP).',
    countLabel: 'Liczba prób (flow)',
    defaultCount: 40,
    min: 5,
    max: MAX_FLOWS,
    expectation: 'Reguły: BRUTE_FORCE przy ≥ 20 próbach (domyślny próg).',
  },
  {
    id: 'ddos',
    label: 'DDoS',
    description: 'Wiele różnych źródeł jednocześnie łączy się z jednym serwerem WWW.',
    countLabel: 'Liczba źródeł (flow)',
    defaultCount: 250,
    min: 20,
    max: MAX_FLOWS,
    expectation: 'Reguły: DDOS przy ≥ 200 źródłach (domyślny próg).',
  },
  {
    id: 'mixed',
    label: 'Ruch mieszany',
    description: `Ruch normalny z wplecionymi trzema atakami: skan portów (${MIXED_PORT_SCAN} flow), brute force (${MIXED_BRUTE_FORCE}) i DDoS (${MIXED_DDOS}).`,
    countLabel: 'Liczba flow normalnych',
    defaultCount: 400,
    min: 10,
    max: MAX_FLOWS - MIXED_ATTACK_FLOWS,
    expectation:
      'Reguły wykrywają wszystkie trzy ataki. Metody statystyczna i ML oceniają flow na tle ruchu normalnego: ML może pominąć część ataków, a statystyczna dodać fałszywe alarmy.',
  },
]

export function getScenario(id: ScenarioId): ScenarioInfo {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0]
}

// ---------------------------------------------------------------------------
// Deterministyczny generator liczb losowych (seed => te same dane, wygodne w testach)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Random {
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

function createRandom(seed: number): Random {
  const next = mulberry32(seed)
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}

interface FlowSpec {
  source: string
  destination: string
  sourcePort: number | null
  destinationPort: number | null
  protocol: Protocol
  packets: number
  bytes: number
  startMs: number
  durationMs: number
}

function toFlow(spec: FlowSpec): FlowInput {
  return {
    source_ip: spec.source,
    destination_ip: spec.destination,
    source_port: spec.sourcePort,
    destination_port: spec.destinationPort,
    protocol: spec.protocol,
    packet_count: spec.packets,
    byte_count: spec.bytes,
    start_time: new Date(spec.startMs).toISOString(),
    end_time: new Date(spec.startMs + spec.durationMs).toISOString(),
    duration_ms: spec.durationMs,
    source_type: 'ui',
    source_name: 'ui-scenario',
  }
}

const SERVICES: readonly { port: number; protocol: Protocol }[] = [
  { port: 80, protocol: 'TCP' },
  { port: 443, protocol: 'TCP' },
  { port: 443, protocol: 'TCP' },
  { port: 8080, protocol: 'TCP' },
  { port: 22, protocol: 'TCP' },
  { port: 53, protocol: 'UDP' },
  { port: 123, protocol: 'UDP' },
]
const SERVERS = ['10.0.0.5', '10.0.0.6', '10.0.0.7', '8.8.8.8'] as const

function normalFlows(g: Random, count: number, baseMs: number): FlowInput[] {
  return Array.from({ length: count }, () => {
    // 120 różnych klientów: przy małej puli te same trójki (źródło, cel, port) powtarzałyby się
    // tak często, że metoda statystyczna brałaby zwykły ruch za brute force.
    const source = `192.168.1.${g.int(10, 129)}`
    const destination = g.pick(SERVERS)
    const packets = g.int(4, 60)

    if (g.int(1, 20) === 1) {
      return toFlow({
        source, destination, sourcePort: null, destinationPort: null, protocol: 'ICMP',
        packets, bytes: packets * 84, startMs: baseMs + g.int(0, 55_000), durationMs: g.int(500, 5000),
      })
    }
    const service = g.pick(SERVICES)
    return toFlow({
      source, destination,
      sourcePort: g.int(49_152, 65_535),
      destinationPort: service.port,
      protocol: service.protocol,
      packets,
      bytes: packets * g.int(60, 1400),
      startMs: baseMs + g.int(0, 55_000),
      durationMs: g.int(20, 4000),
    })
  })
}

function portScanFlows(g: Random, count: number, baseMs: number, attacker: string, victim: string): FlowInput[] {
  return Array.from({ length: count }, (_, index) => {
    const packets = g.int(1, 2)
    return toFlow({
      source: attacker, destination: victim,
      sourcePort: g.int(40_000, 60_000),
      destinationPort: index + 1,
      protocol: 'TCP',
      packets,
      bytes: packets * g.int(40, 60),
      startMs: baseMs + index * 8,
      durationMs: g.int(1, 40),
    })
  })
}

function bruteForceFlows(g: Random, count: number, baseMs: number, attacker: string, victim: string): FlowInput[] {
  const port = g.pick([22, 3389, 21])
  return Array.from({ length: count }, (_, index) => {
    const packets = g.int(6, 14)
    return toFlow({
      source: attacker, destination: victim,
      sourcePort: 40_000 + index,
      destinationPort: port,
      protocol: 'TCP',
      packets,
      bytes: packets * g.int(60, 200),
      startMs: baseMs + index * 300,
      durationMs: g.int(150, 900),
    })
  })
}

function ddosFlows(g: Random, count: number, baseMs: number, victim: string): FlowInput[] {
  return Array.from({ length: count }, (_, index) => {
    const packets = g.int(3, 6)
    return toFlow({
      // para (2. oktet, 3. oktet) jest unikalna dla każdego indeksu, więc źródła są różne
      source: `45.${33 + (index >> 8)}.${index & 255}.${g.int(1, 254)}`,
      destination: victim,
      sourcePort: g.int(1024, 65_535),
      destinationPort: g.pick([80, 443]),
      protocol: 'TCP',
      packets,
      bytes: packets * g.int(60, 500),
      startMs: baseMs + g.int(0, 20_000),
      durationMs: g.int(50, 1500),
    })
  })
}

export interface ScenarioOptions {
  count?: number
  seed?: number
  now?: Date
}

/**
 * Generuje syntetyczne flow (metadane połączeń, nie pakiety) do wysłania na POST /analysis/flows.
 * Adres atakującego i ofiary są losowane per uruchomienie, żeby kolejne uruchomienia tworzyły
 * nowe alerty (backend nie duplikuje alertów dla grupy typ|źródło|cel, która jest jeszcze otwarta).
 */
export function generateScenario(id: ScenarioId, options: ScenarioOptions = {}): FlowInput[] {
  const info = getScenario(id)
  const requested = Math.round(options.count ?? info.defaultCount)
  const count = Math.min(info.max, Math.max(info.min, requested))
  const g = createRandom(options.seed ?? Math.floor(Math.random() * 2 ** 32))
  const baseMs = (options.now ?? new Date()).getTime() - 60_000

  // 203.0.113.0/24 to zakres dokumentacyjny (TEST-NET-3), nie istnieje w prawdziwym internecie
  const attacker = () => `203.0.113.${g.int(2, 250)}`
  const victim = () => `10.0.0.${g.int(20, 250)}`

  switch (id) {
    case 'normal':
      return normalFlows(g, count, baseMs)
    case 'port_scan':
      return portScanFlows(g, count, baseMs, attacker(), victim())
    case 'brute_force':
      return bruteForceFlows(g, count, baseMs, attacker(), victim())
    case 'ddos':
      return ddosFlows(g, count, baseMs, victim())
    case 'mixed':
      return [
        ...normalFlows(g, count, baseMs),
        ...portScanFlows(g, MIXED_PORT_SCAN, baseMs, attacker(), victim()),
        ...bruteForceFlows(g, MIXED_BRUTE_FORCE, baseMs, attacker(), victim()),
        ...ddosFlows(g, MIXED_DDOS, baseMs, victim()),
      ].sort((a, b) => a.start_time.localeCompare(b.start_time))
  }
}
