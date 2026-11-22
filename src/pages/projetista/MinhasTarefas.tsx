import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { minhasTarefas, situacaoPrazo, type Tarefa } from '../../lib/dados'
import { mensagemErro } from '../../lib/supabase'
import { dataBR, hm } from '../../lib/formato'
import { Aviso, Cabecalho, Carregando, Selo, SeloPrazo, Vazio } from '../../components/ui'

export default function MinhasTarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [todas, setTodas] = useState(false)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const carregar = () => minhasTarefas().then(setTarefas).catch((e) => setErro(mensagemErro(e)))
  useEffect(() => {
    carregar()
    // atualiza sozinho quando o Master muda atribuições/sequência (sem reenviar planilhas)
    const t = setInterval(carregar, 60000)
    const onFoco = () => carregar()
    window.addEventListener('focus', onFoco)
    return () => { clearInterval(t); window.removeEventListener('focus', onFoco) }
  }, [])
  const lista = (tarefas ?? [])
    .filter((t) => todas || t.status !== 'FINALIZADA')
    .filter((t) => !busca || `${t.codigo} ${t.cliente} ${t.descricao} ${t.grupo} ${t.os}`.toLowerCase().includes(busca.toLowerCase()))
  const primeiraAberta = lista.find((t) => t.status !== 'FINALIZADA')

  return (
    <div className="stack">
      <Cabecalho titulo="Minhas tarefas" texto="Aqui estão as atividades atribuídas a você, organizadas pela sequência prevista. A primeira em aberto é a próxima a executar." />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="row nao-imprimir">
        <input type="search" placeholder="Buscar TPE, cliente ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 360 }} aria-label="Buscar" />
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} style={{ width: 16, minHeight: 0 }} /> Mostrar finalizadas</label>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {!tarefas ? <Carregando /> : lista.length === 0 ? <Vazio>Nenhuma tarefa {todas ? '' : 'em aberto '}atribuída a você.</Vazio> :
          lista.map((t, i) => {
            const sit = situacaoPrazo(t.prazo, t.status)
            return (
              <div key={t.tpe_id} className={`tarefa ${t === primeiraAberta ? 'proxima' : ''} ${sit === 'ATRASADA' ? 'em-atraso' : ''}`}>
                <div className="ordem" title="Ordem de execução">{i + 1}</div>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{t.codigo}</strong><span className="muted">·</span><span>{t.principal} › {t.grupo}</span>
                    {t === primeiraAberta && <span className="badge dourado">Próxima</span>}
                  </div>
                  <div style={{ margin: '4px 0' }}>{t.descricao || <span className="muted">Sem descrição</span>}</div>
                  <div className="row small muted" style={{ gap: 14 }}>
                    <span>O.S. {t.os} · {t.cliente}{t.cidade ? ` — ${t.cidade}/${t.uf}` : ''}</span>
                    <span>Prazo: <strong>{dataBR(t.prazo)}</strong></span>
                    <span>Suas horas: {hm(Number(t.horas_apontadas))}</span>
                    {t.ultimo_apontamento && <span>Último registro: {dataBR(t.ultimo_apontamento)}</span>}
                  </div>
                  {t.instrucoes && <div className="small" style={{ marginTop: 6 }}><strong>Instruções:</strong> {t.instrucoes}</div>}
                </div>
                <div className="stack" style={{ gap: 8, justifyItems: 'end' }}>
                  <div className="row" style={{ gap: 6 }}><Selo v={t.status} /><SeloPrazo prazo={t.prazo} status={t.status} /></div>
                  {t.status !== 'FINALIZADA' && <Link className="btn pequeno" to={`/registrar?tpe=${t.tpe_id}`}>Registrar</Link>}
                </div>
              </div>
            )
          })}
      </div>
      <p className="muted small">O status da tarefa é atualizado pelo Master. Registrar horas não marca a tarefa como concluída.</p>
    </div>
  )
}
