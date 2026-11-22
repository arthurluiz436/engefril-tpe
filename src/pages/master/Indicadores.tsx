import { useMemo, useState, type ReactNode } from 'react'
import { useBase } from '../../lib/base'
import { DEFINICOES, indicadores } from '../../lib/calculo'
import { paraParametros } from '../../lib/dados'
import { corRecurso } from '../../lib/agenda'
import { dataBR, h1, int, mesBR, osBR, pct, reais, reais0 } from '../../lib/formato'
import { Cabecalho, Carregando } from '../../components/ui'
import { filtrarPeriodo, SeletorPeriodo, textoPeriodo, usePeriodo } from '../../components/Periodo'

/** Cor da alocação: 0% vermelho → 50% âmbar → 100% verde (acima de 100% continua verde, com aviso). */
const matiz = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 120)
const corAloc = (v: number) => `hsl(${matiz(v)} 62% 42%)`
const fundoAloc = (v: number) => `hsl(${matiz(v)} 70% 95%)`

/** Percentual com barrinha: cor fixa (participação) ou degradê da alocação. */
function Pct({ v, cor, aloc }: { v: number; cor?: string; aloc?: boolean }) {
  const c = aloc ? corAloc(v) : cor ?? 'var(--azul)'
  const acima = aloc && v > 1.0001
  return (
    <div className="ind-pct" title={acima ? 'Acima da capacidade: há horas extras' : undefined}>
      <span style={aloc ? { color: c, fontWeight: 700 } : undefined}>{pct(v)}{acima ? ' ▲' : ''}</span>
      <div className="barra"><div style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: c }} /></div>
    </div>
  )
}

/** Ordenação de tabela por coluna: 1º clique menor → maior, 2º inverte (mesmo padrão de TPEs e tarefas). */
type Ordem = { k: string; dir: 1 | -1 }
function useOrdem(padrao: Ordem) {
  const [ord, setOrd] = useState<Ordem>(padrao)
  const ordenar = <T,>(xs: T[], valor: (x: T, k: string) => any) => [...xs].sort((a, b) => {
    const va = valor(a, ord.k), vb = valor(b, ord.k)
    if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1
    return (typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb) * ord.dir
  })
  const Th = ({ k, children, num, title }: { k: string; children: ReactNode; num?: boolean; title?: string }) => {
    const ativo = ord.k === k
    return (
      <th className={num ? 'num' : ''} title={title} aria-sort={ativo ? (ord.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`th-ordem ${ativo ? 'ativo' : ''}`} onClick={() => setOrd({ k, dir: ativo ? (ord.dir === 1 ? -1 : 1) : 1 })}>
          {children}<span className="seta-ordem" aria-hidden="true">{ativo ? (ord.dir === 1 ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>)
  }
  return { ordenar, Th }
}

const reabCor = (v: number) => (v >= 0.3 ? 'vermelho' : v >= 0.15 ? 'ambar' : '')
/** Tabela por dimensão (principal, grupo, vendedor…), ordenável por qualquer coluna. */
function Dim({ titulo, linhas, chave }: { titulo: string; linhas: any[]; chave: string }) {
  const { ordenar, Th } = useOrdem({ k: 'horas', dir: -1 })
  return (
    <div className="card"><h2>{titulo}</h2>
      <div className="rolagem" style={{ maxHeight: 420 }}><table className="tabela ind-tabela"><thead><tr><Th k="chave">{chave}</Th><Th k="os_atendidas" num>O.S.</Th><Th k="qtd_tpes" num title="Cada TPE conta uma vez, com as revisões (.1, .2…)">TPEs</Th><Th k="horas" num>Horas</Th><Th k="horas_extras" num>H. extras</Th><Th k="tempo_medio_os" num>Méd./O.S.</Th><Th k="tempo_medio_tpe" num title={DEFINICOES.tempo_medio_tpe.numerador}>Méd./TPE</Th><Th k="reaberturas" num>Revisões</Th><Th k="indice_reabertura" num title="Revisões ÷ TPEs originais">Índ. reab.</Th><Th k="pct_horas" num>% horas</Th></tr></thead>
        <tbody>{ordenar(linhas, (x, k) => x[k]).map((x) => <tr key={x.chave}><td>{x.chave}</td><td className="num">{int(x.os_atendidas)}</td><td className="num">{x.qtd_tpes}</td><td className="num">{h1(x.horas)}</td><td className="num">{x.horas_extras > 0.0001 ? <span className="ind-he">{h1(x.horas_extras)}</span> : h1(x.horas_extras)}</td>
          <td className="num">{h1(x.tempo_medio_os)}</td><td className="num"><strong>{h1(x.tempo_medio_tpe)}</strong></td><td className="num">{x.reaberturas}</td>
          <td className="num">{reabCor(x.indice_reabertura) ? <span className={`badge ${reabCor(x.indice_reabertura)}`}>{pct(x.indice_reabertura)}</span> : pct(x.indice_reabertura)}</td><td className="num"><Pct v={x.pct_horas} /></td></tr>)}</tbody></table></div></div>
  )
}

export default function Indicadores() {
  const { base } = useBase()
  const [fPrincipal, setFPrincipal] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fProj, setFProj] = useState('')
  const recursos = useMemo(() => (base?.recursos ?? []).map((r: any) => r.nome as string).filter((n: string) => !fProj || n === fProj), [base, fProj])
  const opcoesPrincipal = useMemo(() => [...new Set((base?.tpes ?? []).map((t: any) => t.principal as string))].filter(Boolean).sort(), [base])
  const opcoesGrupo = useMemo(() => [...new Set((base?.tpes ?? []).filter((t: any) => !fPrincipal || t.principal === fPrincipal).map((t: any) => t.grupo as string))].filter(Boolean).sort(), [base, fPrincipal])
  const ordRec = useOrdem({ k: 'recurso', dir: 1 })
  const ordOS = useOrdem({ k: 'horas', dir: -1 })
  const cores = useMemo(() => new Map<string, string>((base?.recursos ?? []).map((r: any, i: number) => [r.nome as string, corRecurso(r, i)])), [base])
  const [periodo, setPeriodo] = usePeriodo(base)
  // período + filtros de principal, grupo e projetista (recalculam todos os indicadores da página)
  const recorte = useMemo(() => {
    if (!base) return null
    const r = filtrarPeriodo(base, periodo)
    if (!fPrincipal && !fGrupo && !fProj) return r
    const okTpe = (t: any) => (!fPrincipal || t.principal === fPrincipal) && (!fGrupo || t.grupo === fGrupo)
    const aps = r.aps.filter((a: any) => okTpe(a) && (!fProj || a.recurso_nome === fProj))
    const comAp = new Set(aps.map((a: any) => a.tpe_id))
    const tpes = r.tpes.filter((t: any) => okTpe(t) && (!fProj || t.responsavel === fProj || comAp.has(t.id)))
    return { ...r, aps, tpes }
  }, [base, periodo, fPrincipal, fGrupo, fProj])
  const k = useMemo(() => recorte && indicadores(recorte.aps, recorte.tpes, recorte.os, recursos, paraParametros(recorte.parametros), recorte.feriados), [recorte, recursos])
  if (!k || !base || !periodo) return <Carregando />
  const r = k.resumo
  const Proj = ({ nome }: { nome: string }) => (
    <span className="ind-proj"><span className="g2-ponto" style={{ background: cores.get(nome) ?? '#6b7079' }} />{nome}</span>)
  return (
    <div className="stack">
      <Cabecalho titulo="Indicadores" texto={`Produtividade, prazos e custos da engenharia. Período: ${textoPeriodo(periodo)}${r.inicio ? ` (apontamentos de ${dataBR(r.inicio)} a ${dataBR(r.fim)})` : " — sem apontamentos no período"}. Passe o mouse no nome para ver a definição.`}
        acoes={<button className="btn sec" onClick={() => window.print()}>Imprimir / PDF</button>} />
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} base={base} />
      <div className="row nao-imprimir">
        <span className="small muted" style={{ fontWeight: 600 }}>Filtrar</span>
        <select value={fPrincipal} onChange={(e) => { setFPrincipal(e.target.value); setFGrupo('') }} aria-label="Principal" style={{ maxWidth: 200 }}><option value="">Todos os principais</option>{opcoesPrincipal.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} aria-label="Grupo" style={{ maxWidth: 240 }}><option value="">Todos os grupos</option>{opcoesGrupo.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fProj} onChange={(e) => setFProj(e.target.value)} aria-label="Projetista" style={{ maxWidth: 200 }}><option value="">Todos os projetistas</option>{(base.recursos ?? []).map((r: any) => <option key={r.id}>{r.nome}</option>)}</select>
        {(fPrincipal || fGrupo || fProj) && <a href="#" className="small" onClick={(e) => { e.preventDefault(); setFPrincipal(''); setFGrupo(''); setFProj('') }}>Limpar filtros</a>}
        <span className="small muted">Clique no título de uma coluna para ordenar.</span>
      </div>
      {(fPrincipal || fGrupo || fProj) && <p className="small muted" style={{ margin: 0 }}>Indicadores só de: <strong>{[fPrincipal, fGrupo, fProj].filter(Boolean).join(' · ')}</strong>.</p>}
      <div className="card"><h2>1. Resumo geral</h2>
        <table className="tabela"><tbody>{([
          ['TPEs cadastrados / finalizados / em aberto', `${r.tpes} / ${r.finalizados} / ${r.abertos}`, null],
          ['Revisões · índice de reabertura', `${r.reaberturas} · ${pct(r.indice_reabertura)}`, 'indice_reabertura'],
          ['O.S. atendidas (clientes / internas)', `${r.os_atendidas} (${r.os_clientes} / ${r.os_internas})`, 'os_atendidas'],
          ['Horas totais · normais · extras', `${h1(r.horas)} · ${h1(r.horas_normais)} · ${h1(r.horas_extras)}`, 'horas'],
          ['% de hora extra', pct(r.pct_he), 'pct_he'],
          ['Tempo médio por TPE (h) · por O.S. (h)', `${h1(r.tempo_medio_tpe)} · ${h1(r.tempo_medio_os)}`, 'tempo_medio_tpe'],
          ['Prazo médio por TPE (dias corridos)', h1(r.prazo_medio), null],
        ] as [string, string, string | null][]).map(([a, b, d]) => <tr key={a}><td title={d ? `${DEFINICOES[d].numerador} ÷ ${DEFINICOES[d].denominador} (${DEFINICOES[d].unidade})` : ''}>{a}</td><td className="num"><strong>{b}</strong></td></tr>)}</tbody></table>
        <p className="muted small" style={{ marginBottom: 0 }}>Cada TPE conta uma vez: as horas das revisões (.1, .2…) somam na TPE original.</p></div>
      <Dim titulo="2. Por principal" linhas={k.porPrincipal} chave="Principal" />
      <Dim titulo="3. Por principal e grupo" linhas={k.porGrupo} chave="Principal › grupo" />
      <div className="card"><h2>4. Produtividade e capacidade da equipe</h2>
        <div className="row ind-legenda small muted">
          <span>Alocação (horas ÷ capacidade):</span>
          <span className="ind-degrade" aria-hidden="true" />
          <span>0% pouco ocupado</span><span>·</span><span>100% capacidade cheia</span><span>·</span><span>▲ acima de 100%: hora extra</span>
        </div>
        <div className="rolagem"><table className="tabela ind-tabela"><thead><tr><ordRec.Th k="recurso">Projetista</ordRec.Th><ordRec.Th k="primeiro_dia">1º dia</ordRec.Th><ordRec.Th k="ultimo_dia">Último dia</ordRec.Th><ordRec.Th k="dias" num>Dias</ordRec.Th><ordRec.Th k="capacidade" num>Capacidade (h)</ordRec.Th><ordRec.Th k="horas" num>Horas</ordRec.Th><ordRec.Th k="alocacao" num title={DEFINICOES.alocacao.denominador}>Alocação</ordRec.Th><ordRec.Th k="pct_he" num>% H.E.</ordRec.Th><ordRec.Th k="media_dia" num>h/dia</ordRec.Th><ordRec.Th k="tpes_atendidos" num>TPEs</ordRec.Th><ordRec.Th k="horas_por_tpe" num>h/TPE</ordRec.Th></tr></thead>
          <tbody>{ordRec.ordenar(k.porRecurso, (x: any, c) => x[c]).map((x) => <tr key={x.recurso} style={{ boxShadow: `inset 4px 0 0 ${cores.get(x.recurso) ?? 'transparent'}` }}><td><Proj nome={x.recurso} /></td><td>{dataBR(x.primeiro_dia)}</td><td>{dataBR(x.ultimo_dia)}</td><td className="num">{x.dias}</td><td className="num">{h1(x.capacidade)}</td><td className="num">{h1(x.horas)}</td>
            <td className="num">{x.capacidade > 0 ? <Pct v={x.alocacao} aloc /> : '—'}</td><td className="num">{x.pct_he > 0.0001 ? <span className="ind-he">{pct(x.pct_he)}</span> : pct(x.pct_he)}</td><td className="num">{h1(x.media_dia)}</td><td className="num">{x.tpes_atendidos}</td><td className="num">{h1(x.horas_por_tpe)}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>5. Carga mensal (horas e índice de alocação)</h2>
        <p className="muted small" style={{ marginTop: 0 }}>A cor de fundo segue a alocação do mês: vermelho claro = pouco ocupado, verde = capacidade cheia.</p>
        <div className="rolagem"><table className="tabela ind-tabela"><thead><tr><th>Mês</th><th className="num">Capac./pessoa</th>{recursos.map((n) => <th key={n} className="num"><Proj nome={n} /></th>)}<th className="num">Equipe (h)</th><th className="num">Extras (h)</th><th className="num">Custo</th></tr></thead>
          <tbody>{k.meses.map((m) => <tr key={m.mes}><td>{mesBR(m.mes)}</td><td className="num">{h1(m.capacidade)}</td>{recursos.map((n) => {
            const v = m.porRecurso[n]?.pct ?? 0, tem = (m.porRecurso[n]?.h ?? 0) > 0
            return <td key={n} className="num" style={tem ? { background: fundoAloc(v) } : undefined}>{h1(m.porRecurso[n]?.h)} <span className="small" style={{ color: tem ? corAloc(v) : 'var(--cinza-500)', fontWeight: tem ? 600 : 400 }}>({pct(v)})</span></td>
          })}
            <td className="num">{h1(m.equipe)}</td><td className="num">{m.extras > 0.0001 ? <span className="ind-he">{h1(m.extras)}</span> : h1(m.extras)}</td><td className="num">{reais0(m.custo)}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>6. Tempo gasto por O.S.</h2>
        <p className="muted small">Média por O.S.: {h1(k.tempo_medio_por_os)} h · mediana: {h1(k.mediana_por_os)} h</p>
        <div className="rolagem" style={{ maxHeight: 460 }}><table className="tabela ind-tabela"><thead><tr><ordOS.Th k="os">O.S.</ordOS.Th><ordOS.Th k="cliente">Cliente</ordOS.Th><ordOS.Th k="nivel">Nível</ordOS.Th><ordOS.Th k="vendedor">Vendedor</ordOS.Th><ordOS.Th k="qtd_tpes" num>TPEs</ordOS.Th><ordOS.Th k="horas" num>Horas</ordOS.Th><ordOS.Th k="horas_extras" num>Extras</ordOS.Th><ordOS.Th k="primeiro">1º</ordOS.Th><ordOS.Th k="ultimo">Último</ordOS.Th><ordOS.Th k="pct_horas" num>% horas</ordOS.Th><ordOS.Th k="custo" num>Custo</ordOS.Th></tr></thead>
          <tbody>{ordOS.ordenar(k.porOS, (x: any, c) => x[c]).map((o) => <tr key={o.os}><td>{osBR(o.os)}</td><td>{o.cliente}</td><td>{o.nivel}</td><td>{o.vendedor}</td><td className="num">{o.qtd_tpes}</td><td className="num">{h1(o.horas)}</td><td className="num">{o.horas_extras > 0.0001 ? <span className="ind-he">{h1(o.horas_extras)}</span> : h1(o.horas_extras)}</td><td>{dataBR(o.primeiro)}</td><td>{dataBR(o.ultimo)}</td><td className="num"><Pct v={o.pct_horas} /></td><td className="num">{reais0(o.custo)}</td></tr>)}</tbody></table></div></div>
      <Dim titulo="7. Por vendedor" linhas={k.porVendedor} chave="Vendedor" />
      <Dim titulo="8. Por nível do cliente" linhas={k.porNivel} chave="Nível" />
      <Dim titulo="9. Por classificação do projeto" linhas={k.porClassificacao} chave="Classificação" />
      <div className="card"><h2>10. Custo de homem-hora</h2>
        <table className="tabela"><tbody>{([
          ['Custo total de engenharia', reais(k.custos.total)], ['Custo em horas normais', reais(k.custos.normal)], ['Custo em horas extras', `${reais(k.custos.extra)} (${pct(k.custos.pct_extra)})`],
          ['H.E. em dia útil / sábado / domingo-feriado', `${reais(k.custos.he_dia_util)} / ${reais(k.custos.he_sabado)} / ${reais(k.custos.he_dom_feriado)}`],
          ['Custo médio por hora apontada', reais(k.custos.por_hora)], ['Custo médio por TPE com horas', reais(k.custos.por_tpe)], ['Custo médio por O.S. (inclui internas)', reais(k.custos.por_os)],
        ] as [string, string][]).map(([a, b]) => <tr key={a}><td>{a}</td><td className="num"><strong>{b}</strong></td></tr>)}</tbody></table>
        {k.custos.total > 0 && (
          <div className="ind-custo" title="Divisão do custo total">
            <div style={{ width: `${(1 - k.custos.pct_extra) * 100}%`, background: 'var(--azul)' }} />
            <div style={{ width: `${k.custos.pct_extra * 100}%`, background: 'var(--ambar)' }} />
          </div>)}
        {k.custos.total > 0 && <div className="row small muted" style={{ gap: 14 }}><span><span className="g2-ponto" style={{ background: 'var(--azul)', display: 'inline-block', marginRight: 6 }} />Horas normais</span><span><span className="g2-ponto" style={{ background: 'var(--ambar)', display: 'inline-block', marginRight: 6 }} />Horas extras</span></div>}
        <p className="muted small">{DEFINICOES.custo_total.numerador}. Consumo de horas ÷ estimativa não é percentual de conclusão física.</p></div>
    </div>
  )
}
