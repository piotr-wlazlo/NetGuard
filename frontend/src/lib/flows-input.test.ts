import { describe, expect, it } from 'vitest'

import { parseFlowsJson } from './flows-input'
import { validateParam } from './config-meta'

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

describe('parseFlowsJson', () => {
  it('przyjmuje gołą tablicę i obiekt {flows: [...]}', () => {
    expect(parseFlowsJson(JSON.stringify([flow]))).toEqual({ ok: true, flows: [flow] })
    expect(parseFlowsJson(JSON.stringify({ flows: [flow] }))).toEqual({ ok: true, flows: [flow] })
  })

  it('zgłasza pusty tekst, zły JSON i zły kształt', () => {
    expect(parseFlowsJson('  ')).toMatchObject({ ok: false })
    const broken = parseFlowsJson('{nie json')
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors[0]).toMatch(/Niepoprawny JSON/)
    expect(parseFlowsJson('{"a": 1}')).toMatchObject({ ok: false })
    expect(parseFlowsJson('[]')).toMatchObject({ ok: false })
  })

  it('odrzuca więcej niż 1000 flow', () => {
    const result = parseFlowsJson(JSON.stringify(Array.from({ length: 1001 }, () => flow)))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/1001/)
  })

  it('wskazuje brakujące pola z numerem flow i skraca długą listę błędów', () => {
    const { source_ip: _omit, ...withoutIp } = flow
    const result = parseFlowsJson(JSON.stringify(Array.from({ length: 8 }, () => withoutIp)))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toContain('flows[0]')
      expect(result.errors[0]).toContain('source_ip')
      expect(result.errors).toHaveLength(6)
      expect(result.errors.at(-1)).toMatch(/3 kolejnych/)
    }
  })
})

describe('validateParam', () => {
  it('akceptuje poprawne wartości, także z przecinkiem dziesiętnym', () => {
    expect(validateParam('z_threshold', '3,5')).toBeNull()
    expect(validateParam('batch_size', '5000')).toBeNull()
  })

  it('odrzuca puste, nienumeryczne i niedodatnie wartości (jak backend: > 0)', () => {
    expect(validateParam('z_threshold', '')).not.toBeNull()
    expect(validateParam('z_threshold', 'abc')).not.toBeNull()
    expect(validateParam('z_threshold', '0')).not.toBeNull()
    expect(validateParam('z_threshold', '-1')).not.toBeNull()
  })

  it('wymusza liczby całkowite tam, gdzie parametr jest licznikiem', () => {
    expect(validateParam('port_scan_min_ports', '100.5')).not.toBeNull()
    expect(validateParam('z_threshold', '3.25')).toBeNull()
  })

  it('pilnuje górnej granicy progu ML (wzór dzieli przez 1 − próg)', () => {
    expect(validateParam('ml_score_threshold', '1')).not.toBeNull()
    expect(validateParam('ml_score_threshold', '0.65')).toBeNull()
  })

  it('nieznany parametr traktuje jak zwykłą liczbę dodatnią', () => {
    expect(validateParam('przyszly_parametr', '2.5')).toBeNull()
  })
})
