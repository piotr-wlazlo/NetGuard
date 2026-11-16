export interface ParamMeta {
  label: string
  hint: string
  integer?: boolean
  /** Górna granica wynikająca ze wzoru w kodzie detektora (nie jest sprawdzana przez API). */
  max?: number
}

export const PARAM_META: Record<string, ParamMeta> = {
  batch_size: {
    label: 'Rozmiar partii (batch)',
    hint: 'Ile flow jest analizowanych naraz i zapisywanych w bazie jedną transakcją.',
    integer: true,
  },
  small_flow_packets: {
    label: 'Maks. liczba pakietów „małego” flow',
    hint: 'Do wykrywania skanowania portów liczą się tylko flow o tylu pakietach lub mniej.',
    integer: true,
  },
  port_scan_min_ports: {
    label: 'Skan portów: min. liczba portów',
    hint: 'Ile różnych portów jednego hosta, sprawdzanych z jednego źródła, uznajemy za skanowanie.',
    integer: true,
  },
  brute_force_min_attempts: {
    label: 'Brute force: min. liczba prób',
    hint: 'Ile połączeń z jednego źródła do tej samej usługi (host:port) uznajemy za brute force.',
    integer: true,
  },
  ddos_min_sources: {
    label: 'DDoS: min. liczba źródeł',
    hint: 'Ile różnych źródeł łączących się z jednym hostem uznajemy za atak rozproszony.',
    integer: true,
  },
  z_threshold: {
    label: 'Próg robust z-score',
    hint: 'Im wyższy próg, tym mniej detekcji. Typowa wartość to 3,5.',
  },
  mad_floor: {
    label: 'Dolna granica MAD',
    hint: 'Zabezpiecza przed dzieleniem przez zero, gdy ruch w partii jest bardzo jednorodny.',
  },
  min_flows: {
    label: 'Min. liczba flow w partii',
    hint: 'Poniżej tej liczby metoda statystyczna nie analizuje partii.',
    integer: true,
  },
  ml_score_threshold: {
    label: 'Próg wyniku Isolation Forest',
    hint: 'Wynik anomalii od 0 do 1. Im wyższy próg, tym mniej detekcji.',
    max: 0.99,
  },
}

export interface SectionMeta {
  title: string
  description: string
}

export const SECTION_META: Record<string, SectionMeta> = {
  common: {
    title: 'Parametry wspólne',
    description: 'Progi używane przez reguły oraz przez klasyfikację typu ataku w metodzie ML.',
  },
  statistical: {
    title: 'Metoda statystyczna',
    description: 'Robust z-score (mediana i MAD) liczony osobno dla każdej partii flow.',
  },
  ml: {
    title: 'Metoda ML',
    description: 'Isolation Forest trenowany osobno na każdej partii flow.',
  },
}

const SECTION_ORDER = ['common', 'statistical', 'ml']
const PARAM_ORDER = Object.keys(PARAM_META)

export function sectionOrder(sections: string[]): string[] {
  const known = SECTION_ORDER.filter((name) => sections.includes(name))
  const unknown = sections.filter((name) => !SECTION_ORDER.includes(name)).sort()
  return [...known, ...unknown]
}

export function paramOrder(names: string[]): string[] {
  const rank = (name: string) => {
    const index = PARAM_ORDER.indexOf(name)
    return index === -1 ? PARAM_ORDER.length : index
  }
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export function paramMeta(name: string): ParamMeta {
  return PARAM_META[name] ?? { label: name, hint: '' }
}

export type FieldError = string | null

/** Walidacja pojedynczego pola — spójna z backendem (wartość > 0) oraz z typem parametru. */
export function validateParam(name: string, raw: string): FieldError {
  const meta = paramMeta(name)
  const text = raw.trim().replace(',', '.')
  if (text === '') return 'Podaj wartość.'
  const value = Number(text)
  if (!Number.isFinite(value)) return 'To nie jest liczba.'
  if (value <= 0) return 'Wartość musi być większa od zera.'
  if (meta.integer && !Number.isInteger(value)) return 'Wymagana liczba całkowita.'
  if (meta.max !== undefined && value > meta.max) return `Maksymalna wartość to ${meta.max}.`
  return null
}

export function toNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'))
}
