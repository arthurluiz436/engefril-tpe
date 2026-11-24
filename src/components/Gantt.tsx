import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dataBR, diasEntre, hojeISO, osBR, somaDias } from '../lib/formato'
import { cargaDiaria, clarear, corRecurso, diasDeAusencia, ehDiaUtil, ROTULO_AUSENCIA, type Ausencia } from '../lib/agenda'

/**
 * Cronograma (Gantt) da equipe, uma faixa por projetista (swimlane) na cor dele.
 * Cada tarefa tem duas barras: PLANEJADO (início → prazo, ◆ no prazo) e REALIZADO
 * (1º apontamento → finalização, ou até hoje). Depois do prazo, hachura vermelha.
 * Leitura: linhas zebradas, fins de semana/feriados sombreados, linha de hoje,
 * setas de predecessora (tracejadas na cor do outro projetista quando a tarefa passa
 * de uma pessoa para outra) e marcação de sobrecarga (2+ tarefas no mesmo dia).
 */

export interface GanttProps {
  tpes: any[]
  recursos: any[]
  feriados?: Set<string>
  /** Ordem ainda não salva de um projetista (pré-visualização da tela de sequência). */
  ordem?: { recurso: string; ids: number[] }
  /** Datas ainda não salvas (pré-visualização da reprogramação). */
  datas?: Map<number, { data_inicio: string | null; prazo: string | null }>
  destaque?: string
  aoEscolher?: (recursoId: string) => void
  /** Mostra só estes projetistas. */
  somente?: string | string[]
  diasAntes?: number
  /** Largura de cada dia em px, ou 'ajustar' para caber na largura disponível. */
  pxDia?: number | 'ajustar'
  mostrarConcluidas?: boolean
  mostrarSetas?: boolean
  mostrarCarga?: boolean
  filtroOS?: number | null
  selecionada?: number | null
  aoSelecionar?: (t: any) => void
  /** Largura da coluna de nomes. */
  rotulo?: number
  /** férias/ausências: sombreadas na faixa do projetista e fora da carga */
  ausencias?: Ausencia[]
  /** prazo final de cada O.S. (Supervisor); no projetista vem em t.os_prazo_final */
  prazosOS?: Map<number, string>
}

const H_PISTA = 32, H_LINHA = 28, H_CARGA = 18, H_EIXO = 50
const SEM_AUSENCIAS: Ausencia[] = []
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : null)
const maior = (a: string, b?: string | null) => (b && b > a ? b : a)
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

type Linha =
  | { tipo: 'pista'; y: number; h: number; pista: Pista }
  | { tipo: 'tarefa'; y: number; h: number; pista: Pista; t: any; rot: string; feita: boolean; zebra: boolean }
  | { tipo: 'carga'; y: number; h: number; pista: Pista }
interface Pista { id: string; nome: string; cor: string; abertas: any[]; concluidas: any[]; carga: Map<string, any[]>; sobre: Set<string>; ausente: Set<string> }

export default function Gantt(p: GanttProps) {
  const { tpes, recursos, feriados = new Set<string>(), ordem, datas, destaque, aoEscolher, diasAntes = 15, pxDia = 'ajustar',
    mostrarConcluidas = true, mostrarSetas = true, mostrarCarga = false, filtroOS = null, selecionada, aoSelecionar, ausencias = SEM_AUSENCIAS, prazosOS } = p
  const ROT = p.rotulo ?? 206
  const somente = p.somente == null ? null : new Set(Array.isArray(p.somente) ? p.somente : [p.somente])
  const hoje = hojeISO()
  const trilhaRef = useRef<HTMLDivElement>(null)
  const [larguraMedida, setLarguraMedida] = useState(600)

  const d = useMemo(() => {
    const ini = somaDias(hoje, -diasAntes)
    const comDatas = (t: any) => {
      const o = datas?.get(t.id)
      return o ? { ...t, data_inicio: o.data_inicio, prazo: o.prazo } : t
    }
    const base = tpes.filter((t: any) => !t.arquivada && (filtroOS == null || t.os === filtroOS)).map(comDatas)
    const porId = new Map(base.map((t: any) => [t.id, t]))
    const pistas: Pista[] = recursos
      .map((r: any, i: number) => ({ r, cor: corRecurso(r, i) }))
      .filter(({ r }) => !somente || somente.has(String(r.id)))
      .map(({ r, cor }) => {
        const id = String(r.id)
        let abertas = base.filter((t: any) => String(t.responsavel_id) === id && t.status !== 'FINALIZADA')
        if (ordem && ordem.recurso === id) {
          const pos = new Map(ordem.ids.map((x, i) => [x, i]))
          abertas = [...abertas].sort((a, b) => (pos.get(a.id) ?? 9999) - (pos.get(b.id) ?? 9999))
        } else abertas = [...abertas].sort((a, b) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999))
        const concluidas = !mostrarConcluidas ? [] : base
          .filter((t: any) => String(t.responsavel_id) === id && t.status === 'FINALIZADA' && iso(t.data_fim) && iso(t.data_fim)! >= ini)
          .sort((a, b) => String(a.data_fim).localeCompare(String(b.data_fim)))
        // carga: tarefas em aberto pelo período planejado (atrasadas até hoje); passagem no mesmo dia não é sobrecarga
        const ausente = diasDeAusencia(ausencias, id)
        const { carga, sobre } = cargaDiaria(abertas, new Set([...feriados, ...ausente]), hoje, ini)
        return { id, nome: r.nome as string, cor, abertas, concluidas, carga, sobre, ausente }
      })
      .filter((pi) => pi.abertas.length || pi.concluidas.length || pi.id === destaque)
    let fim = hoje
    for (const pi of pistas) for (const t of [...pi.abertas, ...pi.concluidas]) { fim = maior(fim, iso(t.prazo)); fim = maior(fim, iso(t.data_fim)) }
    fim = somaDias(fim, 3)
    const dias = diasEntre(ini, fim) + 1
    // linhas com posição vertical fixa (permite desenhar as setas entre faixas)
    const linhas: Linha[] = []
    let y = 0
    const linhaDe = new Map<number, Extract<Linha, { tipo: 'tarefa' }>>()
    const donoDe = new Map<number, Pista>()
    for (const pi of pistas) {
      linhas.push({ tipo: 'pista', y, h: H_PISTA, pista: pi }); y += H_PISTA
      const itens = [...pi.abertas.map((t, i) => ({ t, rot: String(i + 1), feita: false })), ...pi.concluidas.map((t) => ({ t, rot: '✓', feita: true }))]
      itens.forEach((it, k) => {
        const l = { tipo: 'tarefa' as const, y, h: H_LINHA, pista: pi, t: it.t, rot: it.rot, feita: it.feita, zebra: k % 2 === 1 }
        linhas.push(l); linhaDe.set(it.t.id, l); donoDe.set(it.t.id, pi); y += H_LINHA
      })
      if (mostrarCarga && pi.carga.size) { linhas.push({ tipo: 'carga', y, h: H_CARGA, pista: pi }); y += H_CARGA }
    }
    // faixa vertical de cada projetista (para sombrear as férias)
    const faixa = new Map<string, { y0: number; y1: number }>()
    for (const l of linhas) { const f = faixa.get(l.pista.id); faixa.set(l.pista.id, { y0: f ? f.y0 : l.y, y1: l.y + l.h }) }
    // prazos finais das O.S. das tarefas em aberto mostradas
    const prazos = new Map<string, Set<number>>()
    for (const pi of pistas) for (const t of pi.abertas) {
      const pz = iso(t.os_prazo_final ?? prazosOS?.get(t.os))
      if (pz && pz >= ini && pz <= fim) prazos.set(pz, new Set([...(prazos.get(pz) ?? []), t.os]))
    }
    return { ini, fim, dias, pistas, linhas, altura: y, linhaDe, donoDe, porId, faixa, prazos }
  }, [tpes, recursos, feriados, ordem, datas, destaque, somente && [...somente].join(','), diasAntes, mostrarConcluidas, mostrarCarga, filtroOS, hoje, ausencias, prazosOS]) // eslint-disable-line react-hooks/exhaustive-deps

  const { ini, fim, dias, pistas, linhas, altura, linhaDe, donoDe, porId, faixa, prazos } = d
  const temPistas = pistas.length > 0
  useLayoutEffect(() => {
    const el = trilhaRef.current
    if (!el) return
    const medir = () => setLarguraMedida(Math.max(280, el.clientWidth))
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [temPistas, pxDia])
  const W = pxDia === 'ajustar' ? larguraMedida : Math.max(280, dias * pxDia)
  const dx = W / dias
  const X = (dia: string) => diasEntre(ini, dia) * dx
  const recorta = (a: string, b: string) => {
    if (b < ini || a > fim) return null
    const x0 = X(a < ini ? ini : a), x1 = X(somaDias(b > fim ? fim : b, 1))
    return { x: x0, w: Math.max(x1 - x0, 3) }
  }

  // eixo: meses, dias (quando há espaço) ou segundas-feiras
  const eixo = useMemo(() => {
    const meses: { d: string; rot: string }[] = [], marcas: { d: string; rot: string; fds: boolean }[] = [], naoUteis: string[] = [], semanas: string[] = []
    for (let i = 0; i < dias; i++) {
      const x = somaDias(ini, i), w = new Date(`${x}T12:00:00Z`).getUTCDay()
      if (i === 0 || x.endsWith('-01')) meses.push({ d: x, rot: `${MES[Number(x.slice(5, 7)) - 1]}/${x.slice(2, 4)}` })
      if (!ehDiaUtil(x, feriados)) naoUteis.push(x)
      if (w === 1) semanas.push(x)
      if (dx >= 18) marcas.push({ d: x, rot: String(Number(x.slice(8, 10))), fds: !ehDiaUtil(x, feriados) })
      else if (dx >= 5 && w === 1) marcas.push({ d: x, rot: dataBR(x).slice(0, 5), fds: false })
    }
    return { meses, marcas, naoUteis, semanas }
  }, [ini, dias, dx, feriados])

  if (!pistas.length) return <div className="vazio small">Nenhuma tarefa ativa ou concluída nos últimos {diasAntes} dias.</div>

  const xHoje = X(hoje) + dx / 2
  const cores = [...new Set([...pistas.map((pi) => pi.cor), '#6b7079'])]
  const idCor = (c: string) => `seta-${c.replace(/[^0-9a-z]/gi, '')}`

  // setas de predecessora (fim da predecessora → início da sucessora)
  const setas: { de: any; para: any; cruza: boolean; cor: string; path: string; dica: string }[] = []
  if (mostrarSetas) for (const l of linhas) {
    if (l.tipo !== 'tarefa' || !l.t.predecessora_id) continue
    const lp = linhaDe.get(l.t.predecessora_id)
    if (!lp) continue
    const pr = lp.t, su = l.t
    const fimP = iso(pr.prazo) ?? iso(pr.data_fim) ?? iso(pr.ultimo_apontamento) ?? iso(pr.data_inicio)
    const iniS = iso(su.data_inicio) ?? iso(su.primeiro_apontamento) ?? iso(su.prazo)
    if (!fimP || !iniS) continue
    const xs = Math.min(W, Math.max(0, X(somaDias(fimP, 1)))), xt = Math.min(W, Math.max(0, X(iniS)))
    const ys = lp.y + 8, yt = l.y + 8
    const desce = yt > ys
    let path: string
    if (xt >= xs + 14) path = `M${xs},${ys} H${xs + 7} V${yt} H${xt - 1}`
    else {
      const yMeio = desce ? l.y - 1 : l.y + l.h + 1
      path = `M${xs},${ys} H${xs + 7} V${yMeio} H${Math.max(2, xt - 9)} V${yt} H${xt - 1}`
    }
    const cruza = donoDe.get(pr.id)?.id !== donoDe.get(su.id)?.id
    const cor = cruza ? donoDe.get(pr.id)!.cor : '#6b7079'
    setas.push({ de: pr, para: su, cruza, cor, path,
      dica: cruza ? `${pr.codigo} (${donoDe.get(pr.id)!.nome}) → ${su.codigo} (${donoDe.get(su.id)!.nome}): quando ${pr.codigo} for iniciada, ${su.codigo} pode começar` : `${su.codigo} depende de ${pr.codigo}` })
  }

  const conteudoTarefa = (l: Extract<Linha, { tipo: 'tarefa' }>) => {
    const t = l.t, cor = l.pista.cor
    const prazo = iso(t.prazo)
    const iniPlan = iso(t.data_inicio) ?? iso(t.primeiro_apontamento)
    const iniReal = iso(t.primeiro_apontamento) ?? (t.status === 'EM ANDAMENTO' ? iso(t.data_inicio) : null)
    const fimReal = iso(t.data_fim) ?? (t.status === 'EM ANDAMENTO' ? hoje : iso(t.ultimo_apontamento))
    const fimEfetivo = iso(t.data_fim) ?? hoje
    const atraso = prazo && fimEfetivo > prazo ? diasEntre(prazo, fimEfetivo) : 0
    const plan = iniPlan && prazo ? recorta(iniPlan, prazo) : null
    const real = iniReal && fimReal ? recorta(iniReal, prazo && fimReal > prazo ? prazo : fimReal) : null
    const realTarde = iniReal && fimReal && prazo && fimReal > prazo ? recorta(maior(somaDias(prazo, 1), iniReal), fimReal) : null
    const lacuna = atraso && prazo ? recorta(somaDias(prazo, 1), fimEfetivo) : null
    const pred = t.predecessora_id ? porId.get(t.predecessora_id) : null
    const dica = [
      `${t.codigo} · ${t.grupo ?? ''}`, t.descricao,
      t.os != null ? `O.S. ${osBR(t.os)}${t.cliente ? ` · ${t.cliente}` : ''}` : '',
      `Planejado: ${dataBR(iniPlan)} → ${dataBR(prazo)}`,
      `Realizado: ${iniReal ? `${dataBR(iniReal)} → ${l.feita ? dataBR(fimReal) : t.status === 'EM ANDAMENTO' ? 'em andamento' : `último registro ${dataBR(fimReal)}`}` : 'sem apontamentos'}`,
      atraso ? `${l.feita ? 'Concluída' : 'Está'} ${plural(atraso, 'dia', 'dias')} após o prazo` : prazo ? (l.feita ? 'Concluída no prazo' : 'Dentro do prazo') : 'Sem prazo definido',
      pred ? `Predecessora: ${pred.codigo}` : '',
    ].filter(Boolean).join('\n')
    const y = l.y
    return (
      <g key={`t${t.id}`} className={`g2-tarefa ${l.feita ? 'feita' : ''}`} onClick={aoSelecionar ? () => aoSelecionar(t) : undefined} style={aoSelecionar ? { cursor: 'pointer' } : undefined}>
        <title>{dica}</title>
        <rect x={0} y={y} width={W} height={l.h} fill="transparent" />
        {lacuna && <rect x={lacuna.x} y={y + 2} width={lacuna.w} height={l.h - 4} fill="url(#g2-hachura-leve)" rx={3} />}
        {plan && <rect x={plan.x} y={y + 5} width={plan.w} height={8} rx={3} fill={clarear(cor, 0.72)} stroke={clarear(cor, 0.35)} strokeWidth={1} />}
        {real && <rect x={real.x} y={y + 15} width={real.w} height={8} rx={3} fill={l.feita ? clarear(cor, 0.25) : cor} />}
        {realTarde && <rect x={realTarde.x} y={y + 15} width={realTarde.w} height={8} rx={3} fill="url(#g2-hachura)" />}
        {prazo && prazo >= ini && prazo <= fim && (
          <rect x={X(somaDias(prazo, 1)) - 5} y={y + 4} width={9} height={9} transform={`rotate(45 ${X(somaDias(prazo, 1))} ${y + 8.5})`}
            fill={atraso && !l.feita ? 'var(--vermelho)' : 'var(--grafite-900)'} />
        )}
        {!prazo && <text x={6} y={y + 18} className="g2-semprazo">sem prazo</text>}
      </g>
    )
  }

  return (
    <div className="gantt2">
      <div className="gantt-legenda small">
        <span><i className="lg plan" /> Planejado</span>
        <span><i className="lg prazo" /> Prazo</span>
        <span><i className="lg real" /> Realizado</span>
        <span><i className="lg atraso" /> Após o prazo</span>
        <span><i className="lg sobrecarga" /> 2+ tarefas no mesmo dia</span>
        {mostrarSetas && <span><i className="lg seta" /> Predecessora <i className="lg seta-outro" /> passa para outro projetista</span>}
        {prazos.size > 0 && <span><i className="lg prazo-os" /> Prazo final da O.S.</span>}
        {ausencias.length > 0 && <span><i className="lg ferias" /> Férias (na cor de cada projetista)</span>}
        <span><i className="lg hoje" /> Hoje</span>
      </div>
      <div className={`g2-rolagem ${pxDia === 'ajustar' ? '' : 'rola'}`}>
        <div className="g2-grade" style={{ gridTemplateColumns: `${ROT}px ${pxDia === 'ajustar' ? 'minmax(0, 1fr)' : `${W}px`}` }}>
          <div className="g2-cab-rot small">Projetista · TPE</div>
          <div className="g2-eixo" ref={trilhaRef} style={{ height: H_EIXO }}>
            {eixo.meses.map((m) => <span key={m.d} className="g2-mes" style={{ left: X(m.d) }}>{m.rot}</span>)}
            {eixo.marcas.map((m) => <span key={m.d} className={`g2-dia ${m.fds ? 'fds' : ''}`} style={{ left: X(m.d) + dx / 2 }}>{m.rot}</span>)}
            {dx >= 18 && eixo.marcas.map((m) => <span key={`s${m.d}`} className="g2-sem" style={{ left: X(m.d) + dx / 2 }}>{SEM[new Date(`${m.d}T12:00:00Z`).getUTCDay()]}</span>)}
            {[...prazos.entries()].map(([d, oss]) => (
              <span key={`os${d}`} className="g2-os-rot" style={{ left: X(somaDias(d, 1)) }}
                title={`Prazo final da${oss.size > 1 ? 's' : ''} O.S. ${[...oss].map(osBR).join(', ')}: ${dataBR(d)}`}>
                OS {[...oss].map((o) => osBR(o)).join(' · ')}</span>))}
            {hoje >= ini && hoje <= fim && <span className="g2-hoje-rot" style={{ left: xHoje }}>Hoje</span>}
          </div>
          <div className="g2-rotulos" style={{ height: altura }}>
            {linhas.map((l) => {
              if (l.tipo === 'pista') {
                const pi = l.pista
                const atrasadas = pi.abertas.filter((t) => t.prazo && iso(t.prazo)! < hoje).length
                const sobre = pi.sobre.size
                const cab = <>
                  <span className="g2-ponto" style={{ background: pi.cor }} />
                  <strong>{pi.nome}</strong>
                  <span className="muted small">{pi.abertas.length} em aberto{atrasadas > 0 && <> · <span className="texto-atraso">{atrasadas} atras.</span></>}{sobre > 0 && <> · <span className="texto-atraso" title="Dias úteis com 2 ou mais tarefas planejadas ao mesmo tempo">{sobre} d sobrecarga</span></>}</span>
                </>
                return (
                  <div key={`p${pi.id}`} className={`g2-rot-pista ${pi.id === destaque ? 'destaque' : ''}`} style={{ top: l.y, height: l.h, borderLeftColor: pi.cor, background: clarear(pi.cor, 0.9) }}>
                    {aoEscolher ? <button type="button" onClick={() => aoEscolher(pi.id)} title="Ver a sequência deste projetista">{cab}</button> : <div>{cab}</div>}
                  </div>)
              }
              if (l.tipo === 'carga') return <div key={`c${l.pista.id}`} className="g2-rot-carga small muted" style={{ top: l.y, height: l.h, borderLeftColor: l.pista.cor }}>tarefas/dia</div>
              const t = l.t, pred = t.predecessora_id ? porId.get(t.predecessora_id) : null
              const donoPred = pred ? (donoDe.get(pred.id) ?? pistas.find((pi) => String(pred.responsavel_id) === pi.id)) : null
              const outro = pred && donoPred && donoPred.id !== l.pista.id
              const atrasada = !l.feita && t.prazo && iso(t.prazo)! < hoje
              return (
                <div key={`r${t.id}`} className={`g2-rot-tarefa ${l.zebra ? 'zebra' : ''} ${selecionada === t.id ? 'sel' : ''} ${l.feita ? 'feita' : ''}`}
                  style={{ top: l.y, height: l.h, borderLeftColor: l.pista.cor }} title={`${t.codigo} · O.S. ${osBR(t.os)}${t.cliente ? ` · ${t.cliente}` : ''}
${t.descricao ?? ''}`}
                  onClick={aoSelecionar ? () => aoSelecionar(t) : undefined}>
                  <span className={`gantt-n ${atrasada ? 'atrasada' : ''} ${l.feita ? 'ok' : ''}`}>{l.rot}</span>
                  <span className="gantt-cod">{t.codigo}</span>
                  {t.os != null && <span className="g2-os" title={`O.S. ${osBR(t.os)}${t.cliente ? ` · ${t.cliente}` : ''}`}>OS {osBR(t.os)}</span>}
                  {outro && <span className="g2-passa" style={{ borderColor: donoPred!.cor, color: donoPred!.cor }} title={`Depende de ${pred.codigo}, feita por ${donoPred!.nome}`}>←{String(pred.codigo).replace('TPE-', '')}</span>}
                </div>)
            })}
          </div>
          <div className="g2-trilha" style={{ height: altura }}>
            <svg width={W} height={altura} role="img" aria-label="Cronograma das tarefas por projetista">
              <defs>
                <pattern id="g2-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--vermelho)" /><rect x="3" width="3" height="6" fill="#e9877e" /></pattern>
                {pistas.map((pi) => (
                  <pattern key={`pf${pi.id}`} id={`g2-ferias-${pi.id}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="10" height="10" fill={clarear(pi.cor, 0.9)} /><rect width="4" height="10" fill={clarear(pi.cor, 0.7)} />
                  </pattern>))}
                <pattern id="g2-hachura-leve" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="rgba(180,35,24,.16)" /></pattern>
                {cores.map((c) => <marker key={c} id={idCor(c)} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>)}
              </defs>
              {/* faixas e zebra */}
              {linhas.map((l) => l.tipo === 'pista'
                ? <rect key={`bp${l.pista.id}`} x={0} y={l.y} width={W} height={l.h} fill={clarear(l.pista.cor, 0.93)} />
                : l.tipo === 'carga' ? <rect key={`bc${l.pista.id}`} x={0} y={l.y} width={W} height={l.h} fill="#fafbfc" />
                : <rect key={`bt${l.t.id}`} x={0} y={l.y} width={W} height={l.h} fill={selecionada === l.t.id ? 'rgba(4,74,179,.10)' : l.zebra ? '#f6f7f9' : '#fff'} />)}
              {/* fins de semana e feriados */}
              {eixo.naoUteis.map((x) => <rect key={`n${x}`} x={X(x)} y={0} width={dx} height={altura} fill="rgba(72,74,78,.06)" />)}
              {eixo.meses.filter((m) => m.d.endsWith('-01')).map((m) => <line key={`m${m.d}`} x1={X(m.d)} x2={X(m.d)} y1={0} y2={altura} stroke="rgba(72,74,78,.35)" strokeWidth={1.5} />)}
              {/* grade semanal e divisórias */}
              {eixo.semanas.map((x) => <line key={`s${x}`} x1={X(x)} x2={X(x)} y1={0} y2={altura} stroke="#e6e8ec" />)}
              {linhas.map((l) => <line key={`h${l.tipo}${l.tipo === 'tarefa' ? l.t.id : l.pista.id}`} x1={0} x2={W} y1={l.y + l.h - 0.5} y2={l.y + l.h - 0.5} stroke={l.tipo === 'tarefa' ? '#eef0f3' : '#dfe2e7'} />)}
              {/* sobrecarga na faixa do projetista */}
              {linhas.map((l) => l.tipo !== 'pista' ? null : (
                <Fragment key={`sc${l.pista.id}`}>
                  {[...l.pista.carga.entries()].filter(([x]) => l.pista.sobre.has(x) && x >= ini && x <= fim).map(([x, v]) => (
                    <rect key={x} x={X(x) + 1} y={l.y + l.h - 7} width={Math.max(2, dx - 2)} height={5} rx={2} fill="var(--vermelho)" opacity={0.75}>
                      <title>{`${dataBR(x)}: ${v.length} tarefas ao mesmo tempo (${v.map((t) => t.codigo).join(', ')})`}</title>
                    </rect>))}
                </Fragment>))}
              {/* linha de carga diária */}
              {linhas.map((l) => l.tipo !== 'carga' ? null : (
                <Fragment key={`cg${l.pista.id}`}>
                  {[...l.pista.carga.entries()].filter(([x]) => x >= ini && x <= fim).map(([x, v]) => (
                    <g key={x}>
                      <rect x={X(x) + 1} y={l.y + 3} width={Math.max(2, dx - 2)} height={l.h - 6} rx={2} fill={l.pista.sobre.has(x) ? "var(--vermelho)" : clarear(l.pista.cor, 0.55)} opacity={l.pista.sobre.has(x) ? 0.85 : 1}>
                        <title>{`${dataBR(x)}: ${v.length} tarefa(s)${v.length > 1 && !l.pista.sobre.has(x) ? " (troca: uma termina e outra começa)" : ""} — ${v.map((t) => t.codigo).join(', ')}`}</title>
                      </rect>
                      {dx >= 14 && <text x={X(x) + dx / 2} y={l.y + l.h / 2 + 4} textAnchor="middle" className="g2-carga-n" fill={l.pista.sobre.has(x) ? "#fff" : "var(--grafite-900)"}>{v.length}</text>}
                    </g>))}
                </Fragment>))}
              {/* férias / ausências na faixa do projetista */}
              {pistas.map((pi) => ausencias.filter((a) => String(a.recurso_id) === pi.id).map((a, k) => {
                const r = recorta(String(a.inicio).slice(0, 10), String(a.fim).slice(0, 10)); const fx = faixa.get(pi.id)
                if (!r || !fx) return null
                return (
                  <g key={`f${pi.id}-${k}`}>
                    <rect x={r.x} y={fx.y0} width={r.w} height={fx.y1 - fx.y0} fill={`url(#g2-ferias-${pi.id})`} opacity={0.85} />
                    <rect x={r.x} y={fx.y0} width={r.w} height={fx.y1 - fx.y0} fill="none" stroke={pi.cor} strokeOpacity={0.45} strokeDasharray="4 3" />
                    <title>{`${ROTULO_AUSENCIA[a.tipo ?? 'FERIAS'] ?? 'Férias'} de ${pi.nome}: ${dataBR(a.inicio)} a ${dataBR(a.fim)}${a.observacao ? ` (${a.observacao})` : ''}. Esses dias não contam na duração das tarefas.`}</title>
                    {r.w > 46 && <text x={r.x + r.w / 2} y={fx.y0 + 20} textAnchor="middle" className="g2-ferias-rot" style={{ fill: pi.cor }}>{ROTULO_AUSENCIA[a.tipo ?? 'FERIAS'] ?? 'Férias'}</text>}
                  </g>)
              }))}
              {/* prazo final das O.S. (linha discreta) */}
              {[...prazos.keys()].map((d) => <line key={`os${d}`} x1={X(somaDias(d, 1))} x2={X(somaDias(d, 1))} y1={0} y2={altura} stroke="#8a9099" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />)}
              {linhas.map((l) => l.tipo === 'tarefa' ? conteudoTarefa(l) : null)}
              {setas.map((s, i) => (
                <path key={i} d={s.path} fill="none" stroke={s.cor} strokeWidth={s.cruza ? 1.8 : 1.4} strokeDasharray={s.cruza ? '5 3' : undefined}
                  markerEnd={`url(#${idCor(s.cor)})`} opacity={0.9}><title>{s.dica}</title></path>))}
              {hoje >= ini && hoje <= fim && <line x1={xHoje} x2={xHoje} y1={0} y2={altura} stroke="var(--dourado)" strokeWidth={2} />}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
