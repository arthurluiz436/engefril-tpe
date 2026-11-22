import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { indicadores } from '../../lib/calculo'
import { paraParametros, prazosDasOS, situacaoPrazo } from '../../lib/dados'
import { dataBR, h1, hm, hojeISO, int, pct, reais0, somaDias } from '../../lib/formato'
import { Aviso, Cabecalho, Carregando, Icone, Kpi, Selo, SeloPrazo } from '../../components/ui'
import Gantt from '../../components/Gantt'
import { filtrarPeriodo, SeletorPeriodo, textoPeriodo, usePeriodo } from '../../components/Periodo'

export default function Painel() {
  const { base, erro, recarregar, carregando, atualizadoEm } = useBase()
  const navegar = useNavigate()
  const [periodo, setPeriodo] = usePeriodo(base)
  const recorte = useMemo(() => (base ? filtrarPeriodo(base, periodo) : null), [base, periodo])
  const k = useMemo(() => recorte && indicadores(recorte.aps, recorte.tpes, recorte.os, recorte.recursos.map((r: any) => r.nome), paraParametros(recorte.parametros), recorte.feriados), [recorte])
  const pend = useMemo(() => {
    if (!base) return null
    const abertas = base.tpes.filter((t: any) => t.status !== 'FINALIZADA' && !t.arquivada)
    const hoje = hojeISO()
    const sobrep: any[] = []
    const porRecDia = new Map<string, any[]>()
    for (const a of base.aps) { const kk = `${a.recurso_id}|${a.dia}`; porRecDia.set(kk, [...(porRecDia.get(kk) ?? []), a]) }
    for (const ls of porRecDia.values()) {
      const s = [...ls].sort((x, y) => x.hora_inicio.localeCompare(y.hora_inicio))
      for (let i = 1; i < s.length; i++) if (s[i].hora_inicio < s[i - 1].hora_fim) sobrep.push([s[i - 1], s[i]])
    }
    return {
      semResp: abertas.filter((t: any) => !t.responsavel_id),
      atrasadas: abertas.filter((t: any) => situacaoPrazo(t.prazo, t.status) === 'ATRASADA'),
      breve: abertas.filter((t: any) => situacaoPrazo(t.prazo, t.status) === 'VENCE EM BREVE'),
      semPrazo: abertas.filter((t: any) => t.responsavel_id && !t.prazo),
      osVencidas: base.os.filter((o: any) => o.status !== 'FINALIZADA' && o.prazo_final && o.prazo_final < hoje),
      sobrep,
      semana: base.aps.filter((a: any) => a.dia >= somaDias(hoje, -6)),
      gruposFora: base.tpes.filter((t: any) => t.grupo !== t.grupo_original && t.grupo_original),
    }
  }, [base])

  if (!base || !k || !pend || !periodo) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />
  const r = k.resumo
  return (
    <div className="stack">
      <Cabecalho titulo="Painel do Supervisor" texto={`Indicadores do período ${textoPeriodo(periodo)}${r.inicio ? ` (apontamentos de ${dataBR(r.inicio)} a ${dataBR(r.fim)})` : " · sem apontamentos no período"}. Pendências e cronograma mostram a situação atual.`}
        acoes={<><span className="small muted">Atualizado {atualizadoEm?.toLocaleTimeString('pt-BR')}</span><button className="btn sec" onClick={recarregar} disabled={carregando}>Atualizar</button></>} />
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} base={base} />
      <div className="grid4">
        <Kpi rotulo="TPEs cadastrados" valor={int(r.tpes)} sub={`${int(r.finalizados)} finalizados · ${int(r.abertos)} em aberto`} titulo="TPEs com data de início (ou cadastro) no período, ou com apontamento nele" />
        <Kpi rotulo="O.S. atendidas" valor={int(r.os_atendidas)} sub={`${r.os_clientes} de clientes · ${r.os_internas} internas`} titulo="O.S. distintas das TPEs do período" />
        <Kpi rotulo="Índice de reabertura" valor={pct(r.indice_reabertura)} sub={`${r.reaberturas} revisões ÷ ${r.tpes - r.reaberturas} TPEs originais`} titulo="Revisões (.1, .2…) ÷ TPEs originais (.0)" />
        <Kpi rotulo="Horas apontadas" valor={h1(r.horas)} sub={`${pct(r.pct_he)} em hora extra`} titulo="Horas normais + extras apontadas no período" />
        <Kpi rotulo="Custo de engenharia" valor={reais0(k.custos.total)} sub={`${pct(k.custos.pct_extra)} em H.E. · ${reais0(k.custos.por_hora)}/h`} titulo="Horas × custo H/H, com o adicional nas horas extras" />
        <Kpi rotulo="Tempo médio por TPE" valor={hm(r.tempo_medio_tpe)} sub={`Prazo médio ${h1(r.prazo_medio)} dias corridos`} titulo="Horas por TPE (revisões somadas à original) e dias corridos do início à finalização" />
        <Kpi rotulo="Horas nos últimos 7 dias" valor={h1(pend.semana.reduce((s: number, a: any) => s + a.horas_totais, 0))} sub={`${pend.semana.length} apontamentos`} />
        <Kpi rotulo="Custo médio por O.S." valor={reais0(k.custos.por_os)} sub="Inclui O.S. internas" titulo="Custo total ÷ O.S. atendidas" />
      </div>
      <div className="grid2">
        <div className="card">
          <h2>Pendências</h2>
          <table className="tabela"><tbody>
            {([
              ['TPEs em aberto sem responsável', pend.semResp.length, '/master/tpes?f=semresp'],
              ['TPEs com prazo vencido', pend.atrasadas.length, '/master/tpes?f=atrasadas'],
              ['TPEs que vencem em até 3 dias', pend.breve.length, '/master/tpes?f=breve'],
              ['TPEs atribuídas sem prazo definido', pend.semPrazo.length, '/master/tpes?f=semprazo'],
              ['O.S. em andamento com prazo final vencido', pend.osVencidas.length, '/master/os'],
              ['Lançamentos com horário sobreposto (mesmo projetista e dia)', pend.sobrep.length, '/master/apontamentos?f=sobrepostos'],
            ] as [string, number, string][]).map(([t, n, to]) => (
              <tr key={t}><td><span className={`badge ${n ? 'ambar' : 'verde'}`}>{n ? '▲' : '●'}</span> {t}</td><td className="num"><strong>{n}</strong></td><td><Link to={to}>ver</Link></td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Ações frequentes</h2>
          <div className="grid2" style={{ gap: 10 }}>
            <Link className="btn sec" to="/master/tpes?novo=1"><Icone n="mais" /> Nova TPE</Link>
            <Link className="btn sec" to="/master/sequencias"><Icone n="sequencia" /> Ajustar sequência</Link>
            <Link className="btn sec" to="/master/dados"><Icone n="dados" /> Central de Dados</Link>
            <Link className="btn sec" to="/master/exportar"><Icone n="exportar" /> Exportar Excel</Link>
            <Link className="btn sec" to="/master/importar"><Icone n="importar" /> Importar planilha</Link>
            <Link className="btn sec" to="/master/integridade"><Icone n="escudo" /> Integridade</Link>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Carga da equipe no período</h2>
        <table className="tabela"><thead><tr><th>Projetista</th><th>Período</th><th className="num">Horas</th><th className="num">Capacidade</th><th>Índice de alocação</th><th className="num">% H.E.</th><th className="num">TPEs</th></tr></thead>
          <tbody>{k.porRecurso.map((x) => (
            <tr key={x.recurso}><td>{x.recurso}</td><td className="small">{dataBR(x.primeiro_dia)} a {dataBR(x.ultimo_dia)}</td><td className="num">{h1(x.horas)}</td><td className="num">{h1(x.capacidade)}</td>
              <td style={{ minWidth: 160 }}><div className="row" style={{ gap: 8 }}><div className="barra grow"><div style={{ width: `${Math.min(100, x.alocacao * 100)}%`, background: x.alocacao > 1 ? 'var(--vermelho)' : undefined }} /></div>{pct(x.alocacao)}</div></td>
              <td className="num">{pct(x.pct_he)}</td><td className="num">{x.tpes_atendidos}</td></tr>))}</tbody></table>
        <p className="muted small">Índice de alocação = horas apontadas ÷ capacidade (dias úteis entre o 1º e o último apontamento × 9 h seg–qui / 8 h sex). Não mede conclusão de tarefas.</p>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>Cronograma da equipe</h2><Link to="/master/sequencias">Ajustar sequência</Link></div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>Planejado (barra de cima) × realizado (barra de baixo) de cada projetista, dos últimos 15 dias até o último prazo ativo. Clique no nome para abrir a sequência.</p>
        <Gantt tpes={base.tpes} recursos={base.recursos} feriados={base.feriados} ausencias={base.ausencias} prazosOS={prazosDasOS(base.os)} aoEscolher={(id) => navegar(`/master/sequencias?r=${id}`)} />
      </div>
      {pend.atrasadas.length > 0 && (
        <div className="card"><h2>TPEs com prazo vencido</h2>
          <table className="tabela"><thead><tr><th>TPE</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Atraso</th><th>Status</th></tr></thead>
            <tbody>{pend.atrasadas.slice(0, 15).map((t: any) => <tr key={t.id}><td>{t.codigo}</td><td>{t.cliente}</td><td>{t.responsavel}</td><td>{dataBR(t.prazo)}</td><td><SeloPrazo prazo={t.prazo} status={t.status} /></td><td><Selo v={t.status} /></td></tr>)}</tbody></table></div>
      )}
    </div>
  )
}
