import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { prazosDasOS } from '../../lib/dados'
import { dataBR, diasEntre, h1, hojeISO, osBR, somaDias } from '../../lib/formato'
import { cargaDiaria, corRecurso, indisponiveis } from '../../lib/agenda'
import { Cabecalho, Carregando, Icone, Kpi, Selo, SeloPrazo } from '../../components/ui'
import Gantt from '../../components/Gantt'

/**
 * Cronograma da equipe em tela cheia. Reúne o que a literatura de gestão de projetos
 * pede de um Gantt: planejado × realizado (linha de base), dependências, marco de hoje,
 * folga até o prazo, sobrecarga de recursos e janela do que vem pela frente.
 */
const ZOOM: Record<string, { rot: string; px: number | 'ajustar' }> = {
  ajustar: { rot: 'Caber na tela', px: 'ajustar' }, dias: { rot: 'Dias', px: 30 }, semanas: { rot: 'Semanas', px: 12 },
}

export default function Cronograma() {
  const { base } = useBase()
  const hoje = hojeISO()
  const [diasAntes, setDiasAntes] = useState(15)
  const [zoom, setZoom] = useState<keyof typeof ZOOM>('ajustar')
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const [os, setOs] = useState<string>('')
  const [concluidas, setConcluidas] = useState(true)
  const [setas, setSetas] = useState(true)
  const [carga, setCarga] = useState(true)
  const [sel, setSel] = useState<any | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  const an = useMemo(() => {
    if (!base) return null
    const ativas = base.tpes.filter((t: any) => !t.arquivada && t.status !== 'FINALIZADA')
    const porId = new Map(base.tpes.map((t: any) => [t.id, t]))
    const atrasadas = ativas.filter((t: any) => t.prazo && String(t.prazo).slice(0, 10) < hoje)
    const semDatas = ativas.filter((t: any) => t.responsavel_id && (!t.data_inicio || !t.prazo))
    const semResp = ativas.filter((t: any) => !t.responsavel_id)
    // dependência violada: a sucessora está planejada para começar antes da predecessora
    const conflitos = ativas.filter((t: any) => {
      const p: any = t.predecessora_id ? porId.get(t.predecessora_id) : null
      return p && t.data_inicio && p.data_inicio && String(t.data_inicio) < String(p.data_inicio)
    }).map((t: any) => ({ t, p: porId.get(t.predecessora_id) as any }))
    // prazo da TPE depois do prazo final da O.S. (marco do cliente)
    const osMap = new Map(base.os.map((o: any) => [o.os, o]))
    const foraOS = ativas.filter((t: any) => { const o: any = osMap.get(t.os); return o?.prazo_final && t.prazo && String(t.prazo) > String(o.prazo_final) })
      .map((t: any) => ({ t, o: osMap.get(t.os) as any }))
    // sobrecarga: dias úteis em que o projetista tem 2+ tarefas planejadas ao mesmo tempo
    const sobrecarga = base.recursos.map((r: any, i: number) => {
      const minhas = ativas.filter((t: any) => String(t.responsavel_id) === String(r.id) && t.data_inicio && t.prazo)
      // mesma regra do gráfico: passagem (uma termina e outra começa no mesmo dia) não é sobrecarga
      const { carga, sobre } = cargaDiaria(minhas, indisponiveis(base.feriados, base.ausencias, r.id), hoje, hoje)
      const cheios = [...carga.entries()].filter(([x]) => sobre.has(x)).map(([x, v]) => [x, v.map((t: any) => t.codigo)] as [string, string[]])
        .sort(([a], [b]) => a.localeCompare(b))
      return { r, cor: corRecurso(r, i), cheios }
    }).filter((x: any) => x.cheios.length)
    // o que vem pela frente (próximos 10 dias): inícios e prazos
    const ate = somaDias(hoje, 10)
    const frente = [
      ...ativas.filter((t: any) => t.data_inicio && String(t.data_inicio) >= hoje && String(t.data_inicio) <= ate).map((t: any) => ({ d: String(t.data_inicio).slice(0, 10), tipo: 'Início', t })),
      ...ativas.filter((t: any) => t.prazo && String(t.prazo) >= hoje && String(t.prazo) <= ate).map((t: any) => ({ d: String(t.prazo).slice(0, 10), tipo: 'Prazo', t })),
    ].sort((a, b) => a.d.localeCompare(b.d))
    const osComTpe = [...new Set(base.tpes.filter((t: any) => !t.arquivada).map((t: any) => t.os))].sort((a: any, b: any) => b - a)
    return { ativas, atrasadas, semDatas, semResp, conflitos, foraOS, sobrecarga, frente, osComTpe, porId }
  }, [base, hoje])

  if (!base || !an) return <Carregando />
  const visiveis = base.recursos.filter((r: any) => !ocultos.has(String(r.id))).map((r: any) => String(r.id))
  const alternar = (id: string) => { const s = new Set(ocultos); if (s.has(id)) s.delete(id); else s.add(id); setOcultos(s) }
  const telaCheia = () => { const el = caixa.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.() }
  const sucessoras = sel ? base.tpes.filter((t: any) => t.predecessora_id === sel.id) : []
  const predSel: any = sel?.predecessora_id ? an.porId.get(sel.predecessora_id) : null
  const diasSobre = an.sobrecarga.reduce((s: number, x: any) => s + x.cheios.length, 0)

  return (
    <div className="stack cronograma" ref={caixa}>
      <Cabecalho titulo="Cronograma da equipe" texto="Todos os projetistas num só gráfico: planejado × realizado, dependências entre TPEs, sobrecarga e o que vem pela frente. Clique numa tarefa para ver os detalhes."
        acoes={<><Link className="btn sec" to="/master/sequencias"><Icone n="sequencia" /> Ajustar sequência</Link><button className="btn sec" onClick={telaCheia}><Icone n="olho" /> Tela cheia</button></>} />

      <div className="grid4">
        <Kpi rotulo="TPEs em aberto" valor={an.ativas.length} sub={`${an.semResp.length} sem responsável · ${an.semDatas.length} sem início/prazo`} />
        <Kpi rotulo="Atrasadas" valor={an.atrasadas.length} sub={an.atrasadas.length ? 'prazo vencido e ainda em aberto' : 'nenhuma'} />
        <Kpi rotulo="Dias com sobrecarga" valor={diasSobre} sub={diasSobre ? `${an.sobrecarga.length} projetista(s) com 2+ tarefas no mesmo dia` : 'nenhum a partir de hoje'} />
        <Kpi rotulo="Conflitos de dependência" valor={an.conflitos.length + an.foraOS.length} sub={`${an.conflitos.length} antes da predecessora · ${an.foraOS.length} além do prazo da O.S.`} />
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="segmentos" role="group" aria-label="Zoom">
            {Object.entries(ZOOM).map(([k, z]) => <button key={k} type="button" aria-pressed={zoom === k} onClick={() => setZoom(k as keyof typeof ZOOM)}>{z.rot}</button>)}
          </div>
          <select value={diasAntes} onChange={(e) => setDiasAntes(Number(e.target.value))} style={{ maxWidth: 190 }} aria-label="Dias antes de hoje">
            {[7, 15, 30, 60, 90].map((n) => <option key={n} value={n}>Desde {n} dias atrás</option>)}
          </select>
          <select value={os} onChange={(e) => setOs(e.target.value)} style={{ maxWidth: 260 }} aria-label="O.S.">
            <option value="">Todas as O.S.</option>
            {an.osComTpe.map((o: any) => <option key={o} value={o}>{osBR(o)} · {(base.os.find((x: any) => x.os === o) as any)?.nome ?? ''}</option>)}
          </select>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={concluidas} onChange={(e) => setConcluidas(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Concluídas</label>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={setas} onChange={(e) => setSetas(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Setas de predecessora</label>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={carga} onChange={(e) => setCarga(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Carga por dia</label>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">Projetistas:</span>
          {base.recursos.map((r: any, i: number) => (
            <button key={r.id} type="button" className={`chip-proj ${ocultos.has(String(r.id)) ? 'off' : ''}`} style={{ borderColor: corRecurso(r, i) }} onClick={() => alternar(String(r.id))} aria-pressed={!ocultos.has(String(r.id))}>
              <span className="g2-ponto" style={{ background: corRecurso(r, i) }} />{r.nome}</button>))}
        </div>
        <Gantt tpes={base.tpes} recursos={base.recursos} feriados={base.feriados} somente={visiveis} diasAntes={diasAntes} pxDia={ZOOM[zoom].px} ausencias={base.ausencias} prazosOS={prazosDasOS(base.os)}
          mostrarConcluidas={concluidas} mostrarSetas={setas} mostrarCarga={carga} filtroOS={os ? Number(os) : null} rotulo={190}
          selecionada={sel?.id ?? null} aoSelecionar={(t) => setSel(sel?.id === t.id ? null : t)} />
      </div>

      {sel && (
        <div className="card detalhe-tpe">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{sel.codigo} · {sel.principal} › {sel.grupo}</h2>
            <div className="row" style={{ gap: 6 }}><Link className="btn sec pequeno" to={`/master/tpes?editar=${sel.id}`}><Icone n="editar" /> Editar TPE</Link><button className="btn fantasma pequeno" onClick={() => setSel(null)} aria-label="Fechar"><Icone n="fechar" /></button></div>
          </div>
          <p style={{ margin: '6px 0' }}>{sel.descricao}</p>
          <div className="grid4 small">
            <div><span className="muted">Responsável</span><div><strong>{sel.responsavel ?? '—'}</strong></div></div>
            <div><span className="muted">Planejado</span><div><strong>{dataBR(sel.data_inicio)} → {dataBR(sel.prazo)}</strong></div><SeloPrazo prazo={sel.prazo} status={sel.status} /></div>
            <div><span className="muted">Realizado</span><div><strong>{sel.primeiro_apontamento ? `${dataBR(sel.primeiro_apontamento)} → ${sel.data_fim ? dataBR(sel.data_fim) : 'em curso'}` : 'sem apontamentos'}</strong></div><div className="muted">{h1(sel.horas_totais)} h apontadas</div></div>
            <div><span className="muted">Status · O.S.</span><div><Selo v={sel.status} /> {osBR(sel.os)} · {sel.cliente}</div>
              {sel.prazo && sel.status !== 'FINALIZADA' && String(sel.prazo) >= hoje && <div className="muted">Folga até o prazo: {diasEntre(hoje, String(sel.prazo))} dia(s) corridos</div>}</div>
          </div>
          {(predSel || sucessoras.length > 0) && (
            <div className="small" style={{ marginTop: 10 }}>
              {predSel && <div>Depende de <strong>{predSel.codigo}</strong> ({predSel.responsavel ?? 'sem responsável'}) · <Selo v={predSel.status} /></div>}
              {sucessoras.length > 0 && <div>Libera: {sucessoras.map((s: any) => <span key={s.id}><strong>{s.codigo}</strong> ({s.responsavel ?? 'sem responsável'}) </span>)}</div>}
            </div>)}
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Pontos de atenção</h2>
          {!an.atrasadas.length && !an.sobrecarga.length && !an.conflitos.length && !an.foraOS.length && !an.semDatas.length && !an.semResp.length
            ? <p className="muted small">Nada a corrigir no planejamento.</p> : (
            <ul className="lista-atencao">
              {an.atrasadas.map((t: any) => <li key={`a${t.id}`}><span className="badge atraso"><span className="ponto" />atrasada</span> <strong>{t.codigo}</strong> · {t.responsavel ?? 'sem responsável'} · prazo {dataBR(t.prazo)}</li>)}
              {an.sobrecarga.map((x: any) => <li key={`s${x.r.id}`}><span className="badge vermelho">sobrecarga</span> <span className="g2-ponto" style={{ background: x.cor, display: 'inline-block' }} /> <strong>{x.r.nome}</strong>: {x.cheios.length} dia(s) com 2+ tarefas (de {dataBR(x.cheios[0][0])} a {dataBR(x.cheios[x.cheios.length - 1][0])}: {[...new Set(x.cheios.flatMap(([, v]: any) => v))].join(', ')})</li>)}
              {an.conflitos.map(({ t, p }: any) => <li key={`c${t.id}`}><span className="badge ambar">dependência</span> <strong>{t.codigo}</strong> está planejada para {dataBR(t.data_inicio)}, antes da predecessora <strong>{p.codigo}</strong> ({dataBR(p.data_inicio)})</li>)}
              {an.foraOS.map(({ t, o }: any) => <li key={`o${t.id}`}><span className="badge ambar">O.S.</span> <strong>{t.codigo}</strong> vence em {dataBR(t.prazo)}, depois do prazo final da O.S. {osBR(o.os)} ({dataBR(o.prazo_final)})</li>)}
              {an.semDatas.map((t: any) => <li key={`d${t.id}`}><span className="badge">sem datas</span> <strong>{t.codigo}</strong> ({t.responsavel}) não tem início ou prazo e não aparece completa no gráfico</li>)}
              {an.semResp.length > 0 && <li><span className="badge ambar">sem responsável</span> {an.semResp.length} TPE(s) em aberto fora do gráfico: {an.semResp.slice(0, 8).map((t: any) => t.codigo).join(', ')}{an.semResp.length > 8 ? '…' : ''} · <Link to="/master/tpes?f=semresp">atribuir</Link></li>}
            </ul>)}
        </div>
        <div className="card">
          <h2>Próximos 10 dias</h2>
          {!an.frente.length ? <p className="muted small">Nenhum início ou prazo nos próximos 10 dias.</p> : (
            <table className="tabela"><tbody>{an.frente.map((f: any, i: number) => (
              <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setSel(f.t)}><td className="sem-quebra">{dataBR(f.d)}</td><td><span className={`badge ${f.tipo === 'Prazo' ? 'ambar' : 'azul'}`}>{f.tipo}</span></td><td><strong>{f.t.codigo}</strong> <span className="small muted">{f.t.grupo}</span></td><td className="small">{f.t.responsavel ?? '—'}</td></tr>))}</tbody></table>)}
        </div>
      </div>
      <p className="muted small">Como ler: cada faixa colorida é um projetista. A barra clara é o <strong>planejado</strong> (linha de base) e a escura é o <strong>realizado</strong>; a diferença entre elas mostra adiantamento ou atraso. Setas tracejadas na cor de outro projetista indicam que a TPE <strong>passa de uma pessoa para outra</strong>. Marcas vermelhas na faixa indicam <strong>sobrecarga</strong> (duas ou mais tarefas planejadas no mesmo dia útil). Quando uma tarefa termina e a próxima começa no mesmo dia, é passagem e não conta como sobrecarga.</p>
    </div>
  )
}
