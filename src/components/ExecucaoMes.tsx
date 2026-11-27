import { useEffect, useMemo, useRef, useState } from 'react'
import { dataBR, hm, hojeISO, osBR } from '../lib/formato'
import { clarear, ROTULO_AUSENCIA, type Ausencia } from '../lib/agenda'
import { Icone } from './ui'
import { CartaoTpe, situacaoTpe, useDica } from './Dica'
import type { EntradaCal } from './Calendario'

/**
 * Execução do mês: o que cada projetista realmente fez, dia a dia, pelos apontamentos.
 * Uma linha por TPE em escada (pela ordem em que foi feita); cada dia com horas é um quadradinho.
 * Setas em ângulo reto ligam a TPE original à reabertura (.1, .2…). Não é o cronograma (planejado).
 */
interface Props {
  entradas: EntradaCal[]
  mes: string // 'AAAA-MM'
  tpes: any[]
  recursos: any[]           // só os visíveis, na ordem da legenda
  cor: Map<string, string>  // id do recurso → cor
  naoUteis: Set<string>     // fins de semana são calculados; aqui feriados/dias sem expediente
  ausencias?: Ausencia[]
  aoMudarMes?: (mes: string) => void
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const moverMes = (mes: string, d: number) => { const [a, m] = mes.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}` }

const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const ROT = 270, H_CAB = 46, H_PISTA = 32, H_LIN = 26, TAM = 16
interface Linha { cod: string; rec: string; nome: string; dias: { dia: string; h: number; he: number; txt: string[] }[]; ini: number; fim: number; h: number; he: number; y: number; t: any }

export default function ExecucaoMes({ entradas, mes, tpes, recursos, cor, naoUteis, ausencias = [], aoMudarMes }: Props) {
  const dica = useDica()
  // a largura de cada dia acompanha o espaço disponível (sem rolagem quando cabe)
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(1100)
  useEffect(() => {
    const el = caixa.current; if (!el) return
    const ro = new ResizeObserver(() => setLargura(el.clientWidth))
    ro.observe(el); setLargura(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const [ano, m] = mes.split('-').map(Number)
  const nDias = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const DX = Math.max(22, Math.min(46, (largura - ROT - 14) / nDias))
  const hoje = hojeISO()
  const diaIso = (d: number) => `${mes}-${String(d).padStart(2, '0')}`
  const dow = (d: number) => new Date(Date.UTC(ano, m - 1, d)).getUTCDay()
  const folga = (d: number) => dow(d) === 0 || dow(d) === 6 || naoUteis.has(diaIso(d))
  const porId = useMemo(() => new Map(tpes.map((t: any) => [t.id, t])), [tpes])
  const porCodigo = useMemo(() => new Map(tpes.map((t: any) => [t.codigo, t])), [tpes])

  const feriasMes = useMemo(() => {
    const ini = `${mes}-01`, fim = `${mes}-${String(nDias).padStart(2, '0')}`
    const r = new Map<string, { a: number; b: number; tipo: string }[]>()
    for (const x of ausencias) {
      const a = String(x.inicio).slice(0, 10), b = String(x.fim).slice(0, 10)
      if (b < ini || a > fim) continue
      const id = String(x.recurso_id)
      r.set(id, [...(r.get(id) ?? []), { a: a < ini ? 1 : Number(a.slice(8, 10)), b: b > fim ? nDias : Number(b.slice(8, 10)), tipo: x.tipo ?? 'FERIAS' }])
    }
    return r
  }, [ausencias, mes, nDias])

  const { faixas, altura, posicoes, osMes, total } = useMemo(() => {
    const doMes = entradas.filter((e) => String(e.dia).slice(0, 7) === mes)
    const visiveis = new Set(recursos.map((r: any) => String(r.id)))
    let y = H_CAB
    const posicoes = new Map<string, { xIni: number; xFim: number; y: number; l: Linha }>()
    const faixas = recursos.map((r: any) => {
      const id = String(r.id)
      const porTpe = new Map<string, Linha>()
      for (const e of doMes) {
        if (String(e.recurso_id) !== id) continue
        const d = Number(String(e.dia).slice(8, 10))
        const t = porId.get(e.tpe_id) ?? porCodigo.get(e.tpe_codigo) ?? { codigo: e.tpe_codigo, grupo: e.grupo }
        const l: Linha = porTpe.get(e.tpe_codigo) ?? { cod: e.tpe_codigo, rec: id, nome: r.nome, dias: [], ini: d, fim: d, h: 0, he: 0, y: 0, t }
        const dd = l.dias.find((x) => x.dia === String(e.dia).slice(0, 10))
        if (dd) { dd.h += Number(e.horas_totais); dd.he += Number(e.horas_extras); if (e.descricao) dd.txt.push(e.descricao) }
        else l.dias.push({ dia: String(e.dia).slice(0, 10), h: Number(e.horas_totais), he: Number(e.horas_extras), txt: e.descricao ? [e.descricao] : [] })
        l.ini = Math.min(l.ini, d); l.fim = Math.max(l.fim, d); l.h += Number(e.horas_totais); l.he += Number(e.horas_extras)
        porTpe.set(e.tpe_codigo, l)
      }
      const linhas = [...porTpe.values()].sort((a, b) => a.ini - b.ini || a.fim - b.fim || a.cod.localeCompare(b.cod))
      for (const l of linhas) l.dias.sort((a, b) => a.dia.localeCompare(b.dia))
      const f = { id, nome: r.nome as string, cor: cor.get(id) ?? '#6b7079', y, linhas, fimY: 0 }
      y += H_PISTA
      for (const l of linhas) { l.y = y; y += H_LIN; posicoes.set(l.cod, { xIni: X(l.ini) + (DX - TAM) / 2, xFim: X(l.fim) + (DX + TAM) / 2, y: l.y + H_LIN / 2, l }) }
      y += 6; f.fimY = y
      return f
    })
    // O.S. trabalhadas no mês (só projetistas visíveis)
    const porOS = new Map<number, { os: number; cliente: string; h: number; he: number; ini: string; fim: string; tpes: Set<string>; proj: Map<string, number> }>()
    for (const e of doMes) {
      if (!visiveis.has(String(e.recurso_id))) continue
      const t = porId.get(e.tpe_id) ?? porCodigo.get(e.tpe_codigo)
      if (t?.os == null) continue
      const x = porOS.get(t.os) ?? { os: t.os, cliente: t.cliente ?? '', h: 0, he: 0, ini: '9999', fim: '0000', tpes: new Set(), proj: new Map() }
      const dia = String(e.dia).slice(0, 10)
      x.h += Number(e.horas_totais); x.he += Number(e.horas_extras); x.ini = dia < x.ini ? dia : x.ini; x.fim = dia > x.fim ? dia : x.fim
      x.tpes.add(e.tpe_codigo); x.proj.set(String(e.recurso_id), (x.proj.get(String(e.recurso_id)) ?? 0) + Number(e.horas_totais))
      porOS.set(t.os, x)
    }
    const osMes = [...porOS.values()].sort((a, b) => b.h - a.h)
    return { faixas, altura: y + 4, posicoes, osMes, total: osMes.reduce((s, x) => s + x.h, 0) }
  }, [entradas, mes, recursos, cor, porId, porCodigo, DX]) // eslint-disable-line react-hooks/exhaustive-deps

  function X(d: number) { return ROT + (d - 1) * DX }
  const W = ROT + nDias * DX + 12
  const temFerias = faixas.some((f) => feriasMes.has(f.id))
  const ddmm = (d: number) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  const nomeDe = (id: string) => recursos.find((r: any) => String(r.id) === id)?.nome ?? '—'
  const temDados = faixas.some((f) => f.linhas.length) || temFerias

  const cartao = (l: Linha, f: { cor: string; nome: string }, alvo?: string) => {
    const mm = l.cod.match(/^(TPE-\d+)\.(\d+)$/)
    const orig = mm && mm[2] !== '0' ? posicoes.get(`${mm[1]}.${Number(mm[2]) - 1}`)?.l : null
    const corridos = l.fim - l.ini + 1
    return (
      <CartaoTpe t={{ ...l.t, codigo: l.cod }} cor={f.cor} projetista={f.nome} situacao={l.t?.status ? situacaoTpe(l.t) : null}
        numeros={[
          { rot: 'Período no mês', val: `${String(l.ini).padStart(2, '0')}${l.fim !== l.ini ? `–${String(l.fim).padStart(2, '0')}` : ''}/${String(m).padStart(2, '0')}` },
          { rot: 'Dias com horas', val: `${l.dias.length} de ${corridos}` },
          { rot: 'Horas no mês', val: hm(l.h), sub: l.he > 0.0001 ? <span className="ind-he">{hm(l.he)} extra</span> : undefined },
        ]}
        extra={orig ? <div className="cd-reab">↳ Reabertura de {orig.cod} ({orig.nome.split(' ')[0]}, até {String(orig.fim).padStart(2, '0')}/{String(m).padStart(2, '0')})</div> : null}
        dias={l.dias.map((a) => ({ dia: a.dia, horas: a.h, extras: a.he, texto: a.txt.join('; '), ativo: a.dia === alvo }))} />)
  }

  return (
    <div className="execucao">
      {dica.elemento}
      <div className="ex-topo">
        <h2 style={{ margin: 0 }}>Execução do mês</h2>
        {aoMudarMes && (
          <div className="ex-mes" role="group" aria-label="Trocar de mês">
            <button type="button" className="btn fantasma pequeno" onClick={() => aoMudarMes(moverMes(mes, -1))} aria-label="Mês anterior"><span style={{ transform: 'rotate(-90deg)', display: 'inline-flex' }}><Icone n="cima" /></span></button>
            <strong>{MESES[m - 1]} de {ano}</strong>
            <button type="button" className="btn fantasma pequeno" onClick={() => aoMudarMes(moverMes(mes, 1))} aria-label="Próximo mês"><span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icone n="cima" /></span></button>
          </div>)}
        <span className="muted small" style={{ marginLeft: 'auto' }}>O que cada projetista realmente fez, pelos apontamentos (não é o cronograma planejado). Passe o mouse para ver os detalhes.</span>
      </div>
      <div className="legenda-exec small muted">
        <span><i className="q" />dia com horas (mais escuro = mais horas)</span>
        <span><i className="he" />teve hora extra</span>
        <span><i className="reab" />reabertura vinda da TPE original</span>
        <span><span className="selo-prazo ok">✓</span>concluída no prazo</span>
        <span><span className="selo-prazo antes">−2d</span>concluída antes</span>
        <span><span className="selo-prazo atraso">+3d</span>concluída com atraso</span>
        <span><span className="selo-prazo atraso">!</span>em aberto e atrasada</span>
        <span><i className="fer" />férias / ausência (na cor do projetista)</span>
      </div>
      <div className={`ex-layout ${osMes.length ? "" : "so-grafico"}`}>
      <div ref={caixa} className="ex-grafico">
      {!temDados ? <p className="muted small">Nenhum apontamento neste mês para os projetistas visíveis.</p> : (
        <div className="ex-svg">
          <svg width={W} height={altura} role="img" aria-label="Execução do mês por projetista">
            <defs>
              <pattern id="ex-folga" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(72,74,78,.04)" /><rect width="2.5" height="6" fill="rgba(72,74,78,.11)" /></pattern>
              {faixas.filter((f) => feriasMes.has(f.id)).map((f) => (
                <pattern key={f.id} id={`ex-fer-${f.id}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill={clarear(f.cor, 0.86)} /><rect width="3" height="8" fill={clarear(f.cor, 0.62)} /></pattern>))}
              <marker id="ex-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b42318" /></marker>
            </defs>
            <text x={14} y={30} fontSize={12} fontWeight={600} fill="#6b7079">Projetista · TPE · O.S.</text>
            {Array.from({ length: nDias }, (_, i) => i + 1).map((d) => (
              <g key={d}>
                {folga(d) && <rect x={X(d)} y={H_CAB} width={DX} height={altura - H_CAB} fill="url(#ex-folga)" />}
                <line x1={X(d)} x2={X(d)} y1={H_CAB - 6} y2={altura} stroke="#f0f1f4" />
                <text x={X(d) + DX / 2} y={17} textAnchor="middle" fontSize={10} fill="#8a9099">{SEM[dow(d)]}</text>
                <text x={X(d) + DX / 2} y={34} textAnchor="middle" fontSize={12} fontWeight={diaIso(d) === hoje ? 700 : 500} fill={folga(d) ? '#8a9099' : '#24272b'}>{d}</text>
              </g>))}
            <line x1={0} x2={W} y1={H_CAB} y2={H_CAB} stroke="#dfe2e7" />
            <line x1={ROT} x2={ROT} y1={0} y2={altura} stroke="#dfe2e7" />
            {faixas.map((f) => (
              <g key={f.id}>
                <rect x={0} y={f.y} width={W} height={H_PISTA} fill={clarear(f.cor, 0.9)} />
                {(feriasMes.get(f.id) ?? []).map((v, k) => (
                  <g key={k} onMouseMove={(e) => dica.mostrar(e, <div className="cd-cab" style={{ borderLeftColor: f.cor }}><div className="cd-cod">{ROTULO_AUSENCIA[v.tipo] ?? 'Ausência'} · {f.nome}</div><div className="muted">{ddmm(v.a)}{v.b !== v.a ? ` a ${ddmm(v.b)}` : ''} · {v.b - v.a + 1} dia(s) corrido(s) neste mês</div></div>)} onMouseLeave={dica.esconder}>
                    <rect x={X(v.a)} y={f.y} width={(v.b - v.a + 1) * DX} height={f.fimY - f.y - 6} fill={`url(#ex-fer-${f.id})`} stroke={clarear(f.cor, 0.4)} strokeDasharray="4 3" />
                    <text x={X(v.a) + ((v.b - v.a + 1) * DX) / 2} y={f.y + 20} textAnchor="middle" fontSize={11} fontWeight={700} fill={f.cor}>{(v.b - v.a + 1) * DX > 60 ? (ROTULO_AUSENCIA[v.tipo] ?? 'Ausência') : ''}</text>
                  </g>))}
                <rect x={0} y={f.y} width={4} height={f.fimY - f.y} fill={f.cor} />
                <circle cx={18} cy={f.y + H_PISTA / 2} r={5} fill={f.cor} />
                <text x={30} y={f.y + 20} fontSize={13} fontWeight={700} fill="#24272b">{f.nome}</text>
                <text x={ROT + 8} y={f.y + 20} fontSize={11} fill="#6b7079">{f.linhas.length ? `${f.linhas.length} TPE(s) · ${hm(f.linhas.reduce((s, l) => s + l.h, 0))} no mês` : 'sem apontamentos no mês'}{feriasMes.has(f.id) ? ` · férias ${feriasMes.get(f.id)!.map((v) => v.a === v.b ? ddmm(v.a) : `${ddmm(v.a)}–${ddmm(v.b)}`).join(', ')}` : ''}</text>
                {f.linhas.map((l) => {
                  const cy = l.y + H_LIN / 2
                  const sit = l.t?.status ? situacaoTpe(l.t) : null
                  const selo = sit && (l.t.status === 'FINALIZADA' ? (sit.cls === 'ok' ? '✓' : sit.cls === 'antes' ? `${sit.dias}d` : sit.cls === 'atraso' ? `+${sit.dias}d` : null) : sit.cls === 'atraso' ? '!' : null)
                  const xs = X(l.fim) + (DX + TAM) / 2 + 6
                  return (
                    <g key={l.cod} className="ex-linha" onMouseMove={(e) => dica.mostrar(e, cartao(l, f, (e.target as SVGElement).getAttribute?.('data-dia') ?? undefined))} onMouseLeave={dica.esconder}>
                      <rect className="ex-fundo" x={4} y={l.y} width={W - 4} height={H_LIN} fill="transparent" />
                      <text x={14} y={l.y + 17} fontSize={11.5} fontWeight={700} fill="#24272b">{l.cod}</text>
                      {l.t?.os != null && <g><rect x={94} y={l.y + 5} width={74} height={16} rx={8} fill="#fff" stroke="#8a9099" strokeDasharray="3 2" />
                        <text x={131} y={l.y + 16.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#6b7079">OS {osBR(l.t.os)}</text></g>}
                      <text x={ROT - 8} y={l.y + 17} textAnchor="end" fontSize={11} fontWeight={600} fill="#24272b">{hm(l.h)}</text>
                      <line x1={X(l.ini) + DX / 2} x2={X(l.fim) + DX / 2} y1={cy} y2={cy} stroke={f.cor} strokeWidth={2} strokeOpacity={0.45} />
                      {l.dias.map((a) => {
                        const d = Number(a.dia.slice(8, 10))
                        return (
                          <g key={a.dia}>
                            <rect data-dia={a.dia} x={X(d) + (DX - TAM) / 2} y={cy - TAM / 2} width={TAM} height={TAM} rx={4} fill={f.cor} fillOpacity={0.45 + Math.min(1, a.h / 9) * 0.55} stroke="#fff" strokeWidth={1.5} />
                            {a.he > 0.0001 && <circle cx={X(d) + (DX + TAM) / 2 - 2} cy={cy - TAM / 2 + 2} r={3} fill="#a15c07" stroke="#fff" strokeWidth={1} />}
                          </g>)
                      })}
                      {selo && sit && <g><rect x={xs} y={cy - 8} width={selo.length * 6.4 + 10} height={16} rx={8} className={`ex-selo ${sit.cls}`} />
                        <text x={xs + (selo.length * 6.4 + 10) / 2} y={cy + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} className={`ex-selo-txt ${sit.cls}`}>{selo}</text></g>}
                    </g>)
                })}
              </g>))}
            {[...posicoes].map(([cod, b]) => {
              const mm = cod.match(/^(TPE-\d+)\.(\d+)$/); if (!mm || mm[2] === '0') return null
              const a = posicoes.get(`${mm[1]}.${Number(mm[2]) - 1}`); if (!a) return null
              const xv = Math.min(a.xFim + 10, b.xIni - 10), ly = (a.y + b.y) / 2
              return (
                <g key={`r${cod}`} pointerEvents="none">
                  <path d={`M${a.xFim},${a.y} H${xv} V${b.y} H${b.xIni - 2}`} stroke="#b42318" strokeWidth={1.6} strokeDasharray="4 3" fill="none" markerEnd="url(#ex-seta)" />
                  <rect x={xv - 34} y={ly - 8} width={68} height={16} rx={8} fill="#fdecea" stroke="#f3c4bf" />
                  <text x={xv} y={ly + 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#b42318">reabertura .{mm[2]}</text>
                </g>)
            })}
            {hoje.slice(0, 7) === mes && <g pointerEvents="none"><rect x={X(Number(hoje.slice(8, 10))) + DX / 2 - 1} y={H_CAB} width={2.5} height={altura - H_CAB} fill="#f0b429" />
              <text x={X(Number(hoje.slice(8, 10))) + DX / 2} y={H_CAB - 2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#a15c07">hoje</text></g>}
          </svg>
        </div>)}
      </div>

      {osMes.length > 0 && (
        <div className="ex-os">
          <h3 style={{ margin: '0 0 4px' }}>O.S. trabalhadas no mês</h3>
          <div className="row small" style={{ gap: 18 }}>
            <span><strong>{osMes.length}</strong> O.S.</span><span><strong>{hm(total)}</strong> apontadas</span>
            <span><strong>{new Set(osMes.flatMap((x) => [...x.tpes])).size}</strong> TPEs</span>
          </div>
          <div className="ex-os-grade">
            {osMes.map((x) => {
              const partes = [...x.proj].sort((a, b) => b[1] - a[1])
              return (
                <div key={x.os} className="ex-os-card">
                  <span className="ex-os-num">OS {osBR(x.os)}</span>
                  <div className="ex-os-cli">{x.cliente || '—'}</div>
                  <div className="row small" style={{ justifyContent: 'space-between' }}>
                    <span><strong>{hm(x.h)}</strong> <span className="muted">· {total ? Math.round((x.h / total) * 100) : 0}% do mês</span></span>
                    <span className="muted">{dataBR(x.ini).slice(0, 5)} – {dataBR(x.fim).slice(0, 5)}</span>
                  </div>
                  <div className="ex-os-barra">{partes.map(([id, h]) => <span key={id} title={`${nomeDe(id)}: ${hm(h)}`} style={{ width: `${(h / x.h) * 100}%`, background: cor.get(id) ?? '#6b7079' }} />)}</div>
                  <div className="ex-os-proj">{partes.map(([id, h]) => <span key={id}><i style={{ background: cor.get(id) ?? '#6b7079' }} />{nomeDe(id).split(' ')[0]} {hm(h)}</span>)}</div>
                  <div className="muted small">{x.tpes.size} TPE(s): {[...x.tpes].sort().join(', ')}{x.he > 0.0001 ? <span className="ind-he"> · {hm(x.he)} extra</span> : null}</div>
                </div>)
            })}
          </div>
        </div>)}
      </div>
    </div>
  )
}
