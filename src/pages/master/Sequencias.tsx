import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hojeISO, osBR } from '../../lib/formato'
import { paraParametros, prazosDasOS, situacaoPrazo } from '../../lib/dados'
import { horasPorDiaUtil } from '../../lib/calculo'
import { diasDeAusencia, diasDeFeriasNoPeriodo, duracaoTarefa, indisponiveis, prazoMedioGrupo, reprogramarFila } from '../../lib/agenda'
import { Cabecalho, Carregando, Icone, Selo, SeloPrazo, Vazio, useAvisar } from '../../components/ui'
import Gantt from '../../components/Gantt'

export default function Sequencias() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const [qs] = useSearchParams()
  const [rec, setRec] = useState<string>(qs.get('r') ?? '')
  const [lista, setLista] = useState<any[]>([])
  const [mudou, setMudou] = useState(false)
  const [soEste, setSoEste] = useState(false)
  const [reprogramar, setReprogramar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  // inícios editados à mão (id → data), ainda não salvos
  const [inicios, setInicios] = useState<Map<number, string>>(new Map())
  useEffect(() => { if (base && !rec && base.recursos[0]) setRec(String(base.recursos[0].id)) }, [base, rec])
  useEffect(() => {
    if (!base || !rec) return
    setLista(base.tpes.filter((t: any) => String(t.responsavel_id) === rec && t.status !== 'FINALIZADA' && !t.arquivada).sort((a: any, b: any) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999)))
    setMudou(false); setInicios(new Map())
  }, [base, rec])
  // ordem salva no banco: mantém a folga (ou a passagem no mesmo dia) entre TPEs que continuam vizinhas
  const ordemSalva = useMemo(() => (base ? base.tpes.filter((t: any) => String(t.responsavel_id) === rec && t.status !== 'FINALIZADA' && !t.arquivada)
    .sort((a: any, b: any) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999)).map((t: any) => t.id as number) : []), [base, rec])
  const mudarInicio = (id: number, data: string) => {
    const m = new Map(inicios)
    const orig = String(base?.tpes.find((t: any) => t.id === id)?.data_inicio ?? '').slice(0, 10)
    if (!data || data === orig) m.delete(id); else m.set(id, data)
    setInicios(m)
  }
  const editado = mudou || inicios.size > 0
  const mover = (i: number, d: number) => { const l = [...lista]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setLista(l); setMudou(true) }

  // programação atualizada (como no MS Project): mantém a duração (dias úteis) de cada TPE e encadeia na ordem
  // da lista, pulando sábados, domingos, feriados e férias. Tarefa iniciada mantém as datas (linha de base), mas o
  // fim efetivo dela (atraso até hoje ou término antecipado) empurra ou puxa as seguintes. Calculada sempre,
  // não só ao mudar a ordem: atraso de uma TPE desatualiza o cronograma das próximas.
  const plano = useMemo(() => {
    // mudar a ordem (setas ou arrastar) ou o início já reprograma; a caixa aplica também o andamento real sem mexer na ordem
    if (!base || (!reprogramar && !inicios.size && !mudou) || !lista.length) return null
    const outras = new Map(base.tpes.map((t: any) => [t.id, t]))
    return reprogramarFila(lista, indisponiveis(base.feriados, base.ausencias, rec), outras as any, hojeISO(), { inicios, ferias: diasDeAusencia(base.ausencias, rec) })
  }, [base, lista, reprogramar, rec, mudou, inicios])
  const novasDatas = useMemo(() => {
    if (!plano) return undefined
    return new Map(plano.filter((p) => p.mudou).map((p) => [p.id, { data_inicio: p.para[0], prazo: p.para[1] }]))
  }, [plano])
  const planoDe = (id: number) => plano?.find((p) => p.id === id)
  // prazo definido de cada TPE (dias úteis do início ao prazo) e o prazo sugerido pela média de horas do grupo
  const horasDia = useMemo(() => (base ? horasPorDiaUtil(paraParametros(base.parametros)) : 8.8), [base])
  const naoUteis = useMemo(() => (base ? indisponiveis(base.feriados, base.ausencias, rec) : new Set<string>()), [base, rec])
  const ferias = useMemo(() => (base ? diasDeAusencia(base.ausencias, rec) : new Set<string>()), [base, rec])
  const mediaDe = (t: any) => (base && t.principal && t.grupo ? prazoMedioGrupo(base.tpes, t.principal, t.grupo, horasDia) : null)
  const qtdMudancas = plano ? plano.filter((p) => p.mudou).length : 0
  const atrasadasIni = plano ? plano.filter((p) => p.iniciada && (p.desvio ?? 0) > 0) : []
  const adiantadasIni = plano ? plano.filter((p) => p.iniciada && (p.desvio ?? 0) < 0) : []
  const postergadas = plano ? plano.filter((p) => p.mudou && (p.desvio ?? 0) > 0) : []
  const antecipadas = plano ? plano.filter((p) => p.mudou && (p.desvio ?? 0) < 0) : []
  const desatualizado = !editado && qtdMudancas > 0
  const du = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'dia útil' : 'dias úteis'}`

  async function salvar() {
    setSalvando(true)
    try {
      if (plano) for (const p of plano.filter((x) => x.mudou)) {
        const { error } = await supabase.from('tpes').update({ data_inicio: p.para[0], prazo: p.para[1] }).eq('id', p.id)
        if (error) throw new Error(`${p.codigo}: ${mensagemErro(error)}`)
      }
      const { error } = await supabase.rpc('reordenar_sequencia', { p_recurso: Number(rec), p_tpes: lista.map((t) => t.id) })
      if (error) throw error
      avisar('ok', `Sequência salva${qtdMudancas ? ` e ${qtdMudancas} TPE(s) reprogramada(s)` : ''}. O projetista já vê a nova ordem.`); recarregar()
    } catch (e) { avisar('erro', mensagemErro(e)) } finally { setSalvando(false) }
  }
  function escolher(id: string) {
    if (id === rec) return
    if (editado && !window.confirm('Há alterações não salvas na sequência atual. Trocar de projetista e descartá-las?')) return
    setRec(id)
  }
  const ordem = useMemo(() => ({ recurso: rec, ids: lista.map((t) => t.id) }), [rec, lista])
  if (!base) return <Carregando />
  const porId = new Map(base.tpes.map((t: any) => [t.id, t]))
  const prazosOS = prazosDasOS(base.os)
  // TPE que termina depois do prazo final da O.S. (com as datas novas, se houver)
  const foraDoPrazoOS = (t: any) => { const fim = planoDe(t.id)?.para[1] ?? t.prazo; const pz = prazosOS.get(t.os); return fim && pz && String(fim).slice(0, 10) > pz ? pz : null }
  const qtdForaOS = lista.filter(foraDoPrazoOS).length
  const feriasDe = (t: any) => { const p = planoDe(t.id); const a = p?.para[0] ?? t.data_inicio, b = p?.para[1] ?? t.prazo; return a && b ? diasDeFeriasNoPeriodo(String(a).slice(0, 10), String(b).slice(0, 10), base.feriados, base.ausencias, rec) : 0 }
  return (
    <div className="stack">
      <Cabecalho titulo="Sequência por projetista" texto="Defina a ordem de execução das tarefas em aberto de cada projetista. A primeira da lista aparece para ele como “Próxima atividade”. As datas são reprogramadas pela ordem e pelo andamento real: o atraso (ou a antecipação) de uma TPE se propaga para as seguintes, mantendo a duração de cada uma em dias úteis."
        acoes={<Link className="btn sec" to="/master/cronograma"><Icone n="grafico" /> Abrir cronograma em tela cheia</Link>} />
      <div className="seq-layout">
        <div className="stack">
          <div className="row">
            <select value={rec} onChange={(e) => escolher(e.target.value)} style={{ maxWidth: 260 }} aria-label="Projetista">{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
            <button className="btn" disabled={(!editado && !qtdMudancas) || salvando} onClick={salvar}>{salvando ? 'Salvando…' : editado ? 'Salvar sequência' : 'Atualizar cronograma'}</button>
            {editado && <span className="badge ambar">alterações não salvas</span>}
            {editado && <button type="button" className="btn fantasma pequeno" onClick={() => { setInicios(new Map()); setLista([...lista].sort((a: any, b: any) => ordemSalva.indexOf(a.id) - ordemSalva.indexOf(b.id))); setMudou(false) }}>Desfazer</button>}
          </div>
          <label className="check-lado">
            <input type="checkbox" checked={reprogramar} onChange={(e) => setReprogramar(e.target.checked)} />
            <span><strong>Reprogramar as datas</strong> pela ordem, pelo início editado à mão e pelo andamento real <span className="muted">(em escada: cada TPE começa no dia útil seguinte ao fim da anterior, sem dias vazios e sem duas no mesmo dia; mantém a duração de cada uma; atrasos empurram as seguintes; pula sábados, domingos, feriados e férias. Ao mudar a ordem, as datas são recalculadas mesmo com a caixa desmarcada)</span></span>
          </label>
          {plano && qtdMudancas > 0 && (
            <div className={`aviso ${desatualizado ? 'atencao' : 'info'}`} role="status"><Icone n={desatualizado ? 'alerta' : 'info'} /><div>
              {desatualizado ? <strong>O cronograma deste projetista está desatualizado. </strong> : null}
              {atrasadasIni.map((p) => <span key={p.id}><strong>{p.codigo}</strong> está {du(p.desvio!)} atrasada (fim previsto agora: {dataBR(p.fimEfetivo)}). </span>)}
              {adiantadasIni.map((p) => <span key={p.id}><strong>{p.codigo}</strong> começou antes e deve terminar {du(p.desvio!)} antes ({dataBR(p.fimEfetivo)}). </span>)}
              Ao {desatualizado ? 'atualizar' : 'salvar'}, <strong>{qtdMudancas} TPE(s)</strong> seguintes terão início e prazo recalculados
              {postergadas.length > 0 && <> — {postergadas.length} postergada(s)</>}{antecipadas.length > 0 && <> — {antecipadas.length} antecipada(s)</>}, mantendo a duração e a ordem (destacadas abaixo).
              {desatualizado && <div style={{ marginTop: 6 }}><button className="btn pequeno" disabled={salvando} onClick={salvar}>{salvando ? 'Atualizando…' : 'Atualizar cronograma'}</button></div>}
            </div></div>)}
          {qtdForaOS > 0 && <div className="aviso atencao" role="status"><Icone n="alerta" /><div><strong>{qtdForaOS} TPE(s)</strong> terminam depois do prazo final da O.S. (marcadas abaixo e na linha tracejada do cronograma). Confira se a ordem está certa.</div></div>}
          <div className="card" style={{ padding: 0 }}>
            {lista.length === 0 ? <Vazio>Nenhuma tarefa em aberto atribuída a este projetista.</Vazio> : lista.map((t, i) => {
              const p = planoDe(t.id)
              const pred = t.predecessora_id ? porId.get(t.predecessora_id) : null
              return (
                <div key={t.id} className={`tarefa ${i === 0 ? 'proxima' : ''} ${situacaoPrazo(t.prazo, t.status) === 'ATRASADA' ? 'em-atraso' : ''}`}>
                  <div className="ordem">{i + 1}</div>
                  <div><strong>{t.codigo}</strong> · {t.principal} › {t.grupo}<div className="small">{t.descricao}</div>
                    <div className="row small muted" style={{ gap: 8 }}>O.S. {osBR(t.os)} · {t.cliente} · {dataBR(t.data_inicio)} → {dataBR(t.prazo)} <SeloPrazo prazo={t.prazo} status={t.status} /> <Selo v={t.status} /></div>
                    {(() => {
                      const def = t.data_inicio && t.prazo ? duracaoTarefa(String(t.data_inicio).slice(0, 10), String(t.prazo).slice(0, 10), naoUteis, ferias) : null
                      const m = mediaDe(t)
                      const dif = def != null && m ? def - m.dias : null
                      return (
                        <div className="prazos-seq small">
                          <span title="Duração planejada desta TPE (do início ao prazo, em dias úteis)">Prazo definido: <strong>{def != null ? `${def} ${def === 1 ? 'dia útil' : 'dias úteis'}` : 'sem datas'}</strong></span>
                          <span title={m ? `Média de ${m.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h por TPE em ${m.n} TPE(s) ${m.base === 'grupo' ? 'do mesmo principal › grupo' : 'do mesmo principal'}, ÷ ${horasDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h por dia útil` : 'Ainda não há horas apontadas neste grupo'}>
                            Pela média{m?.base === 'principal' ? ' do principal' : ' do grupo'}: <strong>{m ? `${m.dias} ${m.dias === 1 ? 'dia útil' : 'dias úteis'}` : '—'}</strong>{m && <span className="muted"> ({m.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h · {m.n} TPE)</span>}
                          </span>
                          {dif != null && dif !== 0 && <span className={`badge ${dif > 0 ? 'azul' : 'ambar'}`} title={dif > 0 ? 'Prazo definido maior que a média' : 'Prazo definido menor que a média'}>{dif > 0 ? `+${dif}` : dif} d vs média</span>}
                        </div>)
                    })()}
                    {pred && <div className="small muted">Depois de <strong>{pred.codigo}</strong>{pred.responsavel && String(pred.responsavel_id) !== rec ? ` (${pred.responsavel})` : ''}</div>}
                    {p?.antesDaPredecessora && <div className="aviso-os small"><Icone n="alerta" t={14} /> Pela ordem, começa em {dataBR(p.para[0])}, antes de a predecessora {pred?.codigo ?? ''} começar ({dataBR(p.antesDaPredecessora.inicio)}). A fila não foi empurrada para não deixar dias vazios; o projetista só consegue apontar nela depois que a predecessora for iniciada.</div>}
                    {!p?.iniciada && t.data_inicio && t.prazo && (
                      <label className="inicio-manual small">
                        <span>Início</span>
                        <input type="date" value={inicios.get(t.id) ?? p?.para[0] ?? String(t.data_inicio).slice(0, 10)}
                          onChange={(e) => mudarInicio(t.id, e.target.value)} aria-label={`Data de início de ${t.codigo}`} />
                        {inicios.has(t.id) && <span className="badge azul" title="Data definida à mão: as TPEs seguintes se ajustam a partir dela">definido à mão</span>}
                        {inicios.has(t.id) && p?.para[0] && p.para[0] !== inicios.get(t.id) && <span className="muted">→ ajustado para {dataBR(p.para[0])} (próximo dia útil)</span>}
                      </label>)}
                    {p?.iniciada && <div className="small muted" style={{ marginTop: 4 }}>Em andamento desde {dataBR(t.primeiro_apontamento ?? t.data_inicio)}: o início não pode ser alterado.</div>}
                    {p?.mudou && <div className="reprog small"><Icone n="relogio" t={14} /> Novo período: <strong>{dataBR(p.para[0])} → {dataBR(p.para[1])}</strong> ({p.dias} {p.dias === 1 ? 'dia útil' : 'dias úteis'})
                      {(p.desvio ?? 0) !== 0 && <span className={`badge ${p.desvio! > 0 ? 'vermelho' : 'verde'}`} style={{ marginLeft: 6 }}>{p.desvio! > 0 ? `postergada +${du(p.desvio!)}` : `antecipada ${du(p.desvio!)}`}</span>}</div>}
                    {p?.iniciada && (p.desvio ?? 0) !== 0 && <div className="small" style={{ marginTop: 2 }}><span className={`badge ${p.desvio! > 0 ? 'vermelho' : 'verde'}`}>{p.desvio! > 0 ? `atraso de ${du(p.desvio!)}` : `adiantada ${du(p.desvio!)}`}</span> <span className="muted">em andamento: prazo {dataBR(p.para[1])}, fim previsto {dataBR(p.fimEfetivo)}. As datas dela não mudam; {p.desvio! > 0 ? 'as seguintes são empurradas.' : 'a seguinte começa depois do prazo dela.'}</span></div>}
                    {reprogramar && p && p.dias == null && (editado || qtdMudancas > 0) && <div className="small muted">Sem início ou prazo: as datas desta TPE não mudam e ela não empurra a fila.</div>}
                    {foraDoPrazoOS(t) && <div className="aviso-os small"><Icone n="alerta" t={14} /> Termina depois do prazo da O.S. {osBR(t.os)} ({dataBR(foraDoPrazoOS(t))})</div>}
                    {feriasDe(t) > 0 && <div className="small muted">Inclui {feriasDe(t)} dia(s) útil(eis) de férias do projetista, que não contam na duração.</div>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn sec pequeno" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><Icone n="cima" /></button>
                    <button className="btn sec pequeno" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><Icone n="baixo" /></button>
                  </div>
                </div>)
            })}
          </div>
        </div>
        <div className="card seq-gantt">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Cronograma da equipe</h2>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={soEste} onChange={(e) => setSoEste(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Só o projetista escolhido</label>
          </div>
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            Arraste as TPEs de {base.recursos.find((r: any) => String(r.id) === rec)?.nome ?? 'projetista escolhido'} (pela alça ⋮⋮) para mudar a ordem, como nas setas ao lado; nada é salvo até você clicar em Salvar sequência. Uma faixa por projetista, na cor dele{editado || qtdMudancas ? ', já com a ordem e as datas ainda não salvas' : ''}. Barra de cima: <strong>planejado</strong>; de baixo: <strong>realizado</strong>. Passe o mouse para ver as datas; clique no nome para ver a sequência.
          </p>
          <Gantt tpes={base.tpes} recursos={base.recursos} feriados={base.feriados} ordem={ordem} datas={novasDatas} destaque={rec} aoEscolher={escolher} somente={soEste ? rec : undefined}
            ausencias={base.ausencias} prazosOS={prazosOS}
            arrastar={{ recurso: rec, aoSoltar: (ids) => { const porIdL = new Map(lista.map((t) => [t.id, t])); const nova = [...ids.map((id) => porIdL.get(id)).filter(Boolean), ...lista.filter((t) => !ids.includes(t.id))]; setLista(nova as any[]); setMudou(true) } }} />
        </div>
      </div>
    </div>
  )
}
