import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hojeISO, osBR } from '../../lib/formato'
import { prazosDasOS, situacaoPrazo } from '../../lib/dados'
import { diasDeFeriasNoPeriodo, indisponiveis, reprogramarFila } from '../../lib/agenda'
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
  const [reprogramar, setReprogramar] = useState(true)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (base && !rec && base.recursos[0]) setRec(String(base.recursos[0].id)) }, [base, rec])
  useEffect(() => {
    if (!base || !rec) return
    setLista(base.tpes.filter((t: any) => String(t.responsavel_id) === rec && t.status !== 'FINALIZADA' && !t.arquivada).sort((a: any, b: any) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999)))
    setMudou(false)
  }, [base, rec])
  const mover = (i: number, d: number) => { const l = [...lista]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setLista(l); setMudou(true) }

  // programação atualizada (como no MS Project): mantém a duração (dias úteis) de cada TPE e encadeia na ordem
  // da lista, pulando sábados, domingos, feriados e férias. Tarefa iniciada mantém as datas (linha de base), mas o
  // fim efetivo dela (atraso até hoje ou término antecipado) empurra ou puxa as seguintes. Calculada sempre,
  // não só ao mudar a ordem: atraso de uma TPE desatualiza o cronograma das próximas.
  const plano = useMemo(() => {
    if (!base || !reprogramar || !lista.length) return null
    const outras = new Map(base.tpes.map((t: any) => [t.id, t]))
    return reprogramarFila(lista, indisponiveis(base.feriados, base.ausencias, rec), outras as any, hojeISO())
  }, [base, lista, reprogramar, rec])
  const novasDatas = useMemo(() => {
    if (!plano) return undefined
    return new Map(plano.filter((p) => p.mudou).map((p) => [p.id, { data_inicio: p.para[0], prazo: p.para[1] }]))
  }, [plano])
  const planoDe = (id: number) => plano?.find((p) => p.id === id)
  const qtdMudancas = plano ? plano.filter((p) => p.mudou).length : 0
  const atrasadasIni = plano ? plano.filter((p) => p.iniciada && (p.desvio ?? 0) > 0) : []
  const adiantadasIni = plano ? plano.filter((p) => p.iniciada && (p.desvio ?? 0) < 0) : []
  const postergadas = plano ? plano.filter((p) => p.mudou && (p.desvio ?? 0) > 0) : []
  const antecipadas = plano ? plano.filter((p) => p.mudou && (p.desvio ?? 0) < 0) : []
  const desatualizado = !mudou && qtdMudancas > 0
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
    if (mudou && !window.confirm('Há alterações não salvas na sequência atual. Trocar de projetista e descartá-las?')) return
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
            <button className="btn" disabled={(!mudou && !qtdMudancas) || salvando} onClick={salvar}>{salvando ? 'Salvando…' : mudou ? 'Salvar sequência' : 'Atualizar cronograma'}</button>
            {mudou && <span className="badge ambar">alterações não salvas</span>}
          </div>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={reprogramar} onChange={(e) => setReprogramar(e.target.checked)} style={{ width: 16, minHeight: 0 }} />
            Reprogramar as datas pela ordem e pelo andamento real (mantém a duração de cada TPE; atrasos empurram e antecipações puxam as seguintes; pula sábados, domingos, feriados e férias)
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
                    {pred && <div className="small muted">Depois de <strong>{pred.codigo}</strong>{pred.responsavel && String(pred.responsavel_id) !== rec ? ` (${pred.responsavel})` : ''}</div>}
                    {p?.mudou && <div className="reprog small"><Icone n="relogio" t={14} /> Novo período: <strong>{dataBR(p.para[0])} → {dataBR(p.para[1])}</strong> ({p.dias} {p.dias === 1 ? 'dia útil' : 'dias úteis'})
                      {(p.desvio ?? 0) !== 0 && <span className={`badge ${p.desvio! > 0 ? 'vermelho' : 'verde'}`} style={{ marginLeft: 6 }}>{p.desvio! > 0 ? `postergada +${du(p.desvio!)}` : `antecipada ${du(p.desvio!)}`}</span>}</div>}
                    {p?.iniciada && (p.desvio ?? 0) !== 0 && <div className="small" style={{ marginTop: 2 }}><span className={`badge ${p.desvio! > 0 ? 'vermelho' : 'verde'}`}>{p.desvio! > 0 ? `atraso de ${du(p.desvio!)}` : `adiantada ${du(p.desvio!)}`}</span> <span className="muted">em andamento: prazo {dataBR(p.para[1])}, fim previsto {dataBR(p.fimEfetivo)}. As datas dela não mudam; as seguintes se ajustam.</span></div>}
                    {reprogramar && p && p.dias == null && (mudou || qtdMudancas > 0) && <div className="small muted">Sem início ou prazo: as datas desta TPE não mudam e ela não empurra a fila.</div>}
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
            Uma faixa por projetista, na cor dele{mudou ? ', já com a ordem e as datas ainda não salvas' : ''}. Barra de cima: <strong>planejado</strong>; de baixo: <strong>realizado</strong>. Passe o mouse para ver as datas; clique no nome para ver a sequência.
          </p>
          <Gantt tpes={base.tpes} recursos={base.recursos} feriados={base.feriados} ordem={ordem} datas={novasDatas} destaque={rec} aoEscolher={escolher} somente={soEste ? rec : undefined}
            ausencias={base.ausencias} prazosOS={prazosOS} />
        </div>
      </div>
    </div>
  )
}
