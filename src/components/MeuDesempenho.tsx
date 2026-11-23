import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { lerDiasEspeciais, paraParametros } from '../lib/dados'
import { capacidade, tpeBase } from '../lib/calculo'
import { dataBR, h1, hojeISO, pct, somaDias } from '../lib/formato'

/**
 * Indicadores do próprio projetista, com a mesma regra da tabela "Produtividade e capacidade da equipe"
 * dos Indicadores do Supervisor: capacidade = dias úteis do 1º ao último dia com apontamento no período
 * (9 h seg–qui, 8 h sex, sem feriados); alocação = horas ÷ capacidade; TPEs contam uma vez com as revisões.
 */
type Periodo = 'mes' | 'mes_anterior' | 'ano' | 'tudo'
const PERIODOS: [Periodo, string][] = [['mes', 'Mês atual'], ['mes_anterior', 'Mês anterior'], ['ano', 'Este ano'], ['tudo', 'Desde o início']]
const fimDoMes = (aaaaMm: string) => { const [a, m] = aaaaMm.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) }
function intervalo(p: Periodo): [string | null, string | null] {
  const h = hojeISO()
  if (p === 'mes') return [`${h.slice(0, 7)}-01`, fimDoMes(h.slice(0, 7))]
  if (p === 'mes_anterior') { const d = somaDias(`${h.slice(0, 7)}-01`, -1); return [`${d.slice(0, 7)}-01`, d] }
  if (p === 'ano') return [`${h.slice(0, 4)}-01-01`, `${h.slice(0, 4)}-12-31`]
  return [null, null]
}
const matiz = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 120)

export default function MeuDesempenho({ recursoId }: { recursoId: number }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [aps, setAps] = useState<any[] | null>(null)
  const [base, setBase] = useState<{ p: any; feriados: Set<string> } | null>(null)
  useEffect(() => {
    Promise.all([supabase.rpc('parametros_vigentes', { p_dia: hojeISO() }), supabase.from('feriados').select('*')])
      .then(([p, f]) => setBase({ p: paraParametros(p.data), feriados: lerDiasEspeciais(f.data ?? []).feriados }))
  }, [])
  useEffect(() => {
    const [ini, fim] = intervalo(periodo)
    let q = supabase.from('v_apontamentos').select('dia, tpe_codigo, horas_totais, horas_extras').eq('recurso_id', recursoId)
    if (ini) q = q.gte('dia', ini)
    if (fim) q = q.lte('dia', fim)
    setAps(null)
    q.limit(5000).then(({ data }) => setAps(data ?? []))
  }, [periodo, recursoId])

  const r = useMemo(() => {
    if (!aps || !base) return null
    const dias = aps.map((a) => String(a.dia).slice(0, 10)).sort()
    const d0 = dias[0] ?? null, d1 = dias[dias.length - 1] ?? null
    const horas = aps.reduce((s, a) => s + Number(a.horas_totais), 0)
    const extras = aps.reduce((s, a) => s + Number(a.horas_extras), 0)
    const cap = d0 && d1 ? capacidade(d0, d1, base.p, base.feriados) : 0
    const diasTrab = new Set(dias).size
    const tpes = new Set(aps.map((a) => tpeBase(String(a.tpe_codigo)))).size
    return { d0, d1, horas, extras, cap, diasTrab, tpes, aloc: cap ? horas / cap : 0, pctHe: horas ? extras / horas : 0, hDia: diasTrab ? horas / diasTrab : 0, hTpe: tpes ? horas / tpes : 0 }
  }, [aps, base])

  const cor = r ? `hsl(${matiz(r.aloc)} 62% 42%)` : 'var(--azul)'
  return (
    <div className="card meu-desempenho">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Meu desempenho</h2>
          <div className="muted small">{r?.d0 ? `Apontamentos de ${dataBR(r.d0)} a ${dataBR(r.d1)}` : 'Os mesmos indicadores que o Supervisor acompanha, só os seus.'}</div>
        </div>
        <div className="segmentos" role="group" aria-label="Período">
          {PERIODOS.map(([k, t]) => <button key={k} type="button" aria-pressed={periodo === k} onClick={() => setPeriodo(k)}>{t}</button>)}
        </div>
      </div>
      {!r ? <div className="muted small">Carregando…</div> : r.horas === 0 ? <div className="muted small">Nenhum apontamento neste período.</div> : (
        <>
          <div className="md-aloc" title="Horas apontadas ÷ capacidade (dias úteis do 1º ao último dia com apontamento no período)">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="small" style={{ fontWeight: 600 }}>Alocação</span>
              <span style={{ color: cor, fontWeight: 800, fontSize: '1.4rem' }}>{pct(r.aloc)}{r.aloc > 1.0001 ? ' ▲' : ''}</span>
            </div>
            <div className="barra" style={{ height: 10 }}><div style={{ width: `${Math.min(1, r.aloc) * 100}%`, background: cor }} /></div>
            <div className="muted small" style={{ marginTop: 4 }}>{h1(r.horas)} h apontadas de {h1(r.cap)} h de capacidade{r.aloc > 1.0001 ? ' · acima de 100% significa hora extra' : ''}</div>
          </div>
          <div className="md-grade">
            {([
              ['Dias com apontamento', String(r.diasTrab), null],
              ['Horas no período', `${h1(r.horas)} h`, null],
              ['Horas extras', `${h1(r.extras)} h`, r.pctHe > 0.0001 ? `${pct(r.pctHe)} das horas` : 'nenhuma'],
              ['Média por dia', `${h1(r.hDia)} h`, null],
              ['TPEs atendidas', String(r.tpes), 'revisões contam junto'],
              ['Horas por TPE', `${h1(r.hTpe)} h`, null],
            ] as [string, string, string | null][]).map(([k, v, s]) => (
              <div key={k} className="md-item">
                <span className="muted small">{k}</span>
                <strong className={k === 'Horas extras' && r.extras > 0.0001 ? 'ind-he' : ''}>{v}</strong>
                {s && <span className="muted small">{s}</span>}
              </div>))}
          </div>
        </>
      )}
    </div>
  )
}
