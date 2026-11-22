import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { minhasTarefas, situacaoPrazo, type Tarefa } from '../../lib/dados'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hm, hojeISO, somaDias } from '../../lib/formato'
import { Aviso, Carregando, Dialogo, Icone, Kpi, Selo, SeloPrazo } from '../../components/ui'

export default function Inicio() {
  const { perfil } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [semana, setSemana] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [apsHoje, setApsHoje] = useState<number | null>(null)
  const [lembrete, setLembrete] = useState(false)
  useEffect(() => {
    minhasTarefas().then(setTarefas).catch((e) => setErro(mensagemErro(e)))
    if (perfil?.recurso_id) {
      supabase.from('apontamentos').select('id', { count: 'exact', head: true })
        .eq('recurso_id', perfil.recurso_id).eq('dia', hojeISO()).is('excluido_em', null)
        .then(({ count, error }) => {
          if (error) return
          setApsHoje(count ?? 0)
          // lembrete em janela: uma vez por entrada no sistema, enquanto não houver apontamento hoje
          const chave = `engefril.lembrete.${hojeISO()}`
          if (!count && !sessionStorage.getItem(chave)) { sessionStorage.setItem(chave, '1'); setLembrete(true) }
        })
    }
    supabase.from('v_apontamentos').select('horas_totais').gte('dia', somaDias(hojeISO(), -6))
      .then(({ data }) => setSemana((data ?? []).reduce((s, r: any) => s + Number(r.horas_totais), 0)))
  }, [])
  const abertas = (tarefas ?? []).filter((t) => t.status !== 'FINALIZADA')
  const proxima = abertas[0]
  // em andamento + atrasadas, na ordem de execução definida pelo Supervisor
  const foco = abertas.filter((t) => t.status === 'EM ANDAMENTO' || situacaoPrazo(t.prazo, t.status) === 'ATRASADA')
  const listaFoco = foco.length ? foco : proxima ? [proxima] : []
  const atrasadas = abertas.filter((t) => situacaoPrazo(t.prazo, t.status) === 'ATRASADA').length
  const breve = abertas.filter((t) => situacaoPrazo(t.prazo, t.status) === 'VENCE EM BREVE').length
  const primeiroNome = (perfil?.nome || '').split(' ')[0]

  return (
    <div className="stack">
      <div>
        <h1>Olá{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>O que você precisa fazer hoje está aqui.</p>
      </div>
      {!perfil?.recurso_id && <Aviso tipo="atencao">Seu acesso ainda não está vinculado a um projetista. Peça ao Supervisor para concluir o cadastro.</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {perfil?.recurso_id && apsHoje === 0 && (
        <div className="lembrete-dia">
          <Aviso tipo="atencao">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span><strong>Você ainda não registrou nenhum apontamento hoje ({dataBR(hojeISO())}).</strong> Lembre-se de lançar as horas trabalhadas.</span>
              <Link className="btn pequeno" to={proxima ? `/registrar?tpe=${proxima.tpe_id}` : '/registrar'}>Registrar agora</Link>
            </div>
          </Aviso>
        </div>
      )}
      <Dialogo titulo="Lembrete de apontamento" aberto={lembrete} aoFechar={() => setLembrete(false)}>
        <div className="stack">
          <p style={{ margin: 0 }}>Você ainda <strong>não fez nenhum apontamento hoje</strong> ({dataBR(hojeISO())}). Registre as atividades do dia para manter as horas em dia.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sec" onClick={() => setLembrete(false)}>Depois</button>
            <Link className="btn" to={proxima ? `/registrar?tpe=${proxima.tpe_id}` : '/registrar'}>Registrar agora</Link>
          </div>
        </div>
      </Dialogo>
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
            <Kpi rotulo="Prazos vencidos" valor={atrasadas} sub={atrasadas ? 'Fale com o Supervisor se precisar replanejar' : 'Nenhum atraso'} />
            <Kpi rotulo="Vencem em até 3 dias" valor={breve} />
            <Kpi rotulo="Horas lançadas (7 dias)" valor={hm(semana)} />
          </div>
          {listaFoco.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <h2>{foco.length ? 'TPEs em andamento e atrasadas' : 'Próxima atividade'}</h2>
              {foco.length > 0 && <p className="muted small" style={{ margin: 0 }}>Na ordem de execução definida pelo Supervisor.{atrasadas ? ' As atrasadas têm uma faixa vermelha à esquerda e mostram há quantos dias o prazo venceu.' : ''}</p>}
              {listaFoco.map((t, i) => {
                const sit = situacaoPrazo(t.prazo, t.status)
                const atrasada = sit === 'ATRASADA'
                return (
                  <div key={t.tpe_id} className={`card tpe-foco ${atrasada ? 'atrasada' : ''}`}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="ordem" title="Ordem de execução">{t.sequencia ?? i + 1}º</span>
                          <SeloPrazo prazo={t.prazo} status={t.status} />
                          <Selo v={t.status} />
                        </div>
                        <h2 style={{ marginTop: 8 }}>{t.codigo} · {t.principal} › {t.grupo}</h2>
                        <p style={{ margin: '6px 0' }}>{t.descricao}</p>
                        <div className="row small muted"><span>O.S. {t.os} · {t.cliente}</span>
                          <span className={atrasada ? 'texto-atraso' : ''}>Prazo: {dataBR(t.prazo)}</span>
                          </div>
                        {t.instrucoes && <Aviso tipo="info"><strong>Instruções:</strong> {t.instrucoes}</Aviso>}
                      </div>
                      <Link className="btn" to={`/registrar?tpe=${t.tpe_id}`}>Registrar nesta TPE</Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
