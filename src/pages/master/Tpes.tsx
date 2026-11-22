import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { situacaoPrazo } from '../../lib/dados'
import { linhasDe } from '../../lib/conjuntos'
import { dataBR, h1, hojeISO, pct } from '../../lib/formato'
import { Aviso, Cabecalho, Campo, Carregando, Dialogo, Icone, Selo, SeloPrazo, Vazio, useAvisar, useConfirmar } from '../../components/ui'

const STATUS = ['NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA']

export default function Tpes() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [qs, setQs] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('abertas')
  const [fResp, setFResp] = useState('')
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [ed, setEd] = useState<any | null>(null)
  const [salvando, setSalvando] = useState(false)
  const filtro = qs.get('f')

  useEffect(() => { supabase.from('catalogo_grupos').select('*').order('ordem').then(({ data }) => setCatalogo(data ?? [])) }, [])
  useEffect(() => { if (qs.get('novo')) { novo(); qs.delete('novo'); setQs(qs) } }, [base]) // eslint-disable-line

  const linhas = useMemo(() => {
    if (!base) return []
    let ls: any[] = linhasDe('tpes', base).filter((t: any) => t.arquivada !== 'SIM')
    if (fStatus === 'abertas') ls = ls.filter((t) => t.status !== 'FINALIZADA')
    else if (fStatus) ls = ls.filter((t) => t.status === fStatus)
    if (fResp === '-') ls = ls.filter((t) => !t.responsavel_id); else if (fResp) ls = ls.filter((t) => String(t.responsavel_id) === fResp)
    if (filtro === 'semresp') ls = ls.filter((t) => !t.responsavel_id && t.status !== 'FINALIZADA')
    if (filtro === 'atrasadas') ls = ls.filter((t) => t.situacao_prazo === 'ATRASADA')
    if (filtro === 'breve') ls = ls.filter((t) => t.situacao_prazo === 'VENCE EM BREVE')
    if (filtro === 'semprazo') ls = ls.filter((t) => t.responsavel_id && !t.prazo && t.status !== 'FINALIZADA')
    const b = busca.toLowerCase()
    if (b) ls = ls.filter((t) => `${t.codigo} ${t.cliente} ${t.descricao} ${t.grupo} ${t.os} ${t.responsavel}`.toLowerCase().includes(b))
    return ls.sort((a, z) => z.numero - a.numero || z.revisao - a.revisao)
  }, [base, busca, fStatus, fResp, filtro])

  function proximoCodigo() {
    const max = Math.max(0, ...(base?.tpes ?? []).map((t: any) => t.numero))
    return `TPE-${String(max + 1).padStart(3, '0')}.0`
  }
  function novo() { setEd({ novo: true, codigo: proximoCodigo(), os: '', principal: '', grupo: '', descricao: '', status: 'NÃO INICIADA', data_inicio: hojeISO(), data_fim: '', prazo: '', instrucoes: '', responsavel_id: '', sequencia: '' }) }
  function editar(t: any) { setEd({ ...t, data_inicio: t.data_inicio ?? '', data_fim: t.data_fim ?? '', prazo: t.prazo ?? '', instrucoes: t.instrucoes ?? '', responsavel_id: t.responsavel_id ?? '', sequencia: t.sequencia ?? '', resp_original: t.responsavel_id ?? '' }) }
  function reabrir(t: any) {
    const revs = (base?.tpes ?? []).filter((x: any) => x.numero === t.numero).map((x: any) => x.revisao)
    setEd({ novo: true, reabertura: t.codigo, codigo: `TPE-${String(t.numero).padStart(3, '0')}.${Math.max(...revs) + 1}`, os: t.os, principal: t.principal, grupo: t.grupo,
      descricao: '', status: 'EM ANDAMENTO', data_inicio: hojeISO(), data_fim: '', prazo: '', instrucoes: '', responsavel_id: t.responsavel_id ?? '', sequencia: '' })
  }

  const erros = ed ? {
    os: !ed.os ? 'Escolha a O.S.' : null,
    grupo: !ed.principal || !ed.grupo ? 'Escolha principal e grupo.' : null,
    descricao: (ed.descricao ?? '').trim().length < 5 ? 'Descreva a tarefa (mín. 5 caracteres).' : null,
    data_fim: ed.status === 'FINALIZADA' && !ed.data_fim ? 'Informe a data de finalização.' : ed.data_fim && ed.data_inicio && ed.data_fim < ed.data_inicio ? 'Anterior ao início.' : null,
    prazo: ed.prazo && ed.data_inicio && ed.prazo < ed.data_inicio ? 'Prazo anterior ao início.' : null,
  } : {}
  const valido = ed && !Object.values(erros).some(Boolean)

  async function salvar() {
    setSalvando(true)
    try {
      const reg = { os: Number(ed.os), principal: ed.principal, grupo: ed.grupo, descricao: ed.descricao.trim(), status: ed.status,
        data_inicio: ed.data_inicio || null, data_fim: ed.data_fim || null, prazo: ed.prazo || null, instrucoes: ed.instrucoes?.trim() || null }
      let id = ed.id
      if (ed.novo) {
        const { data, error } = await supabase.from('tpes').insert({ ...reg, codigo: ed.codigo, grupo_original: ed.grupo }).select('id').single()
        if (error) throw error; id = (data as any).id
      } else {
        const { error } = await supabase.from('tpes').update(reg).eq('id', id); if (error) throw error
      }
      if (String(ed.responsavel_id) !== String(ed.resp_original ?? '') || (ed.novo && ed.responsavel_id)) {
        const { error } = await supabase.rpc('atribuir_tpe', { p_tpe: id, p_recurso: ed.responsavel_id ? Number(ed.responsavel_id) : null, p_sequencia: ed.sequencia ? Number(ed.sequencia) : null, p_obs: ed.reabertura ? `Reabertura de ${ed.reabertura}` : null })
        if (error) throw error
      }
      avisar('ok', `${ed.codigo} salva.`); setEd(null); recarregar()
    } catch (e) { avisar('erro', mensagemErro(e)) } finally { setSalvando(false) }
  }
  async function arquivar(t: any) {
    if (!(await confirmar('Arquivar TPE', <>Arquivar <strong>{t.codigo}</strong>? Ela sai das listas do dia a dia, mas continua na base, nos indicadores e nas exportações (marque “incluir arquivados” na Central de Dados).</>, 'Arquivar'))) return
    const { error } = await supabase.from('tpes').update({ arquivada: true }).eq('id', t.id)
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'TPE arquivada.'); recarregar()
  }

  if (!base) return <Carregando />
  const principais = [...new Set(catalogo.map((c) => c.principal))]
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="TPEs e tarefas" texto="Crie tarefas, defina responsável, sequência, prazo e status. Mudar o responsável preserva o histórico de atribuições e de apontamentos."
        acoes={<button className="btn" onClick={novo}><Icone n="mais" /> Nova TPE</button>} />
      {filtro && <Aviso tipo="info">Filtro aplicado pelo painel: <strong>{{ semresp: 'sem responsável', atrasadas: 'prazo vencido', breve: 'vencem em até 3 dias', semprazo: 'sem prazo' }[filtro]}</strong>. <a href="#" onClick={(e) => { e.preventDefault(); qs.delete('f'); setQs(qs) }}>Remover</a></Aviso>}
      <div className="row nao-imprimir">
        <input type="search" placeholder="Buscar TPE, cliente, descrição, responsável…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 380 }} aria-label="Buscar" />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status" style={{ maxWidth: 200 }}><option value="abertas">Em aberto</option><option value="">Todos os status</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsável" style={{ maxWidth: 200 }}><option value="">Todos os responsáveis</option><option value="-">Sem responsável</option>{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
        <span className="muted small">{linhas.length} TPEs</span>
      </div>
      <div className="rolagem">
        {linhas.length === 0 ? <Vazio>Nenhuma TPE com estes filtros.</Vazio> : (
          <table className="tabela"><thead><tr><th>TPE</th><th>O.S. / cliente</th><th>Principal › grupo</th><th>Descrição</th><th>Responsável</th><th>Status</th><th>Prazo</th><th className="num">Horas</th><th className="num" title="Horas consumidas ÷ estimativa (média do grupo). Não é % de conclusão.">Consumo</th><th></th></tr></thead>
            <tbody>{linhas.map((t: any) => (
              <tr key={t.id}>
                <td><strong>{t.codigo}</strong></td>
                <td>{t.os}<div className="small muted">{t.cliente}</div></td>
                <td className="small">{t.principal} › {t.grupo}{t.grupo_original && t.grupo_original !== t.grupo && <div className="muted" title="Texto da planilha original">orig.: {t.grupo_original}</div>}</td>
                <td className="small" style={{ maxWidth: 320 }}>{t.descricao}</td>
                <td>{t.responsavel ?? <span className="badge ambar">sem responsável</span>}{t.sequencia && <div className="small muted">seq. {t.sequencia}</div>}</td>
                <td><Selo v={t.status} /></td>
                <td>{dataBR(t.prazo)} {situacaoPrazo(t.prazo, t.status) && <div><SeloPrazo prazo={t.prazo} status={t.status} /></div>}</td>
                <td className="num">{h1(t.horas_totais)}</td>
                <td className="num">{t.consumo == null ? '—' : pct(t.consumo)}</td>
                <td className="nao-imprimir"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="btn sec pequeno" onClick={() => editar(t)}>Editar</button>
                  {t.status === 'FINALIZADA' && <button className="btn sec pequeno" onClick={() => reabrir(t)} title="Gera a próxima revisão (.1, .2…)">Reabrir</button>}
                  <button className="btn fantasma pequeno" onClick={() => arquivar(t)} title="Arquivar (não exclui)"><Icone n="arquivo" /></button>
                </div></td>
              </tr>))}</tbody></table>)}
      </div>
      <Dialogo titulo={ed?.novo ? (ed?.reabertura ? `Reabrir ${ed.reabertura} → ${ed.codigo}` : `Nova TPE · ${ed?.codigo}`) : `Editar ${ed?.codigo}`} aberto={!!ed} aoFechar={() => setEd(null)} largo>
        {ed && (
          <div className="stack">
            {ed.reabertura && <Aviso tipo="info">A revisão herda O.S., principal e grupo de {ed.reabertura}. Descreva o motivo/escopo da revisão.</Aviso>}
            <div className="grid2">
              <Campo rotulo="Código" ajuda={ed.novo ? 'Gerado automaticamente; pode ser ajustado.' : 'Não editável.'}><input value={ed.codigo} readOnly={!ed.novo} onChange={(e) => setEd({ ...ed, codigo: e.target.value.toUpperCase() })} /></Campo>
              <Campo rotulo="O.S." erro={erros.os}><select value={ed.os} onChange={(e) => setEd({ ...ed, os: e.target.value })}><option value="">Escolha…</option>
                {base.os.filter((o: any) => !o.arquivada || o.os === ed.os).map((o: any) => <option key={o.os} value={o.os}>{o.os} · {o.nome}{o.status === 'FINALIZADA' ? ' (finalizada)' : ''}</option>)}</select></Campo>
              <Campo rotulo="Principal"><select value={ed.principal} onChange={(e) => setEd({ ...ed, principal: e.target.value, grupo: '' })}><option value="">Escolha…</option>{principais.map((p) => <option key={p}>{p}</option>)}</select></Campo>
              <Campo rotulo="Grupo" erro={erros.grupo}><select value={ed.grupo} onChange={(e) => setEd({ ...ed, grupo: e.target.value })} disabled={!ed.principal}><option value="">Escolha…</option>
                {catalogo.filter((c) => c.principal === ed.principal && (c.ativo || c.grupo === ed.grupo)).map((c) => <option key={c.id}>{c.grupo}</option>)}</select></Campo>
            </div>
            <Campo rotulo="Descrição" erro={erros.descricao}><textarea rows={2} maxLength={500} value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} placeholder="Ex.: Elaboração do desenho do vaso SLCH1930 -35°C" /></Campo>
            <div className="grid4">
              <Campo rotulo="Responsável"><select value={ed.responsavel_id} onChange={(e) => setEd({ ...ed, responsavel_id: e.target.value })}><option value="">Sem responsável</option>{base.recursos.filter((r: any) => r.ativo).map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
              <Campo rotulo="Sequência" ajuda="Vazio = fim da fila"><input type="number" min={1} value={ed.sequencia} onChange={(e) => setEd({ ...ed, sequencia: e.target.value })} /></Campo>
              <Campo rotulo="Status" ajuda="Só o Master altera"><select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></Campo>
              <Campo rotulo="Prazo" erro={erros.prazo}><input type="date" value={ed.prazo} onChange={(e) => setEd({ ...ed, prazo: e.target.value })} /></Campo>
              <Campo rotulo="Data de início"><input type="date" value={ed.data_inicio} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
              <Campo rotulo="Data de finalização" erro={erros.data_fim}><input type="date" value={ed.data_fim} onChange={(e) => setEd({ ...ed, data_fim: e.target.value })} /></Campo>
            </div>
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
