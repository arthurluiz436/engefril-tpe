import { useMemo } from 'react'
import { useBase } from '../../lib/base'
import { DEFINICOES, indicadores } from '../../lib/calculo'
import { paraParametros } from '../../lib/dados'
import { dataBR, h1, int, mesBR, osBR, pct, reais, reais0 } from '../../lib/formato'
import { Cabecalho, Carregando } from '../../components/ui'

export default function Indicadores() {
  const { base } = useBase()
  const recursos = useMemo(() => (base?.recursos ?? []).map((r: any) => r.nome as string), [base])
  const k = useMemo(() => base && indicadores(base.aps, base.tpes, base.os, recursos, paraParametros(base.parametros), base.feriados), [base, recursos])
  if (!k) return <Carregando />
  const r = k.resumo
  const Dim = ({ titulo, linhas, chave }: { titulo: string; linhas: any[]; chave: string }) => (
    <div className="card"><h2>{titulo}</h2>
      <div className="rolagem" style={{ maxHeight: 420 }}><table className="tabela"><thead><tr><th>{chave}</th><th className="num">O.S.</th><th className="num">TPEs</th><th className="num">Horas</th><th className="num">H. extras</th><th className="num">Méd./O.S.</th><th className="num">Méd./TPE</th><th className="num">Reab.</th><th className="num">Índ. reab.</th><th className="num">% horas</th></tr></thead>
        <tbody>{[...linhas].sort((a, b) => b.horas - a.horas).map((x) => <tr key={x.chave}><td>{x.chave}</td><td className="num">{int(x.os_atendidas)}</td><td className="num">{x.qtd_tpes}</td><td className="num">{h1(x.horas)}</td><td className="num">{h1(x.horas_extras)}</td>
          <td className="num">{h1(x.tempo_medio_os)}</td><td className="num">{h1(x.tempo_medio_tpe)}</td><td className="num">{x.reaberturas}</td><td className="num">{pct(x.indice_reabertura)}</td><td className="num">{pct(x.pct_horas)}</td></tr>)}</tbody></table></div></div>
  )
  return (
    <div className="stack">
      <Cabecalho titulo="Indicadores" texto={`Mesmos blocos da aba KPI da planilha VER_035, calculados sobre a base atual. Período: ${dataBR(r.inicio)} a ${dataBR(r.fim)}. Passe o mouse no nome para ver a definição.`}
        acoes={<button className="btn sec" onClick={() => window.print()}>Imprimir / PDF</button>} />
      <div className="card"><h2>1. Resumo geral</h2>
        <table className="tabela"><tbody>{([
          ['TPEs cadastrados / finalizados / em aberto', `${r.tpes} / ${r.finalizados} / ${r.abertos}`, null],
          ['Reaberturas · índice de reabertura', `${r.reaberturas} · ${pct(r.indice_reabertura)}`, 'indice_reabertura'],
          ['O.S. atendidas (clientes / internas)', `${r.os_atendidas} (${r.os_clientes} / ${r.os_internas})`, 'os_atendidas'],
          ['Horas totais · normais · extras', `${h1(r.horas)} · ${h1(r.horas_normais)} · ${h1(r.horas_extras)}`, 'horas'],
          ['% de hora extra', pct(r.pct_he), 'pct_he'],
          ['Tempo médio por TPE (h) · por O.S. (h)', `${h1(r.tempo_medio_tpe)} · ${h1(r.tempo_medio_os)}`, 'tempo_medio_tpe'],
          ['Prazo médio por TPE (dias corridos)', h1(r.prazo_medio), null],
        ] as [string, string, string | null][]).map(([a, b, d]) => <tr key={a}><td title={d ? `${DEFINICOES[d].numerador} ÷ ${DEFINICOES[d].denominador} (${DEFINICOES[d].unidade}) — origem ${DEFINICOES[d].origem}` : ''}>{a}</td><td className="num"><strong>{b}</strong></td></tr>)}</tbody></table></div>
      <Dim titulo="2. Por principal" linhas={k.porPrincipal} chave="Principal" />
      <Dim titulo="3. Por principal e grupo" linhas={k.porGrupo} chave="Principal › grupo" />
      <div className="card"><h2>4. Produtividade e capacidade da equipe</h2>
        <table className="tabela"><thead><tr><th>Projetista</th><th>1º dia</th><th>Último dia</th><th className="num">Dias</th><th className="num">Capacidade (h)</th><th className="num">Horas</th><th className="num" title={DEFINICOES.alocacao.denominador}>Alocação</th><th className="num">% H.E.</th><th className="num">h/dia</th><th className="num">TPEs</th><th className="num">h/TPE</th></tr></thead>
          <tbody>{k.porRecurso.map((x) => <tr key={x.recurso}><td>{x.recurso}</td><td>{dataBR(x.primeiro_dia)}</td><td>{dataBR(x.ultimo_dia)}</td><td className="num">{x.dias}</td><td className="num">{h1(x.capacidade)}</td><td className="num">{h1(x.horas)}</td>
            <td className="num">{pct(x.alocacao)}</td><td className="num">{pct(x.pct_he)}</td><td className="num">{h1(x.media_dia)}</td><td className="num">{x.tpes_atendidos}</td><td className="num">{h1(x.horas_por_tpe)}</td></tr>)}</tbody></table></div>
      <div className="card"><h2>5. Carga mensal (horas e índice de alocação)</h2>
        <div className="rolagem"><table className="tabela"><thead><tr><th>Mês</th><th className="num">Capac./pessoa</th>{recursos.map((n) => <th key={n} className="num">{n}</th>)}<th className="num">Equipe (h)</th><th className="num">Extras (h)</th><th className="num">Custo</th></tr></thead>
          <tbody>{k.meses.map((m) => <tr key={m.mes}><td>{mesBR(m.mes)}</td><td className="num">{h1(m.capacidade)}</td>{recursos.map((n) => <td key={n} className="num">{h1(m.porRecurso[n]?.h)} <span className="muted small">({pct(m.porRecurso[n]?.pct)})</span></td>)}
            <td className="num">{h1(m.equipe)}</td><td className="num">{h1(m.extras)}</td><td className="num">{reais0(m.custo)}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>6. Tempo gasto por O.S.</h2>
        <p className="muted small">Média por O.S.: {h1(k.tempo_medio_por_os)} h · mediana: {h1(k.mediana_por_os)} h</p>
        <div className="rolagem" style={{ maxHeight: 460 }}><table className="tabela"><thead><tr><th>O.S.</th><th>Cliente</th><th>Nível</th><th>Vendedor</th><th className="num">TPEs</th><th className="num">Horas</th><th className="num">Extras</th><th>1º</th><th>Último</th><th className="num">% horas</th><th className="num">Custo</th></tr></thead>
          <tbody>{k.porOS.map((o) => <tr key={o.os}><td>{osBR(o.os)}</td><td>{o.cliente}</td><td>{o.nivel}</td><td>{o.vendedor}</td><td className="num">{o.qtd_tpes}</td><td className="num">{h1(o.horas)}</td><td className="num">{h1(o.horas_extras)}</td><td>{dataBR(o.primeiro)}</td><td>{dataBR(o.ultimo)}</td><td className="num">{pct(o.pct_horas)}</td><td className="num">{reais0(o.custo)}</td></tr>)}</tbody></table></div></div>
      <Dim titulo="7. Por vendedor" linhas={k.porVendedor} chave="Vendedor" />
      <Dim titulo="8. Por nível do cliente" linhas={k.porNivel} chave="Nível" />
      <Dim titulo="9. Por classificação do projeto" linhas={k.porClassificacao} chave="Classificação" />
      <div className="card"><h2>10. Custo de homem-hora</h2>
        <table className="tabela"><tbody>{([
          ['Custo total de engenharia', reais(k.custos.total)], ['Custo em horas normais', reais(k.custos.normal)], ['Custo em horas extras', `${reais(k.custos.extra)} (${pct(k.custos.pct_extra)})`],
          ['H.E. em dia útil / sábado / domingo-feriado', `${reais(k.custos.he_dia_util)} / ${reais(k.custos.he_sabado)} / ${reais(k.custos.he_dom_feriado)}`],
          ['Custo médio por hora apontada', reais(k.custos.por_hora)], ['Custo médio por TPE com horas', reais(k.custos.por_tpe)], ['Custo médio por O.S. (inclui internas)', reais(k.custos.por_os)],
        ] as [string, string][]).map(([a, b]) => <tr key={a}><td>{a}</td><td className="num"><strong>{b}</strong></td></tr>)}</tbody></table>
        <p className="muted small">{DEFINICOES.custo_total.numerador}. Consumo de horas ÷ estimativa não é percentual de conclusão física.</p></div>
    </div>
  )
}
