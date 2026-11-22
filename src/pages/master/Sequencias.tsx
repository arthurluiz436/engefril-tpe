import { useEffect, useState } from 'react'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR } from '../../lib/formato'
import { situacaoPrazo } from '../../lib/dados'
import { Cabecalho, Carregando, Icone, Selo, Vazio, useAvisar } from '../../components/ui'

export default function Sequencias() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const [rec, setRec] = useState<string>('')
  const [lista, setLista] = useState<any[]>([])
  const [mudou, setMudou] = useState(false)
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
  if (!base) return <Carregando />
  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <Cabecalho titulo="Sequência por projetista" texto="Defina a ordem de execução das tarefas em aberto de cada projetista. A primeira da lista aparece para ele como “Próxima atividade”." />
      <div className="row">
        <select value={rec} onChange={(e) => setRec(e.target.value)} style={{ maxWidth: 260 }} aria-label="Projetista">{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
        <button className="btn" disabled={!mudou} onClick={salvar}>Salvar sequência</button>
        {mudou && <span className="badge ambar">alterações não salvas</span>}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {lista.length === 0 ? <Vazio>Nenhuma tarefa em aberto atribuída a este projetista.</Vazio> : lista.map((t, i) => (
          <div key={t.id} className={`tarefa ${i === 0 ? 'proxima' : ''}`}>
            <div className="ordem">{i + 1}</div>
            <div><strong>{t.codigo}</strong> · {t.principal} › {t.grupo}<div className="small">{t.descricao}</div>
              <div className="row small muted">O.S. {t.os} · {t.cliente} · prazo {dataBR(t.prazo)} <Selo v={situacaoPrazo(t.prazo, t.status)} /> <Selo v={t.status} /></div></div>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn sec pequeno" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><Icone n="cima" /></button>
              <button className="btn sec pequeno" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><Icone n="baixo" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
