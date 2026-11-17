export type Protocol = 'TCP' | 'UDP' | 'ICMP'

/** Jedno flow w formacie przyjmowanym przez POST /api/v1/analysis/flows. */
export interface FlowPayload {
  source_ip: string
  destination_ip: string
  source_port: number | null
  destination_port: number | null
  protocol: Protocol
  packet_count: number
  byte_count: number
  start_time: string
  end_time: string
  duration_ms: number
  source_type?: string
  source_name?: string
}

/**
 * Wzorzec Budowniczy (Builder): ustawiasz źródło i cel, a metoda końcowa generuje gotowy ruch.
 *
 *   new FlowBuilder().from('10.0.0.1').to('192.168.10.50').portScan(150)
 *
 * Domyślne wartości odpowiadają danym z dokumentu „Przypadki testowe REST API” (rozdz. 2.2):
 * 150 przepływów TCP z 10.0.0.1 do 192.168.10.50, każdy na inny port, co 10 ms.
 * Przy domyślnych progach (skan portów ≥ 100, brute force ≥ 20, DDoS ≥ 200) taki ruch daje alert.
 */
export class FlowBuilder {
  private source = '10.0.0.1'
  private destination = '192.168.10.50'
  private startMs = Date.now() - 60_000

  from(ip: string): this {
    this.source = ip
    return this
  }

  to(ip: string): this {
    this.destination = ip
    return this
  }

  /** Początek ruchu; domyślnie minutę temu. */
  startingAt(date: Date): this {
    this.startMs = date.getTime()
    return this
  }

  /** Skanowanie portów: po jednym krótkim flow na każdy port 1..count. */
  portScan(count = 150): FlowPayload[] {
    return Array.from({ length: count }, (_, index) =>
      this.flow({
        index,
        sourceIp: this.source,
        destinationPort: index + 1,
        sourcePort: 40_000 + index,
        packets: 1,
        bytes: 60,
      }),
    )
  }

  /** Brute force: wiele połączeń z jednego źródła do tej samej usługi (host:port). */
  bruteForce(attempts = 40, port = 22): FlowPayload[] {
    return Array.from({ length: attempts }, (_, index) =>
      this.flow({
        index,
        sourceIp: this.source,
        destinationPort: port,
        sourcePort: 40_000 + index,
        packets: 8,
        bytes: 900,
      }),
    )
  }

  /** DDoS: wiele różnych źródeł łączy się z jednym hostem. */
  ddos(sources = 250, port = 80): FlowPayload[] {
    return Array.from({ length: sources }, (_, index) =>
      this.flow({
        index,
        sourceIp: `172.16.${Math.floor(index / 250)}.${(index % 250) + 1}`,
        destinationPort: port,
        sourcePort: 50_000,
        packets: 4,
        bytes: 400,
      }),
    )
  }

  private flow(spec: {
    index: number
    sourceIp: string
    sourcePort: number
    destinationPort: number
    packets: number
    bytes: number
  }): FlowPayload {
    const start = this.startMs + spec.index * 10
    const durationMs = 5
    return {
      source_ip: spec.sourceIp,
      destination_ip: this.destination,
      source_port: spec.sourcePort,
      destination_port: spec.destinationPort,
      protocol: 'TCP',
      packet_count: spec.packets,
      byte_count: spec.bytes,
      start_time: new Date(start).toISOString(),
      end_time: new Date(start + durationMs).toISOString(),
      duration_ms: durationMs,
      source_type: 'e2e',
      source_name: 'playwright',
    }
  }
}
