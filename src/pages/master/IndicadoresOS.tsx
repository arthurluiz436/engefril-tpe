import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { analisarOS, type Fatia, type Intervalo } from '../../lib/indicadoresOS'
import { corRecurso, diasUteisEntre } from '../../lib/agenda'
import { dataBR, diasEntre, h1, hojeISO, osBR, pct, reais, reais0 } from '../../lib/formato'
import { Cabecalho, Carregando, Icone, Vazio } from '../../components/ui'
import { SeletorPeriodo, usePeriodo } from '../../components/Periodo'
import { useOrdem } from '../../components/Ordenacao'

/**
 * Indicadores por Cliente/O.S.: escolha uma O.S. e veja o resumo gerencial calculado só com os dados
 * já registrados (O.S., TPEs e apontamentos). Somente leitura: nada é gravado nem alterado.
 */
const CORES = ['#044ab3', '#0c8599', '#2b8a3e', '#e67700', '#7048e8', '#c2255c', '#5c7cfa', '#868e96']
const SIT: Record<string, { rot: string; cls: string }> = {
  NAO_INICIADA: { rot: 'Não iniciada', cls: 'cinza' }, EM_ANDAMENTO: { rot: 'Em andamento', cls: 'azul' }, FINALIZADA: { rot: 'Finalizada', cls: 'verde' },
}
const iv = (x: Intervalo | null, sinal = false) => (x ? `${sinal && x.corridos > 0 ? '+' : ''}${x.corridos} d corridos · ${sinal && x.uteis > 0 ? '+' : ''}${x.uteis} d úteis` : '—')

function Barras({ itens, campo = 'horas', cores, max = 10, fmt }: { itens: Fatia[]; campo?: 'horas' | 'custo'; cores?: (f: Fatia, i: number) => string; max?: number; fmt?: (f: Fatia) => ReactNode }) {
  const lista = itens.filter((f) => f[campo] > 0.0001).slice(0, max)
  const topo = Math.max(...lista.map((f) => f[campo]), 0.0001)
  if (!lista.length) return <p className="muted small" style={{ margin: 0 }}>Sem apontamentos.</p>
  return (
    <div className="ios-barras">
      {lista.map((f, i) => (
        <div key={f.chave} className="ios-barra" title={`${f.rotulo}: ${h1(f.horas)} h (${pct(f.pctHoras)}) · ${reais(f.custo)} (${pct(f.pctCusto)})`}>
          <span className="rot">{f.rotulo}</span>
          <span className="trilho"><span style={{ width: `${(f[campo] / topo) * 100}%`, background: cores ? cores(f, i) : 'var(--azul)' }} /></span>
          <span className="val">{fmt ? fmt(f) : campo === 'horas' ? <>{h1(f.horas)} h <span className="muted">· {pct(f.pctHoras)}</span></> : <>{reais0(f.custo)} <span className="muted">· {pct(f.pctCusto)}</span></>}</span>
        </div>))}
      {itens.filter((f) => f[campo] > 0.0001).length > max && <p className="muted small" style={{ margin: '4px 0 0' }}>Mostrando os {max} maiores. A tabela abaixo traz todos.</p>}
    </div>)
}

function Rosca({ itens, centro, sub }: { itens: Fatia[]; centro: string; sub: string }) {
  let acc = 0
  const partes = itens.filter((f) => f.horas > 0).map((f, i) => { const a = acc; acc += f.pctHoras * 100; return `${CORES[i % CORES.length]} ${a}% ${acc}%` })
  return (
    <div className="ios-rosca-bloco">
      <div className="ios-rosca" style={{ background: partes.length ? `conic-gradient(${partes.join(', ')})` : 'var(--cinza-100)' }} role="img" aria-label="Horas por grupo principal">
        <div><strong>{centro}</strong><span>{sub}</span></div>
      </div>
      <ul className="ios-legenda">
        {itens.filter((f) => f.horas > 0).map((f, i) => <li key={f.chave}><i style={{ background: CORES[i % CORES.length] }} />{f.rotulo}<span>{pct(f.pctHoras)}</span></li>)}
      </ul>
    </div>)
}

const Card = ({ rot, val, sub, tom }: { rot: string; val: ReactNode; sub?: ReactNode; tom?: string }) => (
  <div className={`ios-kpi ${tom ?? ''}`}><span className="rot">{rot}</span><strong>{val}</strong>{sub && <span className="sub">{sub}</span>}</div>)

const MaiorMenor = ({ titulo, e, campo = 'horas' }: { titulo: string; e: { maior: Fatia | null; menor: Fatia | null }; campo?: 'horas' | 'custo' }) => (
  <div className="ios-mm">
    <span className="muted small">{titulo}</span>
    {e.maior ? <div><span className="badge vermelho">maior</span> <strong>{e.maior.rotulo}</strong> <span className="muted small">{campo === 'horas' ? `${h1(e.maior.horas)} h · ${pct(e.maior.pctHoras)}` : `${reais0(e.maior.custo)} · ${pct(e.maior.pctCusto)}`}</span></div> : <div className="muted small">—</div>}
    {e.menor && <div><span className="badge verde">menor</span> <strong>{e.menor.rotulo}</strong> <span className="muted small">{campo === 'horas' ? `${h1(e.menor.horas)} h · ${pct(e.menor.pctHoras)}` : `${reais0(e.menor.custo)} · ${pct(e.menor.pctCusto)}`}</span></div>}
  </div>)

export default function IndicadoresOS() {
  const { base } = useBase()
  const [qs, setQs] = useSearchParams()
  const hoje = hojeISO()
  const [periodo, setPeriodo] = usePeriodo(base, 'engefril.periodo.os', 'ano')
  const lista = useMemo(() => {
    if (!base) return []
    const horas = new Map<number, number>()
    for (const a of base.aps) horas.set(Number(a.os), (horas.get(Number(a.os)) ?? 0) + Number(a.horas_totais))
    return [...base.os].filter((o: any) => !o.arquivada).sort((a: any, b: any) => b.os - a.os).map((o: any) => ({ o, h: horas.get(o.os) ?? 0 }))
  }, [base])
  const osSel = Number(qs.get('os')) || lista.find((x) => x.h > 0)?.o.os || lista[0]?.o.os
  const o = lista.find((x) => x.o.os === osSel)?.o
  const a = useMemo(() => (base && o ? analisarOS(o, base.aps, base.tpes, base.feriados, hoje) : null), [base, o, hoje])
  const corProj = useMemo(() => new Map((base?.recursos ?? []).map((r: any, i: number) => [r.nome as string, corRecurso(r, i)])), [base])
  const resumoRef = useRef<HTMLDivElement>(null)
  if (!base || !periodo) return <Carregando />
  const escolher = (v: number | string, rolar = false) => {
    qs.set('os', String(v)); setQs(qs, { replace: true })
    if (rolar) setTimeout(() => resumoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="stack">
      <Cabecalho titulo="Indicadores por Cliente/O.S." texto="Escolha uma O.S. para ver o resumo gerencial calculado com os apontamentos e TPEs já registrados. Somente leitura: nada aqui altera os dados." />
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} base={base} atalhos={['ano', 'seis_meses', 'mes_anterior', 'mes_atual']} />
      <EntregasPeriodo os={lista.map((x) => x.o)} periodo={periodo} feriados={base.feriados} hoje={hoje} aoEscolher={(n) => escolher(n, true)} />
      <div ref={resumoRef} className="ios-busca-linha nao-imprimir">
        <BuscaOS lista={lista} valor={osSel} aoEscolher={(n) => escolher(n)} />
        <button className="btn sec" onClick={() => window.print()}><Icone n="exportar" /> Imprimir / PDF</button>
      </div>
      {!a || !o ? <Vazio>Nenhuma O.S. cadastrada.</Vazio> : <Painel a={a} o={o} corProj={corProj} hoje={hoje} />}
    </div>
  )
}

/** Painel do período: O.S. finalizadas no período, no prazo × fora do prazo. */
function EntregasPeriodo({ os, periodo, feriados, hoje, aoEscolher }: { os: any[]; periodo: { ini: string; fim: string }; feriados: Set<string>; hoje: string; aoEscolher: (os: number) => void }) {
  const d = useMemo(() => {
    const dentro = (x: string | null) => !!x && x >= periodo.ini && x <= periodo.fim
    const fin = os.filter((o) => o.status === 'FINALIZADA' && dentro(o.data_finalizacao ? String(o.data_finalizacao).slice(0, 10) : null))
    const linha = (o: any) => {
      const f = String(o.data_finalizacao).slice(0, 10), p = o.prazo_final ? String(o.prazo_final).slice(0, 10) : null
      if (!p) return { o, f, p, corridos: null as number | null, uteis: null as number | null }
      const c = diasEntre(p, f)
      const u = c === 0 ? 0 : c > 0 ? diasUteisEntre(p, f, feriados) - (diasUteisEntre(p, p, feriados)) : -(diasUteisEntre(f, p, feriados) - diasUteisEntre(f, f, feriados))
      return { o, f, p, corridos: c, uteis: u }
    }
    const ls = fin.map(linha)
    const noPrazo = ls.filter((x) => x.corridos != null && x.corridos <= 0).sort((a, b) => a.corridos! - b.corridos!)
    const fora = ls.filter((x) => x.corridos != null && x.corridos > 0).sort((a, b) => b.corridos! - a.corridos!)
    const semPrazo = ls.filter((x) => x.corridos == null)
    // em aberto com prazo final dentro do período e já vencido (ainda não atendidas)
    const vencidas = os.filter((o) => o.status !== 'FINALIZADA' && o.prazo_final && dentro(String(o.prazo_final).slice(0, 10)) && String(o.prazo_final).slice(0, 10) < hoje)
    return { total: fin.length, noPrazo, fora, semPrazo, vencidas }
  }, [os, periodo, feriados, hoje])
  const avaliadas = d.noPrazo.length + d.fora.length
  const indice = avaliadas ? d.noPrazo.length / avaliadas : null
  const cor = indice == null ? 'var(--cinza-500)' : `hsl(${Math.round(indice * 120)} 62% 40%)`
  return (
    <section className="card ios-entregas">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Entregas de O.S. no período</h2>
        <span className="muted small">O.S. finalizadas de {dataBR(periodo.ini)} a {dataBR(periodo.fim)} (pela data de finalização)</span>
      </div>
      {d.total === 0 && !d.vencidas.length ? <p className="muted small">Nenhuma O.S. finalizada neste período.</p> : (
        <div className="ios-entregas-grade">
          <div className="ios-indice">
            <div className="ios-rosca" style={{ background: avaliadas ? `conic-gradient(var(--verde) 0 ${indice! * 100}%, var(--vermelho) ${indice! * 100}% 100%)` : 'var(--cinza-100)' }}>
              <div><strong style={{ color: cor }}>{indice == null ? '—' : pct(indice)}</strong><span>no prazo</span></div>
            </div>
            <div className="ios-indice-num">
              <div><span className="ponto verde" /> <strong>{d.noPrazo.length}</strong> no prazo ou antes</div>
              <div><span className="ponto vermelho" /> <strong>{d.fora.length}</strong> fora do prazo</div>
              {d.semPrazo.length > 0 && <div className="muted small">{d.semPrazo.length} sem prazo final cadastrado (não avaliadas)</div>}
              {d.vencidas.length > 0 && <div className="small" style={{ color: 'var(--ambar)', fontWeight: 600 }}>{d.vencidas.length} em aberto com prazo vencido no período</div>}
            </div>
          </div>
          <div className="ios-entregas-col">
            <h3><span className="ponto verde" /> Atendidas no prazo</h3>
            {d.noPrazo.length ? d.noPrazo.map((x) => (
              <button key={x.o.os} type="button" className="ios-chip-os ok" onClick={() => aoEscolher(x.o.os)} title={`Prazo ${dataBR(x.p)} · finalizada ${dataBR(x.f)} — ver indicadores`}>
                <strong>{osBR(x.o.os)}</strong><span className="cli">{x.o.nome}</span><span className="dias">{x.corridos === 0 ? 'no dia' : `${-x.corridos!} d antes`}</span>
              </button>)) : <p className="muted small">Nenhuma.</p>}
          </div>
          <div className="ios-entregas-col">
            <h3><span className="ponto vermelho" /> Atendidas fora do prazo</h3>
            {d.fora.length ? d.fora.map((x) => (
              <button key={x.o.os} type="button" className="ios-chip-os atraso" onClick={() => aoEscolher(x.o.os)} title={`Prazo ${dataBR(x.p)} · finalizada ${dataBR(x.f)} · ${x.uteis} dias úteis — ver indicadores`}>
                <strong>{osBR(x.o.os)}</strong><span className="cli">{x.o.nome}</span><span className="dias">+{x.corridos} d</span>
              </button>)) : <p className="muted small">Nenhuma.</p>}
            {d.vencidas.length > 0 && <>
              <h3 style={{ marginTop: 12 }}><span className="ponto ambar" /> Em aberto, prazo vencido</h3>
              {d.vencidas.map((o) => (
                <button key={o.os} type="button" className="ios-chip-os aberta" onClick={() => aoEscolher(o.os)} title={`Prazo final ${dataBR(o.prazo_final)} — ver indicadores`}>
                  <strong>{osBR(o.os)}</strong><span className="cli">{o.nome}</span><span className="dias">+{diasEntre(String(o.prazo_final).slice(0, 10), hoje)} d</span>
                </button>))}
            </>}
          </div>
        </div>)}
      <p className="muted small" style={{ margin: '10px 0 0' }}>Dias em dias corridos entre o prazo final e a data de finalização (passe o mouse para ver os dias úteis). Clique numa O.S. para ver o resumo gerencial dela abaixo.</p>
    </section>
  )
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Busca inteligente: digite número, cliente, cidade ou vendedor; a lista mostra as O.S. mais parecidas. */
function BuscaOS({ lista, valor, aoEscolher }: { lista: { o: any; h: number }[]; valor?: number; aoEscolher: (os: number) => void }) {
  const [texto, setTexto] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const atual = lista.find((x) => x.o.os === valor)?.o
  const resultados = useMemo(() => {
    const q = semAcento(texto.trim())
    if (!q) return lista.slice(0, 12)
    const termos = q.split(/\s+/)
    const num = q.replace(/\D/g, '')
    return lista.map((x) => {
      const o = x.o
      const campos = semAcento(`${osBR(o.os)} ${o.os} ${o.nome ?? ''} ${o.cidade ?? ''} ${o.uf ?? ''} ${o.vendedor ?? ''} ${o.nivel ?? ''} ${o.classificacao ?? ''}`)
      if (!termos.every((t) => campos.includes(t))) return null
      let s = 0
      if (num && (osBR(o.os).startsWith(num) || String(o.os).startsWith(num))) s += 100
      if (semAcento(o.nome ?? '').startsWith(q)) s += 50
      if (semAcento(o.nome ?? '').includes(q)) s += 20
      s += termos.length * 5 + Math.min(10, x.h / 50)
      return { x, s }
    }).filter(Boolean).sort((a, b) => b!.s - a!.s || b!.x.o.os - a!.x.o.os).slice(0, 12).map((r) => r!.x)
  }, [texto, lista])
  const escolher = (os: number) => { aoEscolher(os); setTexto(''); setAberta(false) }
  const destacar = (s: string) => {
    const q = texto.trim(); if (!q) return s
    const i = semAcento(s).indexOf(semAcento(q.split(/\s+/)[0]))
    return i < 0 ? s : <>{s.slice(0, i)}<mark>{s.slice(i, i + q.split(/\s+/)[0].length)}</mark>{s.slice(i + q.split(/\s+/)[0].length)}</>
  }
  return (
    <div className="busca-os">
      <label className="small muted" htmlFor="busca-os" style={{ fontWeight: 600 }}>O.S. analisada</label>
      <div className="busca-os-caixa">
        <Icone n="olho" t={16} />
        <input id="busca-os" role="combobox" aria-expanded={aberta} aria-controls="busca-os-lista" aria-autocomplete="list" autoComplete="off"
          placeholder={atual ? `${osBR(atual.os)} · ${atual.nome} — digite para trocar (número, cliente, cidade, vendedor…)` : 'Digite o número da O.S., cliente, cidade ou vendedor…'}
          value={texto} onFocus={() => setAberta(true)} onBlur={() => setTimeout(() => setAberta(false), 150)}
          onChange={(e) => { setTexto(e.target.value); setAberta(true); setAtivo(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAberta(true); setAtivo((i) => Math.min(resultados.length - 1, i + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)) }
            else if (e.key === 'Enter' && resultados[ativo]) { e.preventDefault(); escolher(resultados[ativo].o.os) }
            else if (e.key === 'Escape') { setAberta(false); setTexto('') }
          }} />
      </div>
      {aberta && (
        <ul id="busca-os-lista" role="listbox" className="busca-os-lista">
          {resultados.length === 0 && <li className="vazio">Nenhuma O.S. parecida com “{texto}”.</li>}
          {resultados.map((x, i) => (
            <li key={x.o.os} role="option" aria-selected={i === ativo} className={`${i === ativo ? 'ativo' : ''} ${x.o.os === valor ? 'atual' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); escolher(x.o.os) }} onMouseEnter={() => setAtivo(i)}>
              <strong className="mono">{destacar(osBR(x.o.os))}</strong>
              <span className="nome">{destacar(x.o.nome ?? '')}<span className="muted small"> {x.o.cidade ? `· ${x.o.cidade}${x.o.uf ? `/${x.o.uf}` : ''}` : ''}{x.o.vendedor ? ` · ${x.o.vendedor}` : ''}</span></span>
              <span className={`badge ${x.o.status === 'FINALIZADA' ? 'verde' : x.h > 0 ? 'azul' : ''}`}>{x.o.status === 'FINALIZADA' ? 'finalizada' : x.h > 0 ? `${h1(x.h)} h` : 'sem horas'}</span>
            </li>))}
        </ul>)}
    </div>
  )
}

function Painel({ a, o, corProj, hoje }: { a: ReturnType<typeof analisarOS>; o: any; corProj: Map<string, string>; hoje: string }) {
  const R = a.resumo, sit = SIT[a.situacao]
  const oTpe = useOrdem({ k: 'horas', dir: -1 }), oProj = useOrdem({ k: 'horas', dir: -1 }), oCusto = useOrdem({ k: 'custo', dir: -1 }), oComp = useOrdem({ k: 'dif', dir: -1 })
  const principaisComHoras = a.porPrincipal.filter((p) => p.horas > 0)
  const valorFatia = (x: any, k: string) => (k === 'rotulo' || k === 'chave' || k === 'grupoCompleto' ? (k === 'grupoCompleto' ? `${x.principal} › ${x.grupo}` : x[k]) : x[k])
  const d = a.desvio
  const parecer = (() => {
    if (a.parecer === 'SEM_PRAZO') return { rot: 'Sem prazo final cadastrado', cls: 'cinza', det: '' }
    if (a.parecer === 'SEM_DATA') return { rot: 'Finalizada sem data de finalização', cls: 'cinza', det: 'Informe a data em Clientes e O.S. › Editar' }
    if (a.parecer === 'SEM_PREVISAO') return { rot: 'Sem previsão de término', cls: 'ambar', det: a.semPrazo ? `${a.semPrazo} TPE(s) em aberto sem prazo` : 'Nenhuma TPE em aberto com prazo' }
    const fin = a.situacao === 'FINALIZADA'
    const dias = `${Math.abs(d!.corridos)} d corridos · ${Math.abs(d!.uteis)} d úteis`
    if (a.parecer === 'ATRASO') return { rot: fin ? 'Atendida com atraso' : 'Previsão: fora do prazo', cls: 'vermelho', det: `${dias} depois do prazo` }
    if (a.parecer === 'ANTES') return { rot: fin ? 'Atendida antes do prazo' : 'Previsão: dentro do prazo', cls: 'verde', det: `${dias} de folga` }
    return { rot: fin ? 'Atendida no prazo' : 'Previsão: no limite do prazo', cls: 'verde', det: 'no dia do prazo final' }
  })()

  return (
    <>
      {/* ---------------- cabeçalho da O.S. */}
      <div className={`ios-hero ${sit.cls}`}>
        <div className="ios-hero-os">
          <span className="muted small">O.S.</span>
          <strong>{osBR(o.os)}</strong>
          <span className={`ios-pill ${sit.cls}`}>{sit.rot}</span>
        </div>
        <div className="ios-hero-cli">
          <h2>{o.nome}</h2>
          <div className="muted">{[o.cidade && `${o.cidade}${o.uf ? `/${o.uf}` : ''}`, o.nivel, o.classificacao, o.vendedor && `Vendedor: ${o.vendedor}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className={`ios-parecer ${parecer.cls}`}>
          <span className="muted small">{a.situacao === 'FINALIZADA' ? 'Atendimento do prazo' : 'Prazo'}</span>
          <strong>{parecer.rot}</strong>
          {parecer.det && <span className="small">{parecer.det}</span>}
          <span className="small muted">
            Prazo final {dataBR(R.prazoFinal)}
            {a.situacao === 'FINALIZADA' ? <> · finalizada em {dataBR(R.finalizada)}</> : a.previsao ? <> · previsão {dataBR(a.previsao)}</> : null}
          </span>
        </div>
      </div>
      {a.situacao !== 'FINALIZADA' && a.previsao && <p className="muted small" style={{ margin: '-6px 0 0' }}>Previsão = maior prazo planejado entre as TPEs em aberto desta O.S. (uma TPE com prazo já vencido conta como hoje, {dataBR(hoje)}).</p>}

      {/* ---------------- 1. resumo */}
      <section className="card">
        <h2>1. Resumo da O.S.</h2>
        <div className="ios-kpis">
          <Card rot="TPEs" val={R.qtdTpes} sub={`${R.abertas} em aberto${R.revisoes ? ` · ${R.revisoes} revisão(ões)` : ''}`} />
          <Card rot="Horas apontadas" val={`${h1(R.horas)} h`} sub={R.extras > 0.0001 ? <span className="ind-he">{h1(R.extras)} h extras ({pct(R.horas ? R.extras / R.horas : 0)})</span> : 'sem hora extra'} />
          <Card rot="Custo de mão de obra" val={reais0(R.custo)} sub={`${reais(a.custos.porHora)} por hora`} />
          <Card rot="Início → fim previsto" val={<span className="ios-datas">{dataBR(R.ini)} → {dataBR(R.prazoFinal)}</span>} sub={a.prazo.prazoTotal ? `prazo total: ${iv(a.prazo.prazoTotal)}` : 'datas incompletas no cadastro'} />
          <Card rot="1º → último apontamento" val={<span className="ios-datas">{dataBR(R.primeiroAp)} → {dataBR(R.ultimoAp)}</span>} sub={a.prazo.janela ? iv(a.prazo.janela) : 'sem apontamentos'} />
          <Card rot="Projetistas envolvidos" val={a.porProjetista.length} sub={a.porProjetista[0] ? <>maior participação: <span style={{ color: corProj.get(a.porProjetista[0].rotulo) ?? 'inherit', fontWeight: 600 }}><span className="g2-ponto" style={{ background: corProj.get(a.porProjetista[0].rotulo), display: 'inline-block', marginRight: 4, width: 7, height: 7 }} />{a.porProjetista[0].rotulo}</span></> : '—'} />
        </div>
      </section>

      {R.horas <= 0 ? <Vazio>Esta O.S. ainda não tem horas apontadas: distribuição de esforço, participação e custos aparecem quando houver apontamentos.</Vazio> : (
        <>
          {/* ---------------- 2. distribuição de esforço */}
          <section className="card">
            <h2>2. Distribuição de esforço</h2>
            <p className="muted small">Hierarquia dos apontamentos: grupo → grupo › principal → tarefa (TPE, com as revisões somadas). Cada visão soma exatamente {h1(R.horas)} h.</p>
            <div className="ios-2col">
              <div><h3>Por grupo</h3><Rosca itens={a.porPrincipal} centro={`${h1(R.horas)} h`} sub="total da O.S." /></div>
              <div><h3>Por grupo › principal</h3><Barras itens={a.porGrupo} cores={(f) => CORES[a.porPrincipal.findIndex((p) => p.chave === f.principal) % CORES.length] ?? 'var(--azul)'} /></div>
            </div>
            <div className="ios-2col">
              <div><h3>Por tipo de dia do apontamento</h3><Barras itens={a.porTipoDia} cores={(f) => (f.chave === 'DIA ÚTIL' ? 'var(--azul)' : 'var(--ambar)')} /></div>
              <div className="ios-mms">
                <MaiorMenor titulo="Grupo" e={a.extremos.principal} />
                <MaiorMenor titulo="Grupo › principal" e={a.extremos.grupo} />
                <MaiorMenor titulo="Tarefa (TPE)" e={a.extremos.tpe} />
                <span className="muted small">Só entram itens com horas apontadas.</span>
              </div>
            </div>
            <h3>Ranking das tarefas por horas</h3>
            <div className="rolagem" style={{ maxHeight: 380 }}><table className="tabela"><thead><tr><th>#</th><oTpe.Th k="chave">TPE</oTpe.Th><oTpe.Th k="grupoCompleto">Grupo › principal</oTpe.Th><oTpe.Th k="descricao">Descrição</oTpe.Th><oTpe.Th k="horas" num>Horas</oTpe.Th><oTpe.Th k="pctHoras" num>% horas</oTpe.Th><oTpe.Th k="extras" num>H. extras</oTpe.Th><oTpe.Th k="revisoes" num>Revisões</oTpe.Th><oTpe.Th k="projetistas" num>Projetistas</oTpe.Th></tr></thead>
              <tbody>{oTpe.ordenar(a.porTpe.filter((t) => t.horas > 0), valorFatia).map((t, i) => <tr key={t.chave}><td>{i + 1}</td><td className="sem-quebra"><strong>{t.chave}</strong></td><td className="small">{t.principal} › {t.grupo}</td><td className="small" style={{ maxWidth: 360 }}>{t.descricao}</td><td className="num">{h1(t.horas)}</td><td className="num">{pct(t.pctHoras)}</td><td className="num">{t.extras > 0.0001 ? <span className="ind-he">{h1(t.extras)}</span> : '—'}</td><td className="num">{t.revisoes || '—'}</td><td className="num">{t.projetistas}</td></tr>)}</tbody></table></div>
          </section>

          {/* ---------------- 3. participação */}
          <section className="card">
            <h2>3. Participação dos projetistas</h2>
            <p className="muted small">Mostra quanto do esforço da O.S. cada pessoa aplicou. Não mede produtividade individual.</p>
            <div className="ios-2col">
              <div><h3>Horas por projetista</h3><Barras itens={a.porProjetista} cores={(f) => corProj.get(f.rotulo) ?? 'var(--azul)'} /></div>
              <div>
                <h3>Grupos principais por projetista</h3>
                <div className="rolagem"><table className="tabela"><thead><tr><oProj.Th k="rotulo">Projetista</oProj.Th><oProj.Th k="horas" num>Total (h)</oProj.Th>{principaisComHoras.map((p) => <oProj.Th key={p.chave} k={`p:${p.chave}`} num>{p.rotulo}</oProj.Th>)}<oProj.Th k="tpes" num>TPEs</oProj.Th></tr></thead>
                  <tbody>{oProj.ordenar(a.porProjetista, (x: any, k) => (k.startsWith('p:') ? a.matriz.get(x.rotulo)?.get(k.slice(2)) ?? 0 : x[k])).map((p) => <tr key={p.chave}><td className="sem-quebra"><span className="ind-proj" style={{ color: corProj.get(p.rotulo) }}><span className="g2-ponto" style={{ background: corProj.get(p.rotulo) }} />{p.rotulo}</span></td><td className="num"><strong>{h1(p.horas)}</strong></td>
                    {principaisComHoras.map((x) => { const v = a.matriz.get(p.rotulo)?.get(x.chave) ?? 0; return <td key={x.chave} className="num">{v > 0.0001 ? h1(v) : <span className="muted">—</span>}</td> })}
                    <td className="num">{p.tpes}</td></tr>)}</tbody></table></div>
              </div>
            </div>
          </section>

          {/* ---------------- 4. prazo */}
          <section className="card">
            <h2>4. Análise de prazo</h2>
            <p className="muted small">Comparação entre as datas da O.S. e as datas dos apontamentos. Ocupação do calendário não é percentual de conclusão.</p>
            <div className="ios-kpis">
              <Card rot="Prazo total (início → fim previsto)" val={a.prazo.prazoTotal ? `${a.prazo.prazoTotal.corridos} d` : '—'} sub={a.prazo.prazoTotal ? `${a.prazo.prazoTotal.uteis} dias úteis` : 'informe início e prazo final na O.S.'} />
              <Card rot="Janela dos apontamentos" val={a.prazo.janela ? `${a.prazo.janela.corridos} d` : '—'} sub={a.prazo.janela ? `${a.prazo.janela.uteis} dias úteis` : ''} />
              <Card rot="Início da O.S. → 1º apontamento" val={a.prazo.inicioAte1o ? `${a.prazo.inicioAte1o.corridos} d` : '—'} sub={a.prazo.inicioAte1o ? `${a.prazo.inicioAte1o.uteis} dias úteis${a.prazo.inicioAte1o.corridos < 0 ? ' (apontado antes do início)' : ''}` : ''} />
              <Card rot="Último apontamento → fim previsto" val={a.prazo.ultimoAteFim ? `${a.prazo.ultimoAteFim.corridos} d` : '—'} sub={a.prazo.ultimoAteFim ? (a.prazo.ultimoAteFim.corridos < 0 ? `apontamentos ${Math.abs(a.prazo.ultimoAteFim.corridos)} d depois do prazo final` : `${a.prazo.ultimoAteFim.uteis} dias úteis antes do prazo final`) : ''} tom={a.prazo.ultimoAteFim && a.prazo.ultimoAteFim.corridos < 0 ? 'atencao' : ''} />
              <Card rot="Janela ÷ prazo total" val={a.prazo.pctJanela != null ? pct(a.prazo.pctJanela) : '—'} sub="dias corridos" />
            </div>
            {a.prazo.prazoTotal && R.ini && R.prazoFinal && <LinhaTempo a={a} hoje={hoje} />}
          </section>

          {/* ---------------- 5. custos */}
          <section className="card">
            <h2>5. Análise de custos</h2>
            <p className="muted small">Custo de mão de obra de projetos pelos critérios já usados no sistema (custo H/H vigente de cada projetista, com o adicional de hora extra). Sem orçamentos ou metas.</p>
            <div className="ios-kpis">
              <Card rot="Custo total" val={reais0(a.custos.total)} sub={`${h1(R.horas)} h apontadas`} />
              <Card rot="Custo médio por hora" val={reais(a.custos.porHora)} />
              <Card rot="Horas extras no custo" val={pct(a.custos.pctHe)} sub={reais0(a.custos.he)} tom={a.custos.pctHe >= 0.15 ? 'atencao' : ''} />
              <Card rot="Custo médio por TPE" val={reais0(a.custos.porTpe)} sub="TPEs com custo, revisões somadas" />
            </div>
            <div className="ios-2col">
              <div><h3>Custo por projetista</h3><Barras itens={[...a.porProjetista].sort((x, y) => y.custo - x.custo)} campo="custo" cores={(f) => corProj.get(f.rotulo) ?? 'var(--azul)'} /></div>
              <div><h3>Custo por grupo</h3><Barras itens={[...a.porGrupo].sort((x, y) => y.custo - x.custo)} campo="custo" cores={(f) => CORES[a.porPrincipal.findIndex((p) => p.chave === f.principal) % CORES.length] ?? 'var(--azul)'} /></div>
            </div>
            <div className="ios-mms ios-mms-linha">
              <MaiorMenor titulo="Grupo de maior e menor impacto financeiro" e={a.extremosCusto.grupo} campo="custo" />
              <MaiorMenor titulo="Tarefa de maior e menor impacto financeiro" e={a.extremosCusto.tpe} campo="custo" />
            </div>
            <h3>Custo por grupo principal, grupo e tarefa</h3>
            <div className="rolagem" style={{ maxHeight: 380 }}><table className="tabela"><thead><tr><th>Nível</th><oCusto.Th k="rotulo">Item</oCusto.Th><oCusto.Th k="horas" num>Horas</oCusto.Th><oCusto.Th k="custo" num>Custo</oCusto.Th><oCusto.Th k="pctCusto" num>% do custo</oCusto.Th><oCusto.Th k="rh" num>R$/h</oCusto.Th></tr></thead>
              <tbody>
                {(() => {
                  const v = (x: any, k: string) => (k === 'rh' ? (x.horas ? x.custo / x.horas : null) : k === 'rotulo' ? (x.grupo && x.chave.includes(' › ') ? x.grupo : x.rotulo) : x[k])
                  return oCusto.ordenar(a.porPrincipal.filter((p) => p.custo > 0 || p.horas > 0), v).map((p) => (
                    <FragmentoCusto key={p.chave} p={p} grupos={oCusto.ordenar(a.porGrupo.filter((g) => g.principal === p.chave), v)} tpes={oCusto.ordenar(a.porTpe, v)} />))
                })()}
                <tr className="ios-total"><td colSpan={2}><strong>Total da O.S.</strong></td><td className="num"><strong>{h1(R.horas)}</strong></td><td className="num"><strong>{reais0(a.custos.total)}</strong></td><td className="num">100%</td><td className="num">{reais(a.custos.porHora)}</td></tr>
              </tbody></table></div>
          </section>
        </>
      )}

      {/* ---------------- 6. diagnóstico */}
      <section className="card">
        <h2>6. Diagnóstico gerencial</h2>
        <p className="muted small">Gerado a partir dos indicadores desta página. Cada ponto cita o número que o sustenta.</p>
        <div className="ios-diag">
          {a.diagnostico.map((x, i) => (
            <div key={i} className={`ios-diag-item ${x.tom}`}>
              <Icone n={x.tom === 'atencao' ? 'alerta' : x.tom === 'ok' ? 'check' : 'info'} t={18} />
              <div><strong>{x.titulo}</strong><p>{x.texto}</p></div>
            </div>))}
        </div>
        {a.comparacao.length > 0 && (
          <>
            <h3>Referência de outras O.S. (mesmo grupo principal › grupo)</h3>
            <p className="muted small">Só aparecem grupos com 3 ou mais TPEs com horas em pelo menos 2 outras O.S. Projetos diferentes podem ter escopos diferentes: use como referência, não como meta.</p>
            <div className="rolagem"><table className="tabela"><thead><tr><oComp.Th k="grupo">Grupo</oComp.Th><oComp.Th k="aqui" num>Horas/TPE nesta O.S.</oComp.Th><oComp.Th k="media" num>Média em outras O.S.</oComp.Th><oComp.Th k="dif" num>Diferença</oComp.Th><oComp.Th k="amostra" num>Amostra</oComp.Th></tr></thead>
              <tbody>{oComp.ordenar(a.comparacao, (x: any, k) => x[k]).map((c) => <tr key={c.grupo}><td className="small">{c.grupo}</td><td className="num">{h1(c.aqui)} <span className="muted small">({c.tpesAqui} TPE)</span></td><td className="num">{h1(c.media)}</td>
                <td className="num"><span className={`badge ${c.dif >= 0.3 ? 'vermelho' : c.dif <= -0.3 ? 'verde' : ''}`}>{c.dif >= 0 ? '+' : ''}{pct(c.dif)}</span></td><td className="num small">{c.amostra} TPEs · {c.osAmostra} O.S.</td></tr>)}</tbody></table></div>
          </>)}
        <p className="muted small" style={{ marginTop: 10 }}>Ver também: <Link to="/master/os">Clientes e O.S.</Link> · <Link to={`/master/tpes`}>TPEs e tarefas</Link></p>
      </section>
    </>
  )
}

function FragmentoCusto({ p, grupos, tpes }: { p: Fatia; grupos: Fatia[]; tpes: Fatia[] }) {
  return (
    <>
      <tr className="ios-n1"><td><span className="badge azul">principal</span></td><td><strong>{p.rotulo}</strong></td><td className="num">{h1(p.horas)}</td><td className="num"><strong>{reais0(p.custo)}</strong></td><td className="num">{pct(p.pctCusto)}</td><td className="num">{p.horas ? reais(p.custo / p.horas) : '—'}</td></tr>
      {grupos.map((g) => (
        <FragGrupo key={g.chave} g={g} tpes={tpes.filter((t) => t.principal === g.principal && t.grupo === g.grupo)} />))}
    </>)
}
function FragGrupo({ g, tpes }: { g: Fatia; tpes: Fatia[] }) {
  return (
    <>
      <tr className="ios-n2"><td><span className="badge">grupo</span></td><td>{g.grupo}</td><td className="num">{h1(g.horas)}</td><td className="num">{reais0(g.custo)}</td><td className="num">{pct(g.pctCusto)}</td><td className="num">{g.horas ? reais(g.custo / g.horas) : '—'}</td></tr>
      {tpes.map((t) => <tr key={t.chave} className="ios-n3"><td><span className="muted small">tarefa</span></td><td className="small">{t.chave}{t.descricao ? ` · ${t.descricao}` : ''}</td><td className="num">{h1(t.horas)}</td><td className="num">{reais0(t.custo)}</td><td className="num">{pct(t.pctCusto)}</td><td className="num">{t.horas ? reais(t.custo / t.horas) : '—'}</td></tr>)}
    </>)
}

/** Linha do tempo: prazo da O.S. × janela dos apontamentos × hoje */
function LinhaTempo({ a, hoje }: { a: ReturnType<typeof analisarOS>; hoje: string }) {
  const R = a.resumo
  const datas = [R.ini!, R.prazoFinal!, R.primeiroAp, R.ultimoAp, R.finalizada, a.previsao, hoje].filter(Boolean) as string[]
  const t0 = datas.slice().sort()[0], t1 = datas.slice().sort().pop()!
  const tot = Math.max(1, (Date.parse(t1) - Date.parse(t0)) / 86400000)
  const x = (d: string) => `${((Date.parse(d) - Date.parse(t0)) / 86400000 / tot) * 100}%`
  const larg = (d0: string, d1: string) => `${Math.max(0.6, ((Date.parse(d1) - Date.parse(d0)) / 86400000 / tot) * 100)}%`
  return (
    <div className="ios-tempo" role="img" aria-label="Linha do tempo da O.S.">
      <div className="faixa"><span className="rotulo">Prazo da O.S.</span><div className="trilho"><i className="prazo" style={{ left: x(R.ini!), width: larg(R.ini!, R.prazoFinal!) }} /></div></div>
      {R.primeiroAp && R.ultimoAp && <div className="faixa"><span className="rotulo">Apontamentos</span><div className="trilho"><i className="aps" style={{ left: x(R.primeiroAp), width: larg(R.primeiroAp, R.ultimoAp) }} /></div></div>}
      {a.previsao && a.situacao !== 'FINALIZADA' && <div className="faixa"><span className="rotulo">Previsão (TPEs)</span><div className="trilho"><i className={`prev ${a.parecer === 'ATRASO' ? 'tarde' : ''}`} style={{ left: x(R.ultimoAp ?? R.ini!), width: larg(R.ultimoAp ?? R.ini!, a.previsao) }} /></div></div>}
      <div className="marcos">
        <span style={{ left: x(R.prazoFinal!) }} className="m-prazo" title={`Prazo final ${dataBR(R.prazoFinal)}`}>prazo {dataBR(R.prazoFinal)}</span>
        {hoje >= t0 && hoje <= t1 && <span style={{ left: x(hoje) }} className="m-hoje">hoje</span>}
        {R.finalizada && <span style={{ left: x(R.finalizada) }} className="m-fim" title={`Finalizada em ${dataBR(R.finalizada)}`}>finalizada</span>}
      </div>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{dataBR(t0)}</span><span>{dataBR(t1)}</span></div>
    </div>)
}
