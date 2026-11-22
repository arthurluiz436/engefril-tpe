export const FUSO = 'America/Sao_Paulo'

/** Data de hoje no fuso de Brasília ('AAAA-MM-DD'). */
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
export function agoraHHMM(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}
export function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}
/** Dias corridos de a até b (positivo quando b é depois de a). */
export function diasEntre(a: string, b: string): number {
  const utc = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(b) - utc(a)) / 86400000)
}
export function dataBR(iso?: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
export function dataHoraBR(ts?: string | null): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts))
}
export function mesBR(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '')
}
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const h1 = (n?: number | null) => (n == null || isNaN(Number(n)) ? '—' : nf1.format(Number(n)))
export const n2 = (n?: number | null) => (n == null ? '—' : nf2.format(Number(n)))
export const int = (n?: number | null) => (n == null ? '—' : nf0.format(Number(n)))
export const reais = (n?: number | null) => (n == null ? '—' : brl.format(Number(n)))
export const reais0 = (n?: number | null) => (n == null ? '—' : brl0.format(Number(n)))
export const pct = (n?: number | null) => (n == null || !isFinite(Number(n)) ? '—' : `${nf1.format(Number(n) * 100)}%`)
/** Horas decimais → "7h30". */
export function hm(h?: number | null): string {
  if (h == null) return '—'
  const t = Math.round(Number(h) * 60)
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`
}
export const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : '—')
