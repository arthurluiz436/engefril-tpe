import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { minhasTarefas, situacaoPrazo, type Tarefa } from '../../lib/dados'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hm, hojeISO, somaDias } from '../../lib/formato'
import { Aviso, Carregando, Icone, Kpi, Selo } from '../../components/ui'

export default function Inicio() {
  const { perfil } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [semana, setSemana] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    minhasTarefas().then(setTarefas).catch((e) => setErro(mensagemErro(e)))
    supabase.from('v_apontamentos').select('horas_totais').gte('dia', somaDias(hojeISO(), -6))
      .then(({ data }) => setSemana((data ?? []).reduce((s, r: any) => s + Number(r.horas_totais), 0)))
  }, [])
  const abertas = (tarefas ?? []).filter((t) => t.status !== 'FINALIZADA')
  const proxima = abertas[0]
  const atrasadas = abertas.filter((t) => situacaoPrazo(t.prazo, t.status) === 'ATRASADA').length
  const breve = abertas.filter((t) => situacaoPrazo(t.prazo, t.status) === 'VENCE EM BREVE').length
  const primeiroNome = (perfil?.nome || '').split(' ')[0]

  return (
    <div className="stack">
      <div>
        <h1>Olá{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>O que você precisa fazer hoje está aqui.</p>
      </div>
      {!perfil?.recurso_id && <Aviso tipo="atencao">Seu acesso ainda não está vinculado a um projetista. Peça ao administrador Master para concluir o cadastro.</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid2">
        <Link to="/minhas-tarefas" className="acao-grande clara">
          <Icone n="tarefas" t={30} />
          <strong>Minhas tarefas</strong>
          <span>{tarefas ? `${abertas.length} em aberto, na ordem prevista` : 'Carregando…'}</span>
        </Link>
        <Link to={proxima ? `/registrar?tpe=${proxima.tpe_id}` : '/registrar'} className="acao-grande">
          <Icone n="relogio" t={30} />
          <strong>Registrar atividade</strong>
          <span>Informe a TPE, quando trabalhou e o que foi feito</span>
        </Link>
      </div>
      {!tarefas ? <Carregando /> : (
        <>
          <div className="grid4">
            <Kpi rotulo="Tarefas em aberto" valor={abertas.length} />
            <Kpi rotulo="Prazos vencidos" valor={atrasadas} sub={atrasadas ? 'Fale com o Master se precisar replanejar' : 'Nenhum atraso'} />
            <Kpi rotulo="Vencem em até 3 dias" valor={breve} />
            <Kpi rotulo="Horas lançadas (7 dias)" valor={hm(semana)} />
          </div>
          {proxima && (
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="badge dourado">Próxima atividade</div>
                  <h2 style={{ marginTop: 8 }}>{proxima.codigo} · {proxima.principal} › {proxima.grupo}</h2>
                  <p style={{ margin: '6px 0' }}>{proxima.descricao}</p>
                  <div className="row small muted"><span>O.S. {proxima.os} · {proxima.cliente}</span><span>Prazo: {dataBR(proxima.prazo)}</span>
                    <Selo v={situacaoPrazo(proxima.prazo, proxima.status)} /><Selo v={proxima.status} /></div>
                  {proxima.instrucoes && <Aviso tipo="info"><strong>Instruções:</strong> {proxima.instrucoes}</Aviso>}
                </div>
                <Link className="btn" to={`/registrar?tpe=${proxima.tpe_id}`}>Registrar nesta TPE</Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
