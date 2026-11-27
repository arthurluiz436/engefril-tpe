import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { dataBR, hm, hojeISO, osBR, somaDias } from '../lib/formato'
import { corRecurso, ROTULO_AUSENCIA, type Ausencia } from '../lib/agenda'
import { Dialogo, Icone } from './ui'
import { useDica } from './Dica'
import ExecucaoMes from './ExecucaoMes'

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
  /** prazo final de cada O.S. (número → data), marcado no dia */
  prazosOS?: Map<number, string>
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

export default function Calendario({ entradas, tpes, recursos, dias = [], mes, aoMudarMes, carregando, ausencias = [], prazosOS }: Props) {
  const hoje = hojeISO()
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const dicaDia = useDica()
  // resumo flutuante do dia (abre ao clicar no número do dia)
  const [resumo, setResumo] = useState<{ d: string; x: number; y: number } | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const balaoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!resumo) return
    const fora = (e: MouseEvent) => { if (balaoRef.current && !balaoRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.cal-num-btn')) setResumo(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setResumo(null) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [resumo])
  // prazos finais das O.S. por dia (e o cliente de cada O.S., pelas TPEs)
  const clienteOS = useMemo(() => new Map(tpes.map((t: any) => [Number(t.os), t.cliente as string])), [tpes])
  const prazosDia = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const [os, d] of prazosOS ?? []) { const k = String(d).slice(0, 10); m.set(k, [...(m.get(k) ?? []), os]) }
    return m
  }, [prazosOS])
  const abrirResumo = (d: string, el: HTMLElement) => {
    if (resumo?.d === d) return setResumo(null)
    const c = caixaRef.current!.getBoundingClientRect(), r = el.getBoundingClientRect()
    const larg = 380
    const x = Math.min(Math.max(8, r.left - c.left), c.width - larg - 8)
    setResumo({ d, x, y: r.bottom - c.top + 6 })
  }
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
      t?.os != null ? `O.S. ${osBR(t.os)}${t.cliente ? ` · ${t.cliente}` : ''}` : '',
      `Projetista: ${e.recurso_nome ?? nome.get(String(e.recurso_id)) ?? '—'}`,
      `Apontamento: ${dataBR(e.dia)}, ${e.hora_inicio.slice(0, 5)}–${e.hora_fim.slice(0, 5)} (${hm(Number(e.horas_totais))}${extra})`,
      e.descricao ? `O que foi feito: ${e.descricao}` : '',
      t ? `Planejado: ${dataBR(t.data_inicio)} → ${dataBR(t.prazo)}` : '',
      t ? `Realizado: ${t.primeiro_apontamento ? `${dataBR(t.primeiro_apontamento)} → ${t.data_fim ? dataBR(t.data_fim) : 'em andamento'}` : '—'}` : '',
      t ? `Status: ${t.status}${t.responsavel ? ` · responsável: ${t.responsavel}` : ''}` : '',
    ].filter(Boolean).join('\n')
  }
  const item = (e: EntradaCal) => (
    <div key={e.id} className="cal-item">
      <span className="cal-ponto" style={{ background: cor.get(String(e.recurso_id)) ?? '#6b7079' }} />
      <span className="cal-hora">{hora(e.hora_inicio)}</span>
      <span className="cal-tpe">{e.tpe_codigo}</span>
    </div>
  )
  const cartaoDia = (d: string) => {
    const lista = porDia.get(d) ?? []
    const esp = diaEsp.get(d)
    const fer = ausencias.filter((a) => !ocultos.has(String(a.recurso_id)) && String(a.inicio).slice(0, 10) <= d && String(a.fim).slice(0, 10) >= d)
    const prazos = prazosDia.get(d) ?? []
    const total = lista.reduce((s2, e) => s2 + Number(e.horas_totais), 0)
    const extras = lista.reduce((s2, e) => s2 + Number(e.horas_extras), 0)
    const porProj = new Map<string, number>()
    for (const e of lista) porProj.set(String(e.recurso_id), (porProj.get(String(e.recurso_id)) ?? 0) + Number(e.horas_totais))
    const sem = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][new Date(`${d}T12:00:00Z`).getUTCDay()]
    return (
      <>
        <div className="cd-cab" style={{ borderLeftColor: 'var(--azul)' }}>
          <div className="cd-cod">{dataBR(d)} <span className="muted" style={{ fontWeight: 500, fontSize: '.8rem' }}>{sem}</span></div>
          <div className="muted">{lista.length ? <><strong style={{ color: 'var(--texto)' }}>{hm(total)}</strong> em {lista.length} apontamento(s){extras > 0.0001 ? <span className="ind-he"> · {hm(extras)} extra</span> : null}</> : 'Nenhum apontamento neste dia'}</div>
        </div>
        <div className="cd-corpo">
          {esp && <div className={`cal-esp ${esp.tipo ?? 'FERIADO'}`}>{ROT_DIA[esp.tipo ?? 'FERIADO']}: {esp.descricao}</div>}
          {fer.map((a, k) => <div key={k} className="cal-ferias" style={{ borderLeftColor: cor.get(String(a.recurso_id)) }}>{ROTULO_AUSENCIA[a.tipo ?? 'FERIAS'] ?? 'Férias'} · {nome.get(String(a.recurso_id))}</div>)}
          {prazos.map((os) => <div key={os} className="cal-os">Prazo final: OS {osBR(os)}{clienteOS.get(os) ? ` · ${clienteOS.get(os)}` : ''}</div>)}
          {porProj.size > 0 && <div className="cd-proj">{[...porProj].sort((a, b) => b[1] - a[1]).map(([id, h]) => <span key={id}><span className="cal-ponto" style={{ background: cor.get(id) ?? '#6b7079' }} />{nome.get(id) ?? '—'} <strong>{hm(h)}</strong></span>)}</div>}
          {lista.length > 0 && <div className="cd-dias">{lista.slice(0, 9).map((e) => {
            const t: any = tpe.get(e.tpe_id)
            return (
              <div key={e.id} className="cd-ap" style={{ borderLeftColor: cor.get(String(e.recurso_id)) ?? '#6b7079' }}>
                <div><span className="mono">{e.hora_inicio.slice(0, 5)}–{e.hora_fim.slice(0, 5)}</span> <strong>{e.tpe_codigo}</strong>{t?.os != null && <span className="muted"> · OS {osBR(t.os)}</span>}<span style={{ float: 'right', fontWeight: 700 }}>{hm(Number(e.horas_totais))}</span></div>
                <div className="muted">{e.recurso_nome ?? nome.get(String(e.recurso_id))}{e.grupo ? ` · ${e.grupo}` : ''}</div>
                <div>{e.descricao || <span className="muted">{t?.descricao ? `TPE: ${t.descricao}` : 'Sem descrição.'}</span>}</div>
              </div>)
          })}{lista.length > 9 && <div className="muted small">… e mais {lista.length - 9}. Clique no número do dia para ver todos.</div>}</div>}
        </div>
      </>)
  }
  const naoUteisMes = useMemo(() => new Set(dias.filter((x: any) => !x.tipo || x.tipo === 'FERIADO' || x.tipo === 'NAO_TRABALHADO').map((x: any) => String(x.data).slice(0, 10))), [dias])
  const [aM, mM] = mes.split('-').map(Number)
  const listaAberta = aberto ? porDia.get(aberto) ?? [] : []

  return (
    <div className="calendario" ref={caixaRef} style={{ position: 'relative' }}>
      <div className="cal-topo">
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
            <div key={d} role="gridcell" onMouseMove={(ev) => { if (!resumo) dicaDia.mostrar(ev, cartaoDia(d)) }} onMouseLeave={dicaDia.esconder} className={`cal-dia ${foraDoMes ? 'fora' : ''} ${semExpediente && esp?.tipo !== 'DIA_NORMAL' ? 'folga' : ''} ${d === hoje ? 'hoje' : ''}`}>
              <div className="cal-num">
                <button type="button" className={`n cal-num-btn ${resumo?.d === d ? 'ativo' : ''}`} onClick={(ev) => abrirResumo(d, ev.currentTarget)} title="Ver o resumo do dia" aria-haspopup="dialog">{d.endsWith('-01') ? `${Number(d.slice(8))} ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(d.slice(5, 7)) - 1]}.` : Number(d.slice(8))}</button>
                {total > 0 && <span className="cal-total" title="Horas apontadas no dia (projetistas visíveis)">{hm(total)}</span>}
              </div>
              {esp && <div className={`cal-esp ${esp.tipo ?? 'FERIADO'}`} title={esp.descricao}>{ROT_DIA[esp.tipo ?? 'FERIADO']}: {esp.descricao}</div>}
              {(prazosDia.get(d) ?? []).map((os) => <div key={`os${os}`} className="cal-os" title={`Prazo final da O.S. ${osBR(os)}${clienteOS.get(os) ? ` · ${clienteOS.get(os)}` : ''}: ${dataBR(d)}`}>OS {osBR(os)}</div>)}
              {ausencias.filter((a) => !ocultos.has(String(a.recurso_id)) && String(a.inicio).slice(0, 10) <= d && String(a.fim).slice(0, 10) >= d && w !== 0 && w !== 6).map((a, k) => (
                <div key={`a${k}`} className="cal-ferias" style={{ borderLeftColor: cor.get(String(a.recurso_id)) }} title={`${ROTULO_AUSENCIA[a.tipo ?? "FERIAS"] ?? "Férias"} de ${nome.get(String(a.recurso_id)) ?? ""}: ${dataBR(a.inicio)} a ${dataBR(a.fim)}`}>{ROTULO_AUSENCIA[a.tipo ?? "FERIAS"] ?? "Férias"} · {(nome.get(String(a.recurso_id)) ?? "").split(" ")[0]}</div>))}
              {lista.slice(0, lista.length > MAX_NO_DIA ? MAX_NO_DIA - 1 : MAX_NO_DIA).map(item)}
              {lista.length > MAX_NO_DIA && <button type="button" className="cal-mais" onClick={() => setAberto(d)}>Mais {lista.length - (MAX_NO_DIA - 1)}</button>}
            </div>)
        })}
      </div>
      {resumo && <ResumoDia d={resumo.d} pos={resumo} refEl={balaoRef} lista={porDia.get(resumo.d) ?? []} esp={diaEsp.get(resumo.d)}
        ferias={ausencias.filter((a) => String(a.inicio).slice(0, 10) <= resumo.d && String(a.fim).slice(0, 10) >= resumo.d)} prazos={prazosDia.get(resumo.d) ?? []}
        clienteOS={clienteOS} tpe={tpe} cor={cor} nome={nome} aoFechar={() => setResumo(null)} />}
      {dicaDia.elemento}
      <div className="card execucao-card"><ExecucaoMes entradas={entradas} mes={mes} tpes={tpes} recursos={recursos.filter((r: any) => !ocultos.has(String(r.id)))} cor={cor} naoUteis={naoUteisMes} /></div>
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

/** Balão flutuante com o resumo do dia: horas por projetista, apontamentos e o que foi feito. */
function ResumoDia({ d, pos, refEl, lista, esp, ferias, prazos, clienteOS, tpe, cor, nome, aoFechar }: {
  d: string; pos: { x: number; y: number }; refEl: RefObject<HTMLDivElement>; lista: EntradaCal[]; esp: any; ferias: Ausencia[]; prazos: number[]
  clienteOS: Map<number, string>; tpe: Map<any, any>; cor: Map<string, string>; nome: Map<string, string>; aoFechar: () => void
}) {
  const total = lista.reduce((s, e) => s + Number(e.horas_totais), 0)
  const extras = lista.reduce((s, e) => s + Number(e.horas_extras), 0)
  const porProj = new Map<string, number>()
  for (const e of lista) porProj.set(String(e.recurso_id), (porProj.get(String(e.recurso_id)) ?? 0) + Number(e.horas_totais))
  const sem = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][new Date(`${d}T12:00:00Z`).getUTCDay()]
  return (
    <div ref={refEl} className="cal-balao" role="dialog" aria-label={`Resumo de ${dataBR(d)}`} style={{ left: pos.x, top: pos.y }}>
      <div className="cal-balao-topo">
        <div><strong>{dataBR(d)}</strong> <span className="muted small">{sem}</span></div>
        <button type="button" className="btn fantasma pequeno" onClick={aoFechar} aria-label="Fechar"><Icone n="fechar" /></button>
      </div>
      {esp && <div className={`cal-esp ${esp.tipo ?? 'FERIADO'}`}>{ROT_DIA[esp.tipo ?? 'FERIADO']}: {esp.descricao}</div>}
      {ferias.map((a, k) => <div key={k} className="cal-ferias" style={{ borderLeftColor: cor.get(String(a.recurso_id)) }}>{ROTULO_AUSENCIA[a.tipo ?? 'FERIAS'] ?? 'Férias'} · {nome.get(String(a.recurso_id))}</div>)}
      {prazos.map((os) => <div key={os} className="cal-os">Prazo final: OS {osBR(os)}{clienteOS.get(os) ? ` · ${clienteOS.get(os)}` : ''}</div>)}
      {lista.length === 0 ? <p className="muted small" style={{ margin: '6px 0 0' }}>Nenhum apontamento neste dia.</p> : (
        <>
          <div className="cal-balao-tot">
            <span><strong>{hm(total)}</strong> em {lista.length} apontamento(s){extras > 0.0001 ? <> · <span className="ind-he">{hm(extras)} extra</span></> : null}</span>
          </div>
          <div className="cal-balao-proj">
            {[...porProj.entries()].sort((a, b) => b[1] - a[1]).map(([id, h]) => (
              <span key={id}><span className="cal-ponto" style={{ background: cor.get(id) ?? '#6b7079' }} />{nome.get(id) ?? '—'} <strong>{hm(h)}</strong></span>))}
          </div>
          <ul className="cal-balao-lista">
            {lista.map((e) => {
              const t: any = tpe.get(e.tpe_id)
              return (
                <li key={e.id} style={{ borderLeftColor: cor.get(String(e.recurso_id)) ?? '#6b7079' }}>
                  <div className="lin1"><span className="mono">{e.hora_inicio.slice(0, 5)}–{e.hora_fim.slice(0, 5)}</span> <strong>{e.tpe_codigo}</strong>{t?.os != null && <span className="muted small"> · OS {osBR(t.os)}</span>}<span className="dur">{hm(Number(e.horas_totais))}</span></div>
                  <div className="small muted">{e.recurso_nome ?? nome.get(String(e.recurso_id))}{e.grupo ? ` · ${e.grupo}` : ''}</div>
                  <div className="small">{e.descricao ? e.descricao : <span className="muted">{t?.descricao ? `TPE: ${t.descricao}` : 'Sem descrição.'}</span>}</div>
                </li>)
            })}
          </ul>
        </>)}
    </div>)
}
