import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { paraParametros, situacaoPrazo } from '../../lib/dados'
import { horasPorDiaUtil } from '../../lib/calculo'
import { linhasDe } from '../../lib/conjuntos'
import { dataBR, diasEntre, h1, hojeISO, osBR, pct, somaDias } from '../../lib/formato'
import { corRecurso, diasUteisEntre, fimPorDiasUteis, indisponiveis, prazoMedioGrupo, proximoDiaUtil, proximoNumeroTpe } from '../../lib/agenda'
import { Aviso, Cabecalho, Campo, Carregando, Dialogo, Icone, Selo, SeloPrazo, Vazio, useAvisar, useConfirmar } from '../../components/ui'

const STATUS = ['NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA']
const FILTROS = [
  ['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['NÃO INICIADA', 'Não iniciadas'], ['EM ANDAMENTO', 'Em andamento'],
  ['PAUSADA', 'Pausadas'], ['FINALIZADA', 'Finalizadas'], ['todas', 'Todas'],
] as const
type Filtro = (typeof FILTROS)[number][0]
type Campo = 'tpe' | 'os' | 'grupo' | 'resp' | 'status' | 'inicio' | 'prazo' | 'horas'
const VALOR: Record<Campo, (t: any) => any> = {
  tpe: (t) => t.numero * 1000 + t.revisao, os: (t) => Number(t.os), grupo: (t) => `${t.principal} › ${t.grupo}`.toLowerCase(),
  resp: (t) => (t.responsavel ?? '').toLowerCase(), status: (t) => STATUS.indexOf(t.status), inicio: (t) => t.data_inicio ? String(t.data_inicio).slice(0, 10) : null,
  prazo: (t) => t.prazo ? String(t.prazo).slice(0, 10) : null, horas: (t) => Number(t.horas_totais ?? 0),
}
const iniciada = (t: any) => t && (t.status !== 'NÃO INICIADA' || Number(t.qtd_apontamentos ?? 0) > 0)

export default function Tpes() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [qs, setQs] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<Filtro>('abertas')
  const [fResp, setFResp] = useState('')
  const [fPrincipal, setFPrincipal] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [ord, setOrd] = useState<{ campo: Campo; dir: 1 | -1 }>({ campo: 'tpe', dir: -1 })
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [ed, setEd] = useState<any | null>(null)
  const [salvando, setSalvando] = useState(false)
  const filtro = qs.get('f')
  // a coluna predecessora_id só existe depois da migração 0007
  const temPred = !!base?.tpes.length && 'predecessora_id' in base.tpes[0]

  useEffect(() => { supabase.from('catalogo_grupos').select('*').order('ordem').then(({ data }) => setCatalogo(data ?? [])) }, [])
  useEffect(() => {
    if (!base) return
    if (qs.get('novo')) { novo(); qs.delete('novo'); setQs(qs) }
    const idEd = qs.get('editar')
    if (idEd) { const t = linhasDe('tpes', base).find((x: any) => String(x.id) === idEd); if (t) editar(t); qs.delete('editar'); setQs(qs) }
  }, [base]) // eslint-disable-line

  const { linhas, contagem } = useMemo(() => {
    const vazio = Object.fromEntries(FILTROS.map(([k]) => [k, 0])) as Record<Filtro, number>
    if (!base) return { linhas: [], contagem: vazio }
    let ls: any[] = linhasDe('tpes', base).filter((t: any) => t.arquivada !== 'SIM')
    if (fPrincipal) ls = ls.filter((t) => t.principal === fPrincipal)
    if (fGrupo) ls = ls.filter((t) => t.grupo === fGrupo)
    if (fResp === '-') ls = ls.filter((t) => !t.responsavel_id); else if (fResp) ls = ls.filter((t) => String(t.responsavel_id) === fResp)
    if (filtro === 'semresp') ls = ls.filter((t) => !t.responsavel_id && t.status !== 'FINALIZADA')
    if (filtro === 'atrasadas') ls = ls.filter((t) => t.situacao_prazo === 'ATRASADA')
    if (filtro === 'breve') ls = ls.filter((t) => t.situacao_prazo === 'VENCE EM BREVE')
    if (filtro === 'semprazo') ls = ls.filter((t) => t.responsavel_id && !t.prazo && t.status !== 'FINALIZADA')
    const b = busca.toLowerCase()
    if (b) ls = ls.filter((t) => `${t.codigo} ${t.cliente} ${t.descricao} ${t.grupo} ${t.os} ${osBR(t.os)} ${t.responsavel}`.toLowerCase().includes(b))
    const passa = (t: any, f: Filtro) => f === 'todas' || (f === 'abertas' ? t.status !== 'FINALIZADA' : f === 'atrasadas' ? t.situacao_prazo === 'ATRASADA' : t.status === f)
    const contagem = { ...vazio }
    for (const [k] of FILTROS) contagem[k] = ls.filter((t) => passa(t, k)).length
    const vazioFim = (v: any) => (v == null || v === '' ? null : v)
    const cmp = (a: any, z: any) => {
      const va = vazioFim(VALOR[ord.campo](a)), vz = vazioFim(VALOR[ord.campo](z))
      if (va == null || vz == null) return va == null && vz == null ? 0 : va == null ? 1 : -1 // vazios sempre no fim
      return (va < vz ? -1 : va > vz ? 1 : 0) * ord.dir || (a.numero - z.numero) * ord.dir || a.revisao - z.revisao
    }
    const linhas = ls.filter((t) => passa(t, fStatus)).sort(cmp)
    return { linhas, contagem }
  }, [base, busca, fStatus, fResp, fPrincipal, fGrupo, ord, filtro])
  const opcoesPrincipal = useMemo(() => [...new Set((base?.tpes ?? []).map((t: any) => t.principal as string))].filter(Boolean).sort(), [base])
  const opcoesGrupo = useMemo(() => [...new Set((base?.tpes ?? []).filter((t: any) => !fPrincipal || t.principal === fPrincipal).map((t: any) => t.grupo as string))].filter(Boolean).sort(), [base, fPrincipal])
  /** cabeçalho que ordena ao clicar (1º clique: menor → maior; 2º: maior → menor) */
  const Ord2 = ({ campo, children }: { campo: Campo; children: ReactNode }) => {
    const ativo = ord.campo === campo
    return (
      <button type="button" className={`th-ordem ${ativo ? 'ativo' : ''}`} title="Ordenar (clique de novo para inverter)" onClick={() => setOrd({ campo, dir: ativo ? (ord.dir === 1 ? -1 : 1) : 1 })}>
        {children}<span className="seta-ordem" aria-hidden="true">{ativo ? (ord.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>)
  }
  const Ord = ({ campo, children, num }: { campo: Campo; children: ReactNode; num?: boolean }) => (
    <th className={num ? 'num' : ''} aria-sort={ord.campo === campo ? (ord.dir === 1 ? 'ascending' : 'descending') : 'none'}><Ord2 campo={campo}>{children}</Ord2></th>)

  /** Próximo código: reaproveita o menor número livre (ex.: apagou a TPE-002 → a próxima é a 002). */
  function proximoCodigo() {
    return `TPE-${String(proximoNumeroTpe((base?.tpes ?? []).map((t: any) => Number(t.numero)))).padStart(3, '0')}.0`
  }
  // calendário do responsável: sem fins de semana, feriados e as férias dele
  const cal = (resp?: any) => (base ? indisponiveis(base.feriados, base.ausencias, resp || null) : undefined)
  const diasDe = (a?: string | null, b?: string | null, resp?: any) => (a && b && b >= a ? String(diasUteisEntre(String(a).slice(0, 10), String(b).slice(0, 10), cal(resp))) : '')
  function novo() {
    setEd({ novo: true, codigo: proximoCodigo(), os: '', principal: '', grupo: '', descricao: '', status: 'NÃO INICIADA', data_inicio: proximoDiaUtil(hojeISO(), base?.feriados),
      data_fim: '', prazo: '', dias: '', instrucoes: '', responsavel_id: '', predecessora_id: '' })
  }
  function editar(t: any) {
    setEd({ ...t, data_inicio: t.data_inicio ?? '', data_fim: t.data_fim ?? '', prazo: t.prazo ?? '', dias: diasDe(t.data_inicio, t.prazo, t.responsavel_id), instrucoes: t.instrucoes ?? '',
      responsavel_id: t.responsavel_id ?? '', resp_original: t.responsavel_id ?? '', predecessora_id: t.predecessora_id ?? '', status_original: t.status })
  }
  function reabrir(t: any) {
    const revs = (base?.tpes ?? []).filter((x: any) => x.numero === t.numero).map((x: any) => x.revisao)
    setEd({ novo: true, reabertura: t.codigo, codigo: `TPE-${String(t.numero).padStart(3, '0')}.${Math.max(...revs) + 1}`, os: t.os, principal: t.principal, grupo: t.grupo,
      descricao: '', status: 'EM ANDAMENTO', data_inicio: hojeISO(), data_fim: '', prazo: '', dias: '', instrucoes: '', responsavel_id: t.responsavel_id ?? '', predecessora_id: '' })
  }
  // duração ↔ prazo (dias úteis, sem sábados, domingos e feriados)
  const comDias = (e: any, dias: string) => ({ ...e, dias, prazo: e.data_inicio && Number(dias) > 0 ? fimPorDiasUteis(e.data_inicio, Number(dias), cal(e.responsavel_id)) : e.prazo })
  const comInicio = (e: any, data_inicio: string) => (e.dias && data_inicio ? comDias({ ...e, data_inicio }, e.dias) : { ...e, data_inicio, dias: diasDe(data_inicio, e.prazo, e.responsavel_id) })
  // trocar o responsável recalcula o prazo pelas férias da nova pessoa
  const comResponsavel = (e: any, responsavel_id: string) => (e.dias && e.data_inicio ? comDias({ ...e, responsavel_id }, e.dias) : { ...e, responsavel_id })
  const comPrazo = (e: any, prazo: string) => ({ ...e, prazo, dias: diasDe(e.data_inicio, prazo, e.responsavel_id) })

  // disponibilidade do responsável: dia útil seguinte ao maior prazo das TPEs dele em aberto (atrasadas contam até hoje)
  const disp = useMemo(() => {
    if (!base || !ed?.responsavel_id) return null
    const c = cal(ed.responsavel_id)
    const outras = base.tpes.filter((t: any) => String(t.responsavel_id) === String(ed.responsavel_id) && t.id !== ed.id && !t.arquivada && t.status !== 'FINALIZADA')
    const comPrazo = outras.filter((t: any) => t.prazo)
    const hoje = hojeISO()
    let ultima: any = null, ate: string | null = null
    for (const t of comPrazo) { const p = String(t.prazo).slice(0, 10); const ef = p < hoje ? hoje : p; if (!ate || ef > ate) { ate = ef; ultima = t } }
    const livre = proximoDiaUtil(ate ? somaDias(ate, 1) : hoje, c)
    return { livre, ultima, atrasada: !!ultima && String(ultima.prazo).slice(0, 10) < hoje, qtd: outras.length, semPrazo: outras.length - comPrazo.length }
  }, [base, ed?.responsavel_id, ed?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const corResp = useMemo(() => new Map((base?.recursos ?? []).map((r: any, i: number) => [String(r.id), corRecurso(r, i)])), [base])
  const osSel: any = ed && base ? base.os.find((o: any) => String(o.os) === String(ed.os)) : null
  const prazoOS = osSel?.prazo_final ? String(osSel.prazo_final).slice(0, 10) : null
  const horasDia = useMemo(() => (base ? horasPorDiaUtil(paraParametros(base.parametros)) : 8.8), [base])
  const sugestao = ed && base && ed.principal && ed.grupo ? prazoMedioGrupo(base.tpes, ed.principal, ed.grupo, horasDia) : null
  const porId = useMemo(() => new Map((base?.tpes ?? []).map((t: any) => [t.id, t])), [base])
  const pred: any = ed?.predecessora_id ? porId.get(Number(ed.predecessora_id)) : null
  // opções de predecessora: qualquer TPE existente, exceto ela mesma e as que já dependem dela (evita ciclo)
  const opcoesPred = useMemo(() => {
    if (!base || !ed) return []
    const bloqueadas = new Set<number>()
    if (ed.id) {
      const fila = [ed.id]
      while (fila.length) { const x = fila.pop(); bloqueadas.add(x); for (const t of base.tpes) if (t.predecessora_id === x && !bloqueadas.has(t.id)) fila.push(t.id) }
    }
    return base.tpes.filter((t: any) => !t.arquivada && !bloqueadas.has(t.id)).sort((a: any, z: any) => z.numero - a.numero || z.revisao - a.revisao)
  }, [base, ed?.id, !!ed]) // eslint-disable-line react-hooks/exhaustive-deps -- recalcula ao abrir o formulário (TPE nova não tem id)

  const erros = ed ? {
    os: !ed.os ? 'Escolha a O.S.' : null,
    grupo: !ed.principal || !ed.grupo ? 'Escolha principal e grupo.' : null,
    descricao: (ed.descricao ?? '').trim().length < 5 ? 'Descreva a tarefa (mín. 5 caracteres).' : null,
    data_fim: !ed.novo && ed.status === 'FINALIZADA' && !ed.data_fim ? 'Informe a data de finalização.' : ed.data_fim && ed.data_inicio && ed.data_fim < ed.data_inicio ? 'Anterior ao início.' : null,
    prazo: ed.prazo && ed.data_inicio && ed.prazo < ed.data_inicio ? 'Prazo anterior ao início.' : null,
    dias: ed.dias !== '' && !(Number(ed.dias) >= 1) ? 'Informe 1 dia ou mais.' : null,
    status: pred && ed.status !== 'NÃO INICIADA' && ed.status !== ed.status_original && !iniciada(pred) ? `A predecessora ${pred.codigo} ainda não foi iniciada.` : null,
  } : {}
  const valido = ed && !Object.values(erros).some(Boolean)

  async function salvar() {
    setSalvando(true)
    try {
      if (ed.predecessora_id && !temPred) throw new Error('Para usar predecessora, aplique a migração 20261122000007 no Supabase.')
      const reg = { os: Number(ed.os), principal: ed.principal, grupo: ed.grupo, descricao: ed.descricao.trim(), status: ed.status,
        data_inicio: ed.data_inicio || null, data_fim: ed.novo ? null : ed.data_fim || null, prazo: ed.prazo || null, instrucoes: ed.instrucoes?.trim() || null,
        ...(temPred ? { predecessora_id: ed.predecessora_id ? Number(ed.predecessora_id) : null } : {}) }
      let id = ed.id
      if (ed.novo) {
        const { data, error } = await supabase.from('tpes').insert({ ...reg, codigo: ed.codigo, grupo_original: ed.grupo }).select('id').single()
        if (error) throw error; id = (data as any).id
      } else {
        const { error } = await supabase.from('tpes').update(reg).eq('id', id); if (error) throw error
      }
      if (String(ed.responsavel_id) !== String(ed.resp_original ?? '') || (ed.novo && ed.responsavel_id)) {
        // entra no fim da fila do projetista; a ordem é definida em Planejamento › Sequência por projetista
        const { error } = await supabase.rpc('atribuir_tpe', { p_tpe: id, p_recurso: ed.responsavel_id ? Number(ed.responsavel_id) : null, p_sequencia: null, p_obs: ed.reabertura ? `Reabertura de ${ed.reabertura}` : null })
        if (error) throw error
      }
      avisar('ok', `${ed.codigo} salva.`); setEd(null); recarregar()
    } catch (e) { avisar('erro', mensagemErro(e)) } finally { setSalvando(false) }
  }
  const [fin, setFin] = useState<{ t: any; data: string } | null>(null)
  const erroFin = fin && (!fin.data ? 'Informe a data.' : fin.data > hojeISO() ? 'A data não pode ser futura.'
    : fin.t.data_inicio && fin.data < String(fin.t.data_inicio).slice(0, 10) ? `Anterior ao início (${dataBR(fin.t.data_inicio)}).` : null)
  async function finalizar() {
    if (!fin || erroFin) return
    setSalvando(true)
    const { error } = await supabase.from('tpes').update({ status: 'FINALIZADA', data_fim: fin.data }).eq('id', fin.t.id)
    setSalvando(false)
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `${fin.t.codigo} finalizada em ${dataBR(fin.data)}.`); setFin(null); recarregar()
  }
  async function arquivar(t: any) {
    if (!(await confirmar('Arquivar TPE', <>Arquivar <strong>{t.codigo}</strong>? Ela sai das listas do dia a dia, mas continua na base, nos indicadores e nas exportações (marque “incluir arquivados” na Central de Dados).</>, 'Arquivar'))) return
    const { error } = await supabase.from('tpes').update({ arquivada: true }).eq('id', t.id)
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'TPE arquivada.'); recarregar()
  }
  async function apagar(t: any) {
    // conferências rápidas antes de pedir confirmação (o banco confere de novo)
    const revisoes = (base?.tpes ?? []).filter((x: any) => x.numero === t.numero && x.id !== t.id)
    if (t.revisao === 0 && revisoes.length) return avisar('erro', `A TPE ${t.codigo} não pode ser apagada porque tem revisões vinculadas (${revisoes.map((x: any) => x.codigo).join(', ')}). Apague as revisões primeiro.`)
    if (Number(t.qtd_apontamentos) > 0) return avisar('erro', `A TPE ${t.codigo} não pode ser apagada porque tem ${t.qtd_apontamentos} apontamento(s). Use Arquivar.`)
    const dependentes = (base?.tpes ?? []).filter((x: any) => x.predecessora_id === t.id)
    if (dependentes.length) return avisar('erro', `A TPE ${t.codigo} não pode ser apagada porque é predecessora de ${dependentes.map((x: any) => x.codigo).join(', ')}.`)
    if (!(await confirmar('Apagar TPE', <>Apagar definitivamente <strong>{t.codigo}</strong> ({t.descricao})? Use para cadastros feitos por engano ou em duplicidade. O número {String(t.numero).padStart(3, '0')} volta a ficar livre para a próxima TPE. Esta ação não pode ser desfeita.</>, 'Apagar', true))) return
    const { data, error } = await supabase.rpc('excluir_tpe', { p_tpe: t.id })
    if (error) return avisar('erro', /excluir_tpe/.test(error.message) && /function|schema cache/i.test(error.message) ? 'Para apagar TPEs, aplique a migração 20261122000007 no Supabase.' : mensagemErro(error))
    avisar('ok', `${data ?? t.codigo} apagada.`); recarregar()
  }

  if (!base) return <Carregando />
  const principais = [...new Set(catalogo.map((c) => c.principal))]
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="TPEs e tarefas" texto="Crie tarefas, defina responsável, predecessora, início e prazo. A ordem de execução de cada projetista é definida em Sequência por projetista."
        acoes={<button className="btn" onClick={novo}><Icone n="mais" /> Nova TPE</button>} />
      {filtro && <Aviso tipo="info">Filtro aplicado pelo painel: <strong>{{ semresp: 'sem responsável', atrasadas: 'prazo vencido', breve: 'vencem em até 3 dias', semprazo: 'sem prazo' }[filtro]}</strong>. <a href="#" onClick={(e) => { e.preventDefault(); qs.delete('f'); setQs(qs) }}>Remover</a></Aviso>}
      <div className="row nao-imprimir">
        <input type="search" placeholder="Buscar TPE, cliente, descrição, responsável…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 340 }} aria-label="Buscar" />
        <select value={fPrincipal} onChange={(e) => { setFPrincipal(e.target.value); setFGrupo('') }} aria-label="Principal" style={{ maxWidth: 200 }}><option value="">Todos os principais</option>{opcoesPrincipal.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} aria-label="Grupo" style={{ maxWidth: 240 }}><option value="">Todos os grupos</option>{opcoesGrupo.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsável" style={{ maxWidth: 200 }}><option value="">Todos os responsáveis</option><option value="-">Sem responsável</option>{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
      </div>
      {(fPrincipal || fGrupo || fResp || busca) && <div className="small muted nao-imprimir">Filtros: {[fPrincipal, fGrupo, fResp && (fResp === '-' ? 'sem responsável' : base.recursos.find((r: any) => String(r.id) === fResp)?.nome), busca && `“${busca}”`].filter(Boolean).join(' · ')} · <a href="#" onClick={(e) => { e.preventDefault(); setFPrincipal(''); setFGrupo(''); setFResp(''); setBusca('') }}>Limpar</a></div>}
      <div className="segmentos rolavel nao-imprimir" role="group" aria-label="Filtrar por status">
        {FILTROS.map(([k, r]) => (
          <button key={k} type="button" aria-pressed={fStatus === k} className={k === 'atrasadas' && contagem.atrasadas ? 'tem-atraso' : ''} onClick={() => setFStatus(k)}>
            {r} <span className="contador">{contagem[k]}</span></button>))}
      </div>
      <div className="rolagem">
        {linhas.length === 0 ? <Vazio>Nenhuma TPE com estes filtros.</Vazio> : (
          <table className="tabela"><thead><tr><Ord campo="tpe">TPE</Ord><Ord campo="os">O.S. / cliente</Ord><Ord campo="grupo">Principal › grupo</Ord><th>Descrição</th><Ord campo="resp">Responsável</Ord><Ord campo="status">Status</Ord><th><span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><Ord2 campo="inicio">Início</Ord2> → <Ord2 campo="prazo">prazo</Ord2></span></th><Ord campo="horas" num>Horas</Ord><th className="num" title="Horas consumidas ÷ estimativa (média do grupo). Não é % de conclusão.">Consumo</th><th></th></tr></thead>
            <tbody>{linhas.map((t: any) => {
              const p: any = t.predecessora_id ? porId.get(t.predecessora_id) : null
              return (
                <tr key={t.id} className={t.situacao_prazo === 'ATRASADA' ? 'linha-atraso' : ''}>
                  <td className="sem-quebra"><strong>{t.codigo}</strong>{p && <div className="small muted" title={`Só pode ser iniciada depois de ${p.codigo}`}>↳ após {p.codigo}</div>}</td>
                  <td>{osBR(t.os)}<div className="small muted">{t.cliente}</div></td>
                  <td className="small">{t.principal} › {t.grupo}{t.grupo_original && t.grupo_original !== t.grupo && <div className="muted" title="Texto da planilha original">orig.: {t.grupo_original}</div>}</td>
                  <td className="small" style={{ maxWidth: 320 }}>{t.descricao}</td>
                  <td>{t.responsavel ? <span className="ind-proj" style={{ fontWeight: 500 }}><span className="g2-ponto" style={{ background: corResp.get(String(t.responsavel_id)) }} />{t.responsavel}</span> : <span className="badge ambar">sem responsável</span>}{t.sequencia && t.status !== 'FINALIZADA' && <div className="small muted">na fila</div>}</td>
                  <td><Selo v={t.status} /></td>
                  <td className="sem-quebra small">{dataBR(t.data_inicio)} → {dataBR(t.prazo)} {situacaoPrazo(t.prazo, t.status) && <div><SeloPrazo prazo={t.prazo} status={t.status} /></div>}</td>
                  <td className="num">{h1(t.horas_totais)}{Math.abs((t.horas_tarefa ?? t.horas_totais) - t.horas_totais) > 1e-9 && <div className="small muted" title="Horas desta TPE somadas às das revisões (.1, .2…), usadas nas médias">c/ revisões {h1(t.horas_tarefa)}</div>}</td>
                  <td className="num">{t.consumo == null ? '—' : pct(t.consumo)}</td>
                  <td className="nao-imprimir"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <button className="btn sec pequeno" onClick={() => editar(t)}>Editar</button>
                    {t.status !== 'FINALIZADA' && <button className="btn pequeno btn-finalizar" onClick={() => setFin({ t, data: hojeISO() })} title="Marcar como finalizada sem abrir a edição"><Icone n="check" /> Finalizar</button>}
                    {t.status === 'FINALIZADA' && <button className="btn sec pequeno" onClick={() => reabrir(t)} title="Gera a próxima revisão (.1, .2…)">Reabrir</button>}
                    <button className="btn fantasma pequeno" onClick={() => arquivar(t)} title="Arquivar (não exclui)" aria-label={`Arquivar ${t.codigo}`}><Icone n="arquivo" /></button>
                    <button className="btn fantasma pequeno btn-apagar" onClick={() => apagar(t)} title="Apagar (cadastro errado ou duplicado)" aria-label={`Apagar ${t.codigo}`}><Icone n="lixo" /></button>
                  </div></td>
                </tr>)
            })}</tbody></table>)}
      </div>
      <Dialogo titulo={`Finalizar ${fin?.t.codigo ?? ''}`} aberto={!!fin} aoFechar={() => setFin(null)}>
        {fin && (
          <div className="stack">
            <p style={{ margin: 0 }}><strong>{fin.t.codigo}</strong> · {fin.t.principal} › {fin.t.grupo}<br /><span className="muted small">{fin.t.descricao}</span></p>
            <Campo rotulo="Data de finalização" erro={erroFin}><input type="date" value={fin.data} max={hojeISO()} min={fin.t.data_inicio ? String(fin.t.data_inicio).slice(0, 10) : undefined} onChange={(e) => setFin({ ...fin, data: e.target.value })} /></Campo>
            <p className="muted small" style={{ margin: 0 }}>A TPE sai da lista do projetista e da sequência. Se precisar de ajuste depois, use <strong>Reabrir</strong> (gera a revisão .{(fin.t.revisao ?? 0) + 1}).</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sec" onClick={() => setFin(null)}>Cancelar</button>
              <button className="btn btn-finalizar" disabled={!!erroFin || salvando} onClick={finalizar}><Icone n="check" /> {salvando ? 'Finalizando…' : 'Finalizar TPE'}</button>
            </div>
          </div>
        )}
      </Dialogo>
      <Dialogo titulo={ed?.novo ? (ed?.reabertura ? `Reabrir ${ed.reabertura} → ${ed.codigo}` : `Nova TPE · ${ed?.codigo}`) : `Editar ${ed?.codigo}`} aberto={!!ed} aoFechar={() => setEd(null)} largo>
        {ed && (
          <div className="stack">
            {ed.reabertura && <Aviso tipo="info">A revisão herda O.S., principal e grupo de {ed.reabertura}. Descreva o motivo/escopo da revisão.</Aviso>}
            <div className="grid2">
              <Campo rotulo="Código" ajuda={ed.novo ? 'Gerado automaticamente (usa o menor número livre); pode ser ajustado.' : 'Não editável.'}><input value={ed.codigo} readOnly={!ed.novo} onChange={(e) => setEd({ ...ed, codigo: e.target.value.toUpperCase() })} /></Campo>
              <Campo rotulo="O.S." erro={erros.os} ajuda="O.S. finalizadas não aparecem: reabra em Clientes e O.S."><select value={ed.os} onChange={(e) => setEd({ ...ed, os: e.target.value })}><option value="">Escolha…</option>
                {base.os.filter((o: any) => (!o.arquivada && o.status !== 'FINALIZADA') || String(o.os) === String(ed.os)).map((o: any) => <option key={o.os} value={o.os}>{osBR(o.os)} · {o.nome}{o.status === 'FINALIZADA' ? ' (finalizada)' : ''}</option>)}</select></Campo>
              <Campo rotulo="Principal"><select value={ed.principal} onChange={(e) => setEd({ ...ed, principal: e.target.value, grupo: '' })}><option value="">Escolha…</option>{principais.map((p) => <option key={p}>{p}</option>)}</select></Campo>
              <Campo rotulo="Grupo" erro={erros.grupo}><select value={ed.grupo} onChange={(e) => setEd({ ...ed, grupo: e.target.value })} disabled={!ed.principal}><option value="">Escolha…</option>
                {catalogo.filter((c) => c.principal === ed.principal && (c.ativo || c.grupo === ed.grupo)).map((c) => <option key={c.id}>{c.grupo}</option>)}</select></Campo>
            </div>
            <Campo rotulo="Descrição" erro={erros.descricao}><textarea rows={2} maxLength={500} value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} placeholder="Ex.: Elaboração do desenho do vaso SLCH1930 -35°C" /></Campo>
            <div className="grid2">
              <Campo rotulo="Responsável" ajuda="Entra no fim da fila do projetista; a ordem se ajusta em Sequência por projetista.">
                <div className="sel-resp" style={{ ['--cor-resp' as any]: ed.responsavel_id ? corResp.get(String(ed.responsavel_id)) : 'transparent' }}>
                  {ed.responsavel_id && <span className="g2-ponto" aria-hidden="true" />}
                  <select value={ed.responsavel_id} onChange={(e) => setEd(comResponsavel(ed, e.target.value))}><option value="">Sem responsável</option>{base.recursos.filter((r: any) => r.ativo).map((r: any) => <option key={r.id} value={r.id} style={{ color: corResp.get(String(r.id)) }}>● {r.nome}</option>)}</select>
                </div></Campo>
              <Campo rotulo="Predecessora" ajuda="Opcional. Esta TPE só pode ser iniciada e apontada depois que a predecessora for iniciada.">
                <select value={ed.predecessora_id} onChange={(e) => setEd({ ...ed, predecessora_id: e.target.value })}>
                  <option value="">Nenhuma</option>
                  {opcoesPred.map((t: any) => <option key={t.id} value={t.id}>{t.codigo} · {t.grupo}{t.responsavel ? ` · ${t.responsavel}` : ''} · {t.status.toLowerCase()}</option>)}
                </select></Campo>
            </div>
            {disp && (() => {
              const nome = base.recursos.find((r: any) => String(r.id) === String(ed.responsavel_id))?.nome ?? ''
              const conflito = ed.data_inicio && ed.data_inicio < disp.livre && disp.ultima
              return (
                <div className={`disp-resp ${conflito ? 'conflito' : ''}`} role="status" style={{ ['--cor-resp' as any]: corResp.get(String(ed.responsavel_id)) }}>
                  <Icone n="calendario" t={16} />
                  <div>
                    {disp.ultima
                      ? <><strong>{nome}</strong> fica livre a partir de <strong>{dataBR(disp.livre)}</strong> — a última tarefa em aberto na fila é <strong>{disp.ultima.codigo}</strong>, {disp.atrasada ? <>com prazo vencido em {dataBR(disp.ultima.prazo)} (considerada até hoje)</> : <>com prazo em {dataBR(disp.ultima.prazo)}</>}.</>
                      : <><strong>{nome}</strong> não tem tarefas em aberto com prazo: disponível a partir de <strong>{dataBR(disp.livre)}</strong>.</>}
                    {disp.semPrazo > 0 && <span className="muted"> Há {disp.semPrazo} TPE(s) sem prazo nessa fila, que não entram nesta conta.</span>}
                    {conflito && <div className="texto-atraso small">O início informado ({dataBR(ed.data_inicio)}) coincide com outras tarefas de {nome.split(' ')[0]}.</div>}
                  </div>
                  {ed.data_inicio !== disp.livre && <button type="button" className="btn sec pequeno" onClick={() => setEd(comInicio(ed, disp.livre))}>Começar em {dataBR(disp.livre)}</button>}
                </div>)
            })()}
            {pred && (
              <div className={`aviso ${iniciada(pred) ? 'ok' : 'atencao'}`} role="status"><Icone n={iniciada(pred) ? 'check' : 'info'} /><div>
                {iniciada(pred) ? <><strong>{pred.codigo}</strong> já foi iniciada: esta TPE está liberada.</> : <><strong>{pred.codigo}</strong> ainda não foi iniciada: o projetista verá esta TPE como “aguardando” e não conseguirá apontar até ela começar.</>}
                {pred.responsavel && String(pred.responsavel_id) !== String(ed.responsavel_id) && ed.responsavel_id && <> A predecessora é de <strong>{pred.responsavel}</strong>; no cronograma aparece a passagem entre os dois.</>}
                {pred.data_inicio && ed.data_inicio && ed.data_inicio < String(pred.data_inicio).slice(0, 10) && <> O início informado ({dataBR(ed.data_inicio)}) é antes do início da predecessora ({dataBR(pred.data_inicio)}). <button type="button" className="btn sec pequeno" onClick={() => setEd(comInicio(ed, String(pred.data_inicio).slice(0, 10)))}>Começar em {dataBR(pred.data_inicio)}</button></>}
              </div></div>)}
            <div className="grid4">
              <Campo rotulo="Status" ajuda="Só o Supervisor altera" erro={erros.status}><select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}>{STATUS.filter((s) => !ed.novo || s !== 'FINALIZADA').map((s) => <option key={s}>{s}</option>)}</select></Campo>
              <Campo rotulo="Data de início"><input type="date" value={ed.data_inicio} onChange={(e) => setEd(comInicio(ed, e.target.value))} /></Campo>
              <Campo rotulo="Duração (dias úteis)" erro={erros.dias} ajuda="Sem sábados, domingos e feriados"><input type="number" min={1} inputMode="numeric" value={ed.dias} onChange={(e) => setEd(comDias(ed, e.target.value))} placeholder="ex.: 5" /></Campo>
              <Campo rotulo="Prazo" erro={erros.prazo}><input type="date" value={ed.prazo} onChange={(e) => setEd(comPrazo(ed, e.target.value))} /></Campo>
              {!ed.novo && ed.status === 'FINALIZADA' && <Campo rotulo="Data de finalização" erro={erros.data_fim}><input type="date" value={ed.data_fim} onChange={(e) => setEd({ ...ed, data_fim: e.target.value })} /></Campo>}
            </div>
            {prazoOS && (ed.prazo && ed.prazo > prazoOS
              ? <div className="aviso-os" role="alert">Atenção: o prazo desta TPE ({dataBR(ed.prazo)}) passa {diasEntre(prazoOS, ed.prazo)} dia(s) do prazo final da O.S. {osBR(ed.os)} ({dataBR(prazoOS)}).</div>
              : <p className="muted small" style={{ margin: 0 }}>Prazo final da O.S. {osBR(ed.os)}: <strong>{dataBR(prazoOS)}</strong>{ed.prazo ? ` · folga de ${diasEntre(ed.prazo, prazoOS)} dia(s)` : ''}.</p>)}
            {sugestao && (
              <div className="sugestao-prazo small">
                <Icone n="grafico" t={16} />
                <span title="Mesma média do indicador Méd./TPE (revisões somadas à TPE original), dividida pelas horas de um dia útil">
                  Média de <strong>{h1(sugestao.horas)} h</strong> por TPE em <strong>{sugestao.n}</strong> TPE(s) {sugestao.base === 'grupo' ? `de ${ed.principal} › ${ed.grupo}` : `de ${ed.principal} (sem histórico do grupo)`} ÷ {h1(horasDia)} h/dia ≈ <strong>{sugestao.dias} {sugestao.dias === 1 ? 'dia útil' : 'dias úteis'}</strong>
                  {ed.data_inicio && <> → prazo em <strong>{dataBR(fimPorDiasUteis(ed.data_inicio, sugestao.dias, cal(ed.responsavel_id)))}</strong></>}.</span>
                {ed.data_inicio && String(sugestao.dias) !== String(ed.dias) && <button type="button" className="btn sec pequeno" onClick={() => setEd(comDias(ed, String(sugestao.dias)))}>Usar este prazo</button>}
              </div>)}
            {ed.principal && ed.grupo && !sugestao && <p className="muted small" style={{ margin: 0 }}>Ainda não há horas apontadas em TPEs deste grupo para sugerir um prazo médio.</p>}
            <Campo rotulo="Instruções ao projetista" ajuda="Aparecem na tela “Minhas tarefas”."><textarea rows={2} maxLength={1000} value={ed.instrucoes} onChange={(e) => setEd({ ...ed, instrucoes: e.target.value })} /></Campo>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sec" onClick={() => setEd(null)}>Cancelar</button>
              <button className="btn" disabled={!valido || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  )
}
