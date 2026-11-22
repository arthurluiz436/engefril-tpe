import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR } from '../../lib/formato'
import { situacaoPrazo } from '../../lib/dados'
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
  useEffect(() => { if (base && !rec && base.recursos[0]) setRec(String(base.recursos[0].id)) }, [base, rec])
  useEffect(() => {
    if (!base || !rec) return
    setLista(base.tpes.filter((t: any) => String(t.responsavel_id) === rec && t.status !== 'FINALIZADA' && !t.arquivada).sort((a: any, b: any) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999)))
    setMudou(false)
  }, [base, rec])
  const mover = (i: number, d: number) => { const l = [...lista]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setLista(l); setMudou(true) }
  async function salvar() {
    const { error } = await supabase.rpc('reordenar_sequencia', { p_recurso: Number(rec), p_tpes: lista.map((t) => t.id) })
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', 'Sequência salva. O projetista já vê a nova ordem.'); recarregar()
  }
  function escolher(id: string) {
    if (id === rec) return
    if (mudou && !window.confirm('Há alterações não salvas na sequência atual. Trocar de projetista e descartá-las?')) return
    setRec(id)
  }
  const ordem = useMemo(() => ({ recurso: rec, ids: lista.map((t) => t.id) }), [rec, lista])
  if (!base) return <Carregando />
  return (
    <div className="stack">
      <Cabecalho titulo="Sequência por projetista" texto="Defina a ordem de execução das tarefas em aberto de cada projetista. A primeira da lista aparece para ele como “Próxima atividade”. O cronograma ao lado compara o prazo planejado com o que foi realizado." />
      <div className="seq-layout">
        <div className="stack">
          <div className="row">
            <select value={rec} onChange={(e) => escolher(e.target.value)} style={{ maxWidth: 260 }} aria-label="Projetista">{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
            <button className="btn" disabled={!mudou} onClick={salvar}>Salvar sequência</button>
            {mudou && <span className="badge ambar">alterações não salvas</span>}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {lista.length === 0 ? <Vazio>Nenhuma tarefa em aberto atribuída a este projetista.</Vazio> : lista.map((t, i) => (
              <div key={t.id} className={`tarefa ${i === 0 ? 'proxima' : ''} ${situacaoPrazo(t.prazo, t.status) === 'ATRASADA' ? 'em-atraso' : ''}`}>
                <div className="ordem">{i + 1}</div>
                <div><strong>{t.codigo}</strong> · {t.principal} › {t.grupo}<div className="small">{t.descricao}</div>
                  <div className="row small muted" style={{ gap: 8 }}>O.S. {t.os} · {t.cliente} · prazo {dataBR(t.prazo)} <SeloPrazo prazo={t.prazo} status={t.status} /> <Selo v={t.status} /></div></div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sec pequeno" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><Icone n="cima" /></button>
                  <button className="btn sec pequeno" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><Icone n="baixo" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card seq-gantt">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Cronograma da equipe</h2>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={soEste} onChange={(e) => setSoEste(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Só o projetista escolhido</label>
          </div>
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            Uma faixa por projetista, com as tarefas na ordem da sequência{mudou ? ' (já mostrando a ordem ainda não salva)' : ''}. Em cada tarefa, a barra de cima é o <strong>planejado</strong> e a de baixo o <strong>realizado</strong>. Passe o mouse para ver as datas; clique no nome para ver a sequência.
          </p>
          <Gantt tpes={base.tpes} recursos={base.recursos} ordem={ordem} destaque={rec} aoEscolher={escolher} somente={soEste ? rec : undefined} />
        </div>
      </div>
    </div>
  )
}
