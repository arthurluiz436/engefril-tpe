// Normalização de valores vindos de planilhas Excel (datas BR, seriais, horários, textos).
// Funções puras: usadas no navegador (importação) e nos testes.

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Cabeçalho normalizado: sem acento, maiúsculo, espaços simples. */
export function normCab(s: unknown): string {
  return semAcento(String(s ?? ''))
    .toUpperCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Valor "cru" de uma célula ExcelJS (resolve fórmulas, rich text, hyperlinks). */
export function valorCelula(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('result' in o) return valorCelula(o.result)
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('')
    if ('text' in o) return o.text
    if ('error' in o) return null
  }
  return v
}

export function texto(v: unknown): string {
  const x = valorCelula(v)
  if (x === null || x === undefined) return ''
  if (x instanceof Date) return dataISO(x) ?? ''
  return String(x).trim()
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

/** Data → 'AAAA-MM-DD'. Aceita Date (ExcelJS entrega em UTC), serial Excel, 'dd/mm/aaaa' e ISO. */
export function dataISO(v: unknown): string | null {
  const x = valorCelula(v)
  if (x === null || x === undefined || x === '') return null
  if (x instanceof Date) {
    if (isNaN(x.getTime())) return null
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof x === 'number') {
    if (x < 1 || x > 80000) return null
    return dataISO(new Date(EXCEL_EPOCH_UTC + Math.floor(x) * 86400000))
  }
  const s = String(x).trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return validaData(ano, Number(m[2]), Number(m[1]))
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return validaData(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

function validaData(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Horário → 'HH:MM' (minuto arredondado). Aceita Date de base 1899, fração do dia e 'hh:mm'. */
export function horaHHMM(v: unknown): string | null {
  const x = valorCelula(v)
  if (x === null || x === undefined || x === '') return null
  let minutos: number
  if (x instanceof Date) {
    minutos = x.getUTCHours() * 60 + x.getUTCMinutes() + Math.round(x.getUTCSeconds() / 60)
  } else if (typeof x === 'number') {
    if (x < 0 || x >= 1) return null
    minutos = Math.round(x * 1440)
  } else {
    const m = String(x).trim().match(/^(\d{1,2})[:hH](\d{2})/)
    if (!m) return null
    minutos = Number(m[1]) * 60 + Number(m[2])
  }
  if (minutos < 0 || minutos >= 1440) return null
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

export function inteiro(v: unknown): number | null {
  const x = valorCelula(v)
  if (x === null || x === undefined || x === '') return null
  const n = typeof x === 'number' ? x : Number(String(x).replace(/\./g, '').replace(',', '.').trim())
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

export function numero(v: unknown): number | null {
  const x = valorCelula(v)
  if (x === null || x === undefined || x === '') return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  const s = String(x).replace(/[R$\s]/g, '')
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

/** Código de TPE padronizado 'TPE-001.0' (mesma regra de public.normaliza_tpe). */
export function normalizaTPE(v: unknown): string | null {
  const s = texto(v).toUpperCase().replace(/\s/g, '')
  const m = s.match(/^TPE-?(\d+)(?:\.(\d+))?$/)
  if (!m) return null
  return `TPE-${String(Number(m[1])).padStart(3, '0')}.${Number(m[2] ?? 0)}`
}

/** Evita injeção de fórmulas em planilhas exportadas (=, +, -, @, tab, CR). */
export function textoSeguroPlanilha(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}
