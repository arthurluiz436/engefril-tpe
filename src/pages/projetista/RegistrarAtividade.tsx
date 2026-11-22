import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { minhasTarefas, paraParametros, type Tarefa } from '../../lib/dados'
import { supabase, mensagemErro } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { dataBR, hm, hojeISO, somaDias } from '../../lib/formato'
import { calcularApontamento, min, type Parametros } from '../../lib/calculo'
import { Aviso, Cabecalho, Campo, Carregando, Icone, useAvisar, useConfirmar } from '../../components/ui'

const RASCUNHO = 'engefril.rascunho.apontamento'
const JANELA = 45 // deve coincidir com public.janela_lancamento_dias()

interface Form { tpe_id: number | null; dia: string; hora_inicio: string; hora_fim: string; descricao: string; req: string }
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
function diaSemana(iso: string) { const [a, m, d] = iso.split('-').map(Number); return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] }
const novoForm = (tpe: number | null = null): Form => ({ tpe_id: tpe, dia: hojeISO(), hora_inicio: '', hora_fim: '', descricao: '', req: crypto.randomUUID() })

export default function RegistrarAtividade() {
  const { perfil } = useAuth()
  const avisar = useAvisar()
  const { confirmar, elemento: dialogoConfirmar } = useConfirmar()
  const [parametros, setParametros] = useState<Parametros | null>(null)
  const [feriados, setFeriados] = useState<Set<string>>(new Set())
  const [inicioPadrao, setInicioPadrao] = useState('07:00')
  const [params] = useSearchParams()
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [passo, setPasso] = useState(1)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<{ codigo: string; seq: number } | null>(null)
  const [doDia, setDoDia] = useState<{ hora_inicio: string; hora_fim: string; tpe_codigo: string }[]>([])
  const [f, setF] = useState<Form>(() => {
    const r = localStorage.getItem(RASCUNHO)
    const tpe = params.get('tpe') ? Number(params.get('tpe')) : null
    if (r) { try { const x = JSON.parse(r) as Form; if (!tpe || x.tpe_id === tpe) return x } catch { /* ignora */ } }
    return novoForm(tpe)
  })

  useEffect(() => { minhasTarefas().then((t) => setTarefas(t.filter((x) => x.status !== 'FINALIZADA'))).catch((e) => setErro(mensagemErro(e))) }, [])
  useEffect(() => {
    supabase.from('feriados').select('data').then(({ data }) => setFeriados(new Set((data ?? []).map((x: any) => String(x.data).slice(0, 10)))))
    if (perfil?.recurso_id) supabase.from('recursos').select('inicio_padrao').eq('id', perfil.recurso_id).maybeSingle()
      .then(({ data }) => { if (data?.inicio_padrao) setInicioPadrao(String(data.inicio_padrao).slice(0, 5)) })
  }, [perfil?.recurso_id])
  useEffect(() => {
    if (!f.dia) return
    supabase.rpc('parametros_vigentes', { p_dia: f.dia }).then(({ data, error }) => { if (!error && data) setParametros(paraParametros(data)) })
  }, [f.dia])
  useEffect(() => { localStorage.setItem(RASCUNHO, JSON.stringify(f)) }, [f])
  useEffect(() => {
    if (!f.dia) return
    supabase.from('v_apontamentos').select('hora_inicio, hora_fim, tpe_codigo').eq('dia', f.dia)
      .then(({ data }) => setDoDia((data ?? []) as any))
  }, [f.dia, salvo])
  useEffect(() => { if (f.tpe_id && passo === 1 && params.get('tpe')) setPasso(2) }, []) // eslint-disable-line

  const tarefa = tarefas?.find((t) => t.tpe_id === f.tpe_id)
  const hoje = hojeISO()
  const erros = useMemo(() => {
    const e: Record<string, string> = {}
    if (!f.tpe_id) e.tpe = 'Escolha a TPE.'
    if (!f.dia) e.dia = 'Informe a data.'
    else if (f.dia > somaDias(hoje, 1)) e.dia = 'A data não pode ser futura.'
    else if (f.dia < somaDias(hoje, -JANELA)) e.dia = `Lançamentos com mais de ${JANELA} dias devem ser feitos pelo Master.`
    if (!/^\d{2}:\d{2}$/.test(f.hora_inicio)) e.inicio = 'Informe o horário de início.'
    if (!/^\d{2}:\d{2}$/.test(f.hora_fim)) e.fim = 'Informe o horário de término.'
    else if (f.hora_inicio && min(f.hora_fim) <= min(f.hora_inicio)) e.fim = 'O término deve ser depois do início.'
    if (f.descricao.trim().length < 3) e.descricao = 'Descreva brevemente o que foi feito.'
    if (f.descricao.length > 500) e.descricao = 'Use no máximo 500 caracteres.'
    return e
  }, [f, hoje])
  const sobrepostos = doDia.filter((d) => f.hora_inicio && f.hora_fim && min(d.hora_inicio.slice(0, 5)) < min(f.hora_fim) && min(d.hora_fim.slice(0, 5)) > min(f.hora_inicio))
  const duracao = f.hora_inicio && f.hora_fim && !erros.fim ? (min(f.hora_fim) - min(f.hora_inicio) - Math.max(0, Math.min(min(f.hora_fim), 780) - Math.max(min(f.hora_inicio), 720))) / 60 : null
  // hora extra prevista para este lançamento (mesma regra do cálculo oficial)
  const extra = useMemo(() => {
    if (!parametros || duracao == null || erros.dia || erros.inicio || erros.fim) return null
    const inicios = [...doDia.map((d) => d.hora_inicio.slice(0, 5)), f.hora_inicio]
    const r = calcularApontamento({ dia: f.dia, hora_inicio: f.hora_inicio, hora_fim: f.hora_fim }, parametros, feriados, inicioPadrao, inicios, null)
    return r.horas_extras > 0.0001 ? r : null
  }, [parametros, feriados, inicioPadrao, doDia, f.dia, f.hora_inicio, f.hora_fim, duracao, erros])
  const textoExtra = extra && `Esta data está considerando hora extra de ${hm(extra.horas_extras)} ${
    extra.tipo_dia === 'FERIADO' ? `no feriado de ${dataBR(f.dia)} (${diaSemana(f.dia)})` : `${extra.tipo_dia === 'DIA ÚTIL' ? 'na' : 'no'} ${diaSemana(f.dia)}, ${dataBR(f.dia)}`
  }${extra.tipo_dia === 'DIA ÚTIL' ? ` (fora da jornada de ${extra.inicio_jornada} às ${extra.fim_jornada})` : ''}.`
  const dataDiferente = !!f.dia && f.dia !== hoje

  async function avancar() {
    if (passo === 2 && dataDiferente) {
      const ok = await confirmar('Data diferente de hoje',
        <span>A data informada, <strong>{dataBR(f.dia)} ({diaSemana(f.dia)})</strong>, não confere com a data de hoje, <strong>{dataBR(hoje)}</strong>. Deseja continuar com esta data?</span>,
        'Sim, continuar')
      if (!ok) return
    }
    setPasso(passo + 1)
  }
  const passoOk = (p: number) => (p === 1 ? !erros.tpe : p === 2 ? !erros.dia && !erros.inicio && !erros.fim : p === 3 ? !erros.descricao : true)

  async function salvar() {
    setErro(null); setSalvando(true)
    try {
      const { data, error } = await supabase.from('apontamentos').insert({
        tpe_id: f.tpe_id, recurso_id: perfil?.recurso_id, dia: f.dia, hora_inicio: f.hora_inicio, hora_fim: f.hora_fim,
        descricao: f.descricao.trim(), client_request_id: f.req,
      }).select('seq').single()
      if (error) {
        // reenvio do mesmo formulário (ex.: conexão caiu depois de gravar): já está salvo
        if (/client_request_id/.test(error.message)) { setSalvo({ codigo: tarefa?.codigo ?? '', seq: 0 }); localStorage.removeItem(RASCUNHO); return }
        throw error
      }
      setSalvo({ codigo: tarefa?.codigo ?? '', seq: (data as any).seq })
      avisar('ok', 'Apontamento registrado. As informações foram salvas e estão disponíveis para acompanhamento.')
      localStorage.removeItem(RASCUNHO)
    } catch (e) {
      setErro(`Não foi possível salvar: ${mensagemErro(e)} O formulário foi mantido para você tentar novamente.`)
    } finally { setSalvando(false) }
  }

  if (!perfil?.recurso_id) return <Aviso tipo="atencao">Seu acesso ainda não está vinculado a um projetista. Peça ao Master para concluir o cadastro.</Aviso>
  if (salvo) return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <Aviso tipo="ok"><strong>Apontamento registrado.</strong> As informações foram salvas{salvo.seq ? ` (nº ${salvo.seq})` : ''} e já aparecem para o Master.</Aviso>
      <div className="row">
        <button className="btn" onClick={() => { setSalvo(null); setF({ ...novoForm(f.tpe_id), dia: f.dia, hora_inicio: f.hora_fim }); setPasso(2) }}>Registrar outra na mesma TPE</button>
        <button className="btn sec" onClick={() => { setSalvo(null); setF(novoForm()); setPasso(1) }}>Registrar em outra TPE</button>
        <Link className="btn fantasma" to="/meus-apontamentos">Ver meus apontamentos</Link>
      </div>
    </div>
  )

  const PASSOS = ['TPE', 'Quando', 'O que foi feito', 'Revisar']
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Cabecalho titulo="Registrar atividade" texto="Quatro passos curtos. Seu nome é preenchido automaticamente pelo login." />
      <ol className="passos" aria-label="Etapas">
        {PASSOS.map((p, i) => <li key={p} className={passo === i + 1 ? 'atual' : passo > i + 1 ? 'feito' : ''}><span className="n">{passo > i + 1 ? '✓' : i + 1}</span>{p}</li>)}
      </ol>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="card stack">
        {passo === 1 && (
          <>
            <div><h2>Selecione o TPE</h2><p className="muted small" style={{ margin: '4px 0 0' }}>Escolha a tarefa na qual você trabalhou. Só aparecem as atribuídas a você.</p></div>
            <input type="search" placeholder="Buscar por número, cliente ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar TPE" />
            {!tarefas ? <Carregando /> : tarefas.length === 0 ? <Aviso tipo="info">Você não tem tarefas em aberto atribuídas. Fale com o Master.</Aviso> : (
              <div className="stack" style={{ gap: 8, maxHeight: 420, overflow: 'auto' }} role="listbox" aria-label="TPEs">
                {tarefas.filter((t) => !busca || `${t.codigo} ${t.cliente} ${t.descricao} ${t.os}`.toLowerCase().includes(busca.toLowerCase())).map((t) => (
                  <button key={t.tpe_id} type="button" className="opcao-tpe" aria-pressed={f.tpe_id === t.tpe_id} onClick={() => setF({ ...f, tpe_id: t.tpe_id })}>
                    <strong>{t.codigo}</strong> · {t.principal} › {t.grupo}
                    <div className="small">{t.descricao}</div>
                    <div className="small muted">O.S. {t.os} · {t.cliente} · prazo {dataBR(t.prazo)}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {passo === 2 && (
          <>
            <div><h2>Quando a atividade foi realizada?</h2><p className="muted small" style={{ margin: '4px 0 0' }}>Informe a data e o horário (horário de Brasília). O almoço de 12h às 13h é descontado automaticamente quando o período o atravessa.</p></div>
            <Campo rotulo="Data" erro={erros.dia}><input type="date" value={f.dia} max={somaDias(hoje, 1)} min={somaDias(hoje, -JANELA)} onChange={(e) => setF({ ...f, dia: e.target.value })} aria-invalid={!!erros.dia} /></Campo>
            <div className="grid2">
              <Campo rotulo="Início" erro={f.hora_inicio ? erros.inicio : null}><input type="time" step={300} value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} /></Campo>
              <Campo rotulo="Término" erro={f.hora_fim ? erros.fim : null}><input type="time" step={300} value={f.hora_fim} onChange={(e) => setF({ ...f, hora_fim: e.target.value })} aria-invalid={!!(f.hora_fim && erros.fim)} /></Campo>
            </div>
            <div className="row small">
              <span className="muted">Atalhos:</span>
              {[['07:00', '12:00', 'Manhã'], ['13:00', '17:00', 'Tarde'], ['07:00', '17:00', 'Dia inteiro']].map(([a, b, r]) => (
                <button key={r} type="button" className="btn sec pequeno" onClick={() => setF({ ...f, hora_inicio: a, hora_fim: b })}>{r} ({a}–{b})</button>
              ))}
            </div>
            {duracao != null && <div className="muted small">Duração líquida: <strong>{hm(duracao)}</strong> (horas normais e extras são calculadas pelo sistema conforme sua jornada).</div>}
            {dataDiferente && !erros.dia && <Aviso tipo="atencao">A data informada ({dataBR(f.dia)}, {diaSemana(f.dia)}) não é a data de hoje ({dataBR(hoje)}).</Aviso>}
            {textoExtra && <Aviso tipo="atencao"><strong>Hora extra:</strong> {textoExtra}</Aviso>}
            {sobrepostos.length > 0 && <Aviso tipo="atencao">Este horário se sobrepõe a {sobrepostos.length} lançamento(s) seu(s) neste dia ({sobrepostos.map((s) => `${s.tpe_codigo} ${s.hora_inicio.slice(0, 5)}–${s.hora_fim.slice(0, 5)}`).join(', ')}). Confira antes de continuar.</Aviso>}
          </>
        )}
        {passo === 3 && (
          <>
            <div><h2>Descreva brevemente o que foi feito</h2><p className="muted small" style={{ margin: '4px 0 0' }}>Exemplo: “Revisão do desenho técnico e ajuste das cotas”.</p></div>
            <Campo rotulo="Descrição" erro={f.descricao ? erros.descricao : null}>
              <textarea rows={4} maxLength={500} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="O que você fez neste período?" />
            </Campo>
            <div className="muted small" style={{ textAlign: 'right' }}>{f.descricao.length}/500</div>
          </>
        )}
        {passo === 4 && tarefa && (
          <>
            <h2>Revise antes de salvar</h2>
            <table className="tabela"><tbody>
              <tr><td className="muted">TPE</td><td><strong>{tarefa.codigo}</strong> · {tarefa.principal} › {tarefa.grupo}<div className="small muted">O.S. {tarefa.os} · {tarefa.cliente}</div></td></tr>
              <tr><td className="muted">Projetista</td><td>{perfil.recurso_nome} <span className="small muted">(do seu login)</span></td></tr>
              <tr><td className="muted">Quando</td><td>{dataBR(f.dia)}, das {f.hora_inicio} às {f.hora_fim} {duracao != null && <span className="muted">({hm(duracao)})</span>}</td></tr>
              <tr><td className="muted">Descrição</td><td>{f.descricao}</td></tr>
            </tbody></table>
            {dataDiferente && <Aviso tipo="atencao">Atenção: a data deste lançamento ({dataBR(f.dia)}) é diferente de hoje ({dataBR(hoje)}).</Aviso>}
            {textoExtra && <Aviso tipo="atencao"><strong>Hora extra:</strong> {textoExtra}</Aviso>}
            <p className="muted small" style={{ margin: 0 }}>Você poderá corrigir este lançamento por até 7 dias. Registrar horas não conclui a tarefa.</p>
          </>
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn sec" disabled={passo === 1 || salvando} onClick={() => setPasso(passo - 1)}>Voltar</button>
          {passo < 4
            ? <button className="btn" disabled={!passoOk(passo)} onClick={avancar}>Continuar</button>
            : <button className="btn" disabled={salvando || Object.keys(erros).length > 0} onClick={salvar}><Icone n="check" /> {salvando ? 'Salvando…' : 'Salvar apontamento'}</button>}
        </div>
      </div>
      {dialogoConfirmar}
    </div>
  )
}
