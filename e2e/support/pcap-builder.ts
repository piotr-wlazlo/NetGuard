/**
 * Buduje plik PCAP w pamięci (nagłówek pliku + ramki Ethernet/IPv4/TCP), bez zewnętrznych narzędzi.
 * Testy przekazują go do przeglądarki jako bufor przez setInputFiles, więc w repozytorium nie ma plików binarnych.
 */

function ipBytes(ip: string): number[] {
  return ip.split('.').map(Number)
}

function tcpSynFrame(src: string, dst: string, sport: number, dport: number): Buffer {
  const eth = Buffer.from([0x02, 0, 0, 0, 0, 0x02, 0x02, 0, 0, 0, 0, 0x01, 0x08, 0x00])
  const ip = Buffer.alloc(20)
  ip.writeUInt8(0x45, 0) // IPv4, nagłówek 20 bajtów
  ip.writeUInt16BE(40, 2) // długość: IP + TCP
  ip.writeUInt8(64, 8) // TTL
  ip.writeUInt8(6, 9) // protokół TCP
  Buffer.from(ipBytes(src)).copy(ip, 12)
  Buffer.from(ipBytes(dst)).copy(ip, 16)
  const tcp = Buffer.alloc(20)
  tcp.writeUInt16BE(sport, 0)
  tcp.writeUInt16BE(dport, 2)
  tcp.writeUInt8(0x50, 12) // długość nagłówka TCP
  tcp.writeUInt8(0x02, 13) // flaga SYN
  tcp.writeUInt16BE(64240, 14)
  return Buffer.concat([eth, ip, tcp])
}

/** Skan portów: jedno źródło wysyła SYN na `ports` kolejnych portów jednego hosta (domyślnie 150 > próg 100). */
export function portScanPcap(attacker = '10.66.0.1', target = '192.168.50.10', ports = 150): Buffer {
  const header = Buffer.alloc(24)
  header.writeUInt32LE(0xa1b2c3d4, 0)
  header.writeUInt16LE(2, 4)
  header.writeUInt16LE(4, 6)
  header.writeUInt32LE(65535, 16)
  header.writeUInt32LE(1, 20) // Ethernet
  const start = Math.floor(Date.now() / 1000) - 60
  const records = Array.from({ length: ports }, (_, i) => {
    const frame = tcpSynFrame(attacker, target, 45000, 1000 + i)
    const record = Buffer.alloc(16)
    record.writeUInt32LE(start, 0)
    record.writeUInt32LE(i * 1000, 4)
    record.writeUInt32LE(frame.length, 8)
    record.writeUInt32LE(frame.length, 12)
    return Buffer.concat([record, frame])
  })
  return Buffer.concat([header, ...records])
}
