import { useEffect, useMemo, useState } from 'react'
import { dataBR, hojeISO, somaDias } from '../lib/formato'

/** Período de análise do Painel e dos Indicadores (fica lembrado enquanto a aba do navegador estiver aberta). */
export interface Periodo { atalho: Atalho; ini: string; fim: string }
export type Atalho = 'tudo' | 'ano' | 'mes_anterior' | 'mes_atual' | 'seis_meses' | 'personalizado'

const CHAVE = 'engefril.periodo'
const ATALHOS: [Atalho, string][] = [
  ['tudo', '1º ao último TPE'], ['ano', 'Este ano'], ['seis_meses', 'Últimos 6 meses'], ['mes_anterior', 'Mês anterior'], ['mes_atual', 'Mês atual'],
]
const dataRef = (t: any) => String(t.data_inicio ?? t.criado_em ?? '').slice(0, 10)
const fimDoMes = (aaaaMm: string) => { const [a, m] = aaaaMm.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) }

/** Primeiro e último dia com TPE cadastrada ou apontamento. */
export function extremos(base: { tpes: any[]; aps: any[] }): [string, string] {
  const ds = [...base.tpes.map(dataRef), ...base.tpes.map((t) => String(t.data_fim ?? '').slice(0, 10)), ...base.aps.map((a) => String(a.dia).slice(0, 10))].filter(Boolean).sort()
  const h = hojeISO()
  return [ds[0] ?? h, ds[ds.length - 1] ?? h]
}

export function calcularAtalho(a: Atalho, base: { tpes: any[]; aps: any[] }): [string, string] {
  const h = hojeISO()
  if (a === 'ano') return [`${h.slice(0, 4)}-01-01`, `${h.slice(0, 4)}-12-31`]
  if (a === 'mes_atual') return [`${h.slice(0, 7)}-01`, fimDoMes(h.slice(0, 7))]
  if (a === 'mes_anterior') { const d = somaDias(`${h.slice(0, 7)}-01`, -1); return [`${d.slice(0, 7)}-01`, d] }
  if (a === 'seis_meses') { const [y, m] = h.split('-').map(Number); const ini = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10); return [ini, h] }
  return extremos(base)
}

export function usePeriodo(base: { tpes: any[]; aps: any[] } | null) {
  const [p, setP] = useState<Periodo | null>(() => {
    try { const s = sessionStorage.getItem(CHAVE); return s ? (JSON.parse(s) as Periodo) : null } catch { return null }
  })
  // atalhos são recalculados (ex.: "mês atual" vira o mês novo; "tudo" acompanha novos cadastros)
  const efetivo = useMemo<Periodo | null>(() => {
    if (!base) return null
    const atalho = p?.atalho ?? 'tudo'
    if (atalho === 'personalizado' && p) return p
    const [ini, fim] = calcularAtalho(atalho, base)
    return { atalho, ini, fim }
  }, [p, base])
  useEffect(() => { try { if (p) sessionStorage.setItem(CHAVE, JSON.stringify(p)) } catch { /* sem armazenamento */ } }, [p])
  return [efetivo, setP] as const
}

/** Recorta a base: apontamentos pelo dia; TPEs pela data de início (ou cadastro) ou por terem apontamento no período. */
export function filtrarPeriodo<B extends { tpes: any[]; aps: any[] }>(base: B, p: Periodo | null): B {
  if (!p || p.atalho === 'tudo') return base
  const dentro = (d: string) => !!d && d >= p.ini && d <= p.fim
  const aps = base.aps.filter((a) => dentro(String(a.dia).slice(0, 10)))
  const comAp = new Set(aps.map((a) => a.tpe_id))
  const tpes = base.tpes.filter((t) => dentro(dataRef(t)) || comAp.has(t.id))
  return { ...base, aps, tpes }
}

export function SeletorPeriodo({ periodo, aoMudar, base }: { periodo: Periodo; aoMudar: (p: Periodo) => void; base: { tpes: any[]; aps: any[] } }) {
  const escolher = (a: Atalho) => { const [ini, fim] = calcularAtalho(a, base); aoMudar({ atalho: a, ini, fim }) }
  return (
    <div className="periodo nao-imprimir">
      <span className="small muted" style={{ fontWeight: 600 }}>Período</span>
      <div className="segmentos rolavel" role="group" aria-label="Atalhos de período">
        {ATALHOS.map(([k, r]) => <button key={k} type="button" aria-pressed={periodo.atalho === k} onClick={() => escolher(k)}>{r}</button>)}
      </div>
      <div className="periodo-datas">
        <input type="date" value={periodo.ini} max={periodo.fim} aria-label="Início do período" onChange={(e) => e.target.value && aoMudar({ atalho: 'personalizado', ini: e.target.value, fim: periodo.fim })} />
        <span className="muted">até</span>
        <input type="date" value={periodo.fim} min={periodo.ini} aria-label="Fim do período" onChange={(e) => e.target.value && aoMudar({ atalho: 'personalizado', ini: periodo.ini, fim: e.target.value })} />
        {periodo.atalho === 'personalizado' && <span className="badge azul">personalizado</span>}
      </div>
    </div>
  )
}

export const textoPeriodo = (p: Periodo) => `${dataBR(p.ini)} a ${dataBR(p.fim)}`
