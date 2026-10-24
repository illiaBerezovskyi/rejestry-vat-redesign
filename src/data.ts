export type Kind = 'sales' | 'purchases'
export type KsefStatus = 'confirmed' | 'pending' | 'missing'
export type VatRate = '23' | '8' | '5' | '0' | 'zw' | 'np'

export interface Doc {
  id: string
  kind: Kind
  contractor: string
  nip: string
  date: string
  number: string
  series: string
  ksefStatus: KsefStatus
  ksefNumber?: string
  rate: VatRate
  opType: string
  jpk: string[]
  net: number
  vat: number
  gross: number
  labels: string[]
}

export const MONTHS = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
]
export const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']
export const YEARS = [2024, 2025, 2026]

export const OP_TYPES: Record<Kind, string[]> = {
  sales: ['Sprzedaż krajowa', 'Korekta sprzedaży', 'WDT', 'Eksport usług'],
  purchases: ['Zakup krajowy', 'Korekta zakupu', 'WNT', 'Import usług'],
}
export const JPK_CODES = ['GTU_01', 'GTU_06', 'GTU_12', 'TP', 'MPP', 'FP']
export const SERIES = ['FV', 'KOR', 'FVE', 'FZ']
export const LABELS = ['Do sprawdzenia', 'Zapłacono', 'Projekt A', 'Pilne']
export const RATE_LABEL: Record<VatRate, string> = { '23': '23%', '8': '8%', '5': '5%', '0': '0%', zw: 'zw', np: 'np' }
const RATE_VALUE: Record<VatRate, number> = { '23': 0.23, '8': 0.08, '5': 0.05, '0': 0, zw: 0, np: 0 }

export const KSEF_LABEL: Record<KsefStatus, string> = {
  confirmed: 'Potwierdzony',
  pending: 'W trakcie',
  missing: 'Brak potwierdzenia',
}

// Deterministic pseudo-random so every period always shows the same demo data
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const NAMES = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Omega']

function generate(kind: Kind, year: number, month: number): Doc[] {
  // 2024 and future months of 2026 have no documents — shows the empty state naturally
  if (year === 2024 || (year === 2026 && month > 9)) return []
  const r = rng(year * 100 + month * 7 + (kind === 'sales' ? 1 : 2))
  const count = kind === 'sales' && year === 2026 && month === 9 ? 14 : 4 + Math.floor(r() * 12)
  const mm = String(month + 1).padStart(2, '0')
  const docs: Doc[] = []
  for (let i = 1; i <= count; i++) {
    const opType = OP_TYPES[kind][r() < 0.75 ? 0 : Math.floor(r() * 4)]
    const isCorrection = opType.startsWith('Korekta')
    const series = isCorrection ? 'KOR' : kind === 'purchases' ? 'FZ' : r() < 0.85 ? 'FV' : 'FVE'
    const rate: VatRate = opType === 'WDT' || opType === 'Eksport usług' ? 'np' : r() < 0.8 ? '23' : (['8', '5', 'zw'] as VatRate[])[Math.floor(r() * 3)]
    const net = Math.round((200 + r() * 1800) / 10) * 10 * (isCorrection ? -0.25 : 1)
    const vat = Math.round(net * RATE_VALUE[rate] * 100) / 100
    const roll = r()
    const ksefStatus: KsefStatus = year === 2026 ? 'missing' : roll < 0.8 ? 'confirmed' : roll < 0.9 ? 'pending' : 'missing'
    const day = String(Math.min(28, i * 2 - (i > 9 ? 9 : 1))).padStart(2, '0')
    const prefix = kind === 'sales' ? 'S' : 'Z'
    const name = `Demo ${NAMES[(i - 1) % 5]} ${String(i).padStart(2, '0')}`
    docs.push({
      id: `DEMO-${prefix}-${year}${mm}-${i}`,
      kind,
      contractor: name,
      nip: `${5000000000 + Math.floor(r() * 899999999)}`,
      date: `${year}-${mm}-${day}`,
      number: `${series}/${i}/${mm}/${year}/DEMO`,
      series,
      ksefStatus,
      ksefNumber: ksefStatus === 'confirmed' ? `${year}${mm}${day}-EE-${Math.floor(r() * 1e10).toString(16).toUpperCase()}` : undefined,
      rate,
      opType,
      jpk: r() < 0.4 ? [JPK_CODES[Math.floor(r() * JPK_CODES.length)]] : [],
      net,
      vat,
      gross: Math.round((net + vat) * 100) / 100,
      labels: r() < 0.25 ? [LABELS[Math.floor(r() * LABELS.length)]] : [],
    })
  }
  return docs
}

export type LoadMode = 'ok' | 'empty' | 'error'

/** Simulated API call. `mode` lets the demo force the empty / error states. */
export function loadDocs(kind: Kind, year: number, month: number, mode: LoadMode): Promise<Doc[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mode === 'error') reject(new Error('Serwer nie odpowiada (503). Spróbuj ponownie za chwilę.'))
      else resolve(mode === 'empty' ? [] : generate(kind, year, month))
    }, 450)
  })
}

const money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
export const fmt = (n: number) => money.format(n)
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`
}
