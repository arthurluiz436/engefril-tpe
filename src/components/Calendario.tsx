import { useMemo, useState } from 'react'
import { dataBR, hm, hojeISO, somaDias } from '../lib/formato'
import { corRecurso, ROTULO_AUSENCIA, type Ausencia } from '../lib/agenda'
import { Dialogo, Icone } from './ui'

/**
 * Calendário mensal de apontamentos da equipe (modelo de agenda): cada apontamento aparece
 * no dia em que foi feito, com a cor do projetista. Passe o mouse para ver os detalhes da TPE.
 */
export interface EntradaCal {
  id: number; dia: string; hora_inicio: string; hora_fim: string; recurso_id: number; recurso_nome?: string
  tpe_id: number; tpe_codigo: string; grupo?: string; tipo_dia?: string; horas_totais: number; horas_extras: number; descricao?: string
}
interface Props {
  entradas: EntradaCal[]
  tpes: any[]
  recursos: any[]
  /** feriados e dias atípicos (linhas da tabela feriados) para marcar no calendário */
  dias?: any[]
  mes: string // 'AAAA-MM'
  aoMudarMes: (mes: string) => void
  carregando?: boolean
  /** férias e ausências da equipe */
  ausencias?: Ausencia[]
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']
const MAX_NO_DIA = 4
const ROT_DIA: Record<string, string> = { FERIADO: 'Feriado', NAO_TRABALHADO: 'Sem expediente', DIA_NORMAL: 'Dia normal', PERCENTUAL: 'H.E. especial' }

/** Primeiro e último dia exibidos na grade do mês (semanas de domingo a sábado). */
export function gradeDoMes(mes: string): [string, string] {
  const [a, m] = mes.split('-').map(Number)
  const primeiro = `${mes}-01`
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  const ini = somaDias(primeiro, -new Date(Date.UTC(a, m - 1, 1)).getUTCDay())
  const fim = somaDias(ultimo, 6 - new Date(`${ultimo}T12:00:00Z`).getUTCDay())
  return [ini, fim]
}
const moverMes = (mes: string, n: number) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7) }
const hora = (h: string) => { const [a, b] = h.slice(0, 5).split(':'); return b === '00' ? `${Number(a)}h` : `${Number(a)}h${b}` }

export default function Calendario({ entradas, tpes, recursos, dias = [], mes, aoMudarMes, carregando, ausencias = [] }: Props) {
  const hoje = hojeISO()
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [ini, fim] = gradeDoMes(mes)
  const cor = useMemo(() => new Map(recursos.map((r: any, i: number) => [String(r.id), corRecurso(r, i)])), [recursos])
  const nome = useMemo(() => new Map(recursos.map((r: any) => [String(r.id), r.nome as string])), [recursos])
  const tpe = useMemo(() => new Map(tpes.map((t: any) => [t.id, t])), [tpes])
  const diaEsp = useMemo(() => new Map(dias.map((d: any) => [String(d.data).slice(0, 10), d])), [dias])
  const visiveis = entradas.filter((e) => !ocultos.has(String(e.recurso_id)))
  const porDia = useMemo(() => {
    const m = new Map<string, EntradaCal[]>()
    for (const e of visiveis) { const d = String(e.dia).slice(0, 10); m.set(d, [...(m.get(d) ?? []), e]) }
    for (const l of m.values()) l.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || String(a.recurso_id).localeCompare(String(b.recurso_id)))
    return m
  }, [visiveis])
  // horas no mês por projetista (legenda)
  const horasMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entradas) if (String(e.dia).slice(0, 7) === mes) m.set(String(e.recurso_id), (m.get(String(e.recurso_id)) ?? 0) + Number(e.horas_totais))
    return m
  }, [entradas, mes])
  const semanas: string[][] = []
  for (let d = ini; d <= fim; d = somaDias(d, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => somaDias(d, i)))

  const dica = (e: EntradaCal) => {
    const t: any = tpe.get(e.tpe_id)
    const extra = Number(e.horas_extras) > 0.0001 ? ` · ${hm(Number(e.horas_extras))} extra` : ''
    return [
      `${e.tpe_codigo}${e.grupo ? ` · ${e.grupo}` : ''}`,
      t?.descricao,
      `Projetista: ${e.recurso_nome ?? nome.get(String(e.recurso_id)) ?? '—'}`,
      `Apontamento: ${dataBR(e.dia)}, ${e.hora_inicio.slice(0, 5)}–${e.hora_fim.slice(0, 5)} (${hm(Number(e.horas_totais))}${extra})`,
      e.descricao ? `O que foi feito: ${e.descricao}` : '',
      t ? `Planejado: ${dataBR(t.data_inicio)} → ${dataBR(t.prazo)}` : '',
      t ? `Realizado: ${t.primeiro_apontamento ? `${dataBR(t.primeiro_apontamento)} → ${t.data_fim ? dataBR(t.data_fim) : 'em andamento'}` : '—'}` : '',
      t ? `Status: ${t.status}${t.responsavel ? ` · responsável: ${t.responsavel}` : ''}` : '',
    ].filter(Boolean).join('\n')
  }
  const item = (e: EntradaCal) => (
    <div key={e.id} className="cal-item" title={dica(e)}>
      <span className="cal-ponto" style={{ background: cor.get(String(e.recurso_id)) ?? '#6b7079' }} />
      <span className="cal-hora">{hora(e.hora_inicio)}</span>
      <span className="cal-tpe">{e.tpe_codigo}</span>
    </div>
  )
  const [aM, mM] = mes.split('-').map(Number)
  const listaAberta = aberto ? porDia.get(aberto) ?? [] : []

  return (
    <div className="calendario">
      <div className="cal-topo">
        <button className="btn sec" onClick={() => aoMudarMes(hoje.slice(0, 7))}>Hoje</button>
        <button className="btn fantasma pequeno" onClick={() => aoMudarMes(moverMes(mes, -1))} aria-label="Mês anterior"><span style={{ transform: 'rotate(-90deg)', display: 'inline-flex' }}><Icone n="cima" /></span></button>
        <button className="btn fantasma pequeno" onClick={() => aoMudarMes(moverMes(mes, 1))} aria-label="Próximo mês"><span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icone n="cima" /></span></button>
        <h2 style={{ margin: 0, fontWeight: 600 }}>{MESES[mM - 1]} de {aM}</h2>
        {carregando && <span className="spinner" aria-label="Carregando" />}
      </div>
      <div className="row cal-legenda" style={{ gap: 6 }}>
        {recursos.map((r: any, i: number) => {
          const id = String(r.id), off = ocultos.has(id)
          return (
            <button key={id} type="button" className={`chip-proj ${off ? 'off' : ''}`} style={{ borderColor: corRecurso(r, i) }} aria-pressed={!off}
              onClick={() => { const s = new Set(ocultos); if (off) s.delete(id); else s.add(id); setOcultos(s) }} title={off ? 'Mostrar' : 'Ocultar'}>
              <span className="g2-ponto" style={{ background: corRecurso(r, i) }} />{r.nome}{horasMes.get(id) ? <span className="muted small">· {hm(horasMes.get(id)!)}</span> : null}
            </button>)
        })}
      </div>
      <div className="cal-grade" role="grid" aria-label={`Apontamentos de ${MESES[mM - 1]} de ${aM}`}>
        {SEMANA.map((s) => <div key={s} className="cal-cab" role="columnheader">{s}</div>)}
        {semanas.flat().map((d) => {
          const lista = porDia.get(d) ?? []
          const esp = diaEsp.get(d)
          const w = new Date(`${d}T12:00:00Z`).getUTCDay()
          const foraDoMes = d.slice(0, 7) !== mes
          const total = lista.reduce((s, e) => s + Number(e.horas_totais), 0)
          const semExpediente = w === 0 || w === 6 || esp?.tipo === 'FERIADO' || esp?.tipo === 'NAO_TRABALHADO' || (!esp?.tipo && esp)
          return (
            <div key={d} role="gridcell" className={`cal-dia ${foraDoMes ? 'fora' : ''} ${semExpediente && esp?.tipo !== 'DIA_NORMAL' ? 'folga' : ''} ${d === hoje ? 'hoje' : ''}`}>
              <div className="cal-num">
                <span className="n">{d.endsWith('-01') ? `${Number(d.slice(8))} ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(d.slice(5, 7)) - 1]}.` : Number(d.slice(8))}</span>
                {total > 0 && <span className="cal-total" title="Horas apontadas no dia (projetistas visíveis)">{hm(total)}</span>}
              </div>
              {esp && <div className={`cal-esp ${esp.tipo ?? 'FERIADO'}`} title={esp.descricao}>{ROT_DIA[esp.tipo ?? 'FERIADO']}: {esp.descricao}</div>}
              {ausencias.filter((a) => !ocultos.has(String(a.recurso_id)) && String(a.inicio).slice(0, 10) <= d && String(a.fim).slice(0, 10) >= d && w !== 0 && w !== 6).map((a, k) => (
                <div key={`a${k}`} className="cal-ferias" style={{ borderLeftColor: cor.get(String(a.recurso_id)) }} title={`${ROTULO_AUSENCIA[a.tipo ?? "FERIAS"] ?? "Férias"} de ${nome.get(String(a.recurso_id)) ?? ""}: ${dataBR(a.inicio)} a ${dataBR(a.fim)}`}>{ROTULO_AUSENCIA[a.tipo ?? "FERIAS"] ?? "Férias"} · {(nome.get(String(a.recurso_id)) ?? "").split(" ")[0]}</div>))}
              {lista.slice(0, lista.length > MAX_NO_DIA ? MAX_NO_DIA - 1 : MAX_NO_DIA).map(item)}
              {lista.length > MAX_NO_DIA && <button type="button" className="cal-mais" onClick={() => setAberto(d)}>Mais {lista.length - (MAX_NO_DIA - 1)}</button>}
            </div>)
        })}
      </div>
      <Dialogo titulo={aberto ? `Apontamentos de ${dataBR(aberto)}` : ''} aberto={!!aberto} aoFechar={() => setAberto(null)}>
        <div className="stack" style={{ gap: 6 }}>
          {listaAberta.map((e) => (
            <div key={e.id} className="cal-linha" title={dica(e)}>
              <span className="cal-ponto" style={{ background: cor.get(String(e.recurso_id)) ?? '#6b7079' }} />
              <strong className="mono">{e.hora_inicio.slice(0, 5)}–{e.hora_fim.slice(0, 5)}</strong>
              <span><strong>{e.tpe_codigo}</strong> <span className="muted small">{e.grupo}</span></span>
              <span className="small">{e.recurso_nome ?? nome.get(String(e.recurso_id))}</span>
              <span className="small mono" style={{ marginLeft: 'auto' }}>{hm(Number(e.horas_totais))}</span>
            </div>))}
        </div>
      </Dialogo>
    </div>
  )
}
