import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { aguardandoPredecessora, minhasTarefas, situacaoPrazo, type Tarefa } from '../../lib/dados'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hm, hojeISO, osBR, somaDias } from '../../lib/formato'
import { Aviso, Carregando, Dialogo, Icone, Kpi, Selo, SeloPrazo } from '../../components/ui'

interface ApHoje {
  id: number; seq: number; tpe_codigo: string; grupo: string; tpe_descricao: string; hora_inicio: string; hora_fim: string; descricao: string
  horas_normais: number; horas_extras: number; horas_totais: number; inicio_jornada: string | null; fim_jornada: string | null
}
const minutos = (h: string) => { const [a, b] = h.slice(0, 5).split(':').map(Number); return a * 60 + b }

/** Apontamentos que o projetista já lançou hoje, com uma régua do dia (06h–20h). */
function ApontamentosHoje({ lista, proximaTpe }: { lista: ApHoje[]; proximaTpe?: number }) {
  const total = lista.reduce((s, a) => s + Number(a.horas_totais), 0)
  const extras = lista.reduce((s, a) => s + Number(a.horas_extras), 0)
  const ini = 6 * 60, fim = 20 * 60, pos = (m: number) => `${Math.max(0, Math.min(100, ((m - ini) / (fim - ini)) * 100))}%`
  const larg = (a: number, b: number) => `${Math.max(0.8, ((Math.min(b, fim) - Math.max(a, ini)) / (fim - ini)) * 100)}%`
  const linkReg = proximaTpe ? `/registrar?tpe=${proximaTpe}` : '/registrar'
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h2 style={{ margin: 0 }}>Seus apontamentos de hoje</h2>
          <div className="muted small">{dataBR(hojeISO())} · {lista.length ? <><strong>{hm(total)}</strong> lançadas em {lista.length} {lista.length === 1 ? 'registro' : 'registros'}{extras > 0.0001 ? <> · <span style={{ color: 'var(--ambar)', fontWeight: 600 }}>{hm(extras)} em hora extra</span></> : ''}</> : 'nenhum registro ainda'}</div>
        </div>
        <Link className="btn sec pequeno" to={linkReg}><Icone n="mais" t={16} /> {lista.length ? 'Registrar mais' : 'Registrar agora'}</Link>
      </div>
      {lista.length > 0 && (
        <>
          <div className="linha-dia" role="img" aria-label="Horários já apontados hoje entre 6h e 20h">
            <i style={{ left: pos(12 * 60), width: larg(12 * 60, 13 * 60) }} title="Almoço" />
            {lista.map((a) => {
              const a0 = minutos(a.hora_inicio), a1 = minutos(a.hora_fim)
              return <span key={a.id} className={Number(a.horas_extras) > 0.0001 && Number(a.horas_normais) < 0.0001 ? 'extra' : ''} style={{ left: pos(a0), width: larg(a0, a1) }} title={`${a.tpe_codigo} · ${a.hora_inicio.slice(0, 5)}–${a.hora_fim.slice(0, 5)}`} />
            })}
          </div>
          <div className="row small muted" style={{ justifyContent: 'space-between', marginBottom: 6 }}><span>06h</span><span>12h</span><span>20h</span></div>
          <div className="aps-hoje">
            {lista.map((a) => (
              <div key={a.id} className="ap">
                <div className="faixa">{a.hora_inicio.slice(0, 5)}–{a.hora_fim.slice(0, 5)}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{a.tpe_codigo}</strong> <span className="muted small">· {a.grupo}</span>
                  <div className="small">{a.descricao}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="dur">{hm(Number(a.horas_totais))}</div>
                  {Number(a.horas_extras) > 0.0001 && <span className="badge ambar" title="Parte fora da jornada do dia">{hm(Number(a.horas_extras))} extra</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Para corrigir um lançamento, use <Link to="/meus-apontamentos">Meus apontamentos</Link>.</p>
        </>
      )}
    </div>
  )
}

export default function Inicio() {
  const { perfil } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [semana, setSemana] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [listaHoje, setListaHoje] = useState<ApHoje[] | null>(null)
  const apsHoje = listaHoje ? listaHoje.length : null
  const [lembrete, setLembrete] = useState(false)
  useEffect(() => {
    minhasTarefas().then(setTarefas).catch((e) => setErro(mensagemErro(e)))
    const carregarHoje = (primeira: boolean) => {
      if (!perfil?.recurso_id) return
      supabase.from('v_apontamentos')
        .select('id, seq, tpe_codigo, grupo, tpe_descricao, hora_inicio, hora_fim, descricao, horas_normais, horas_extras, horas_totais, inicio_jornada, fim_jornada')
        .eq('recurso_id', perfil.recurso_id).eq('dia', hojeISO()).order('hora_inicio')
        .then(({ data, error }) => {
          if (error) return
          const l = (data ?? []) as ApHoje[]
          setListaHoje(l)
          // lembrete em janela: uma vez por entrada no sistema, enquanto não houver apontamento hoje
          const chave = `engefril.lembrete.${hojeISO()}`
          if (primeira && !l.length && !sessionStorage.getItem(chave)) { sessionStorage.setItem(chave, '1'); setLembrete(true) }
        })
    }
    carregarHoje(true)
    // atualiza ao voltar para a aba (ex.: depois de registrar em outra janela)
    const onFoco = () => carregarHoje(false)
    window.addEventListener('focus', onFoco)
    supabase.from('v_apontamentos').select('horas_totais').gte('dia', somaDias(hojeISO(), -6))
      .then(({ data }) => setSemana((data ?? []).reduce((s, r: any) => s + Number(r.horas_totais), 0)))
    return () => window.removeEventListener('focus', onFoco)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
          {perfil?.recurso_id && listaHoje && <ApontamentosHoje lista={listaHoje} proximaTpe={proxima?.tpe_id} />}
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
                          {aguardandoPredecessora(t) && <span className="badge aguardando">⏳ aguardando {t.predecessora_codigo}</span>}
                          <Selo v={t.status} />
                        </div>
                        <h2 style={{ marginTop: 8 }}>{t.codigo} · {t.principal} › {t.grupo}</h2>
                        <p style={{ margin: '6px 0' }}>{t.descricao}</p>
                        <div className="row small muted"><span>O.S. {osBR(t.os)} · {t.cliente}</span>
                          <span className={atrasada ? 'texto-atraso' : ''}>Prazo: {dataBR(t.prazo)}</span>
                          </div>
                        {t.instrucoes && <Aviso tipo="info"><strong>Instruções:</strong> {t.instrucoes}</Aviso>}
                      </div>
                      {aguardandoPredecessora(t) ? <span className="small muted" style={{ maxWidth: 220 }}>Liberada quando {t.predecessora_codigo} for iniciada</span> : <Link className="btn" to={`/registrar?tpe=${t.tpe_id}`}>Registrar nesta TPE</Link>}
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
