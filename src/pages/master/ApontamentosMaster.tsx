import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, h1, hhmm, hojeISO, reais, somaDias } from '../../lib/formato'
import { min } from '../../lib/calculo'
import { Aviso, Cabecalho, Campo, Carregando, Dialogo, Icone, useAvisar } from '../../components/ui'
import { useOrdem } from '../../components/Ordenacao'
import { corRecurso } from '../../lib/agenda'

export default function ApontamentosMaster() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const [qs] = useSearchParams()
  const [de, setDe] = useState(somaDias(hojeISO(), -30)); const [ate, setAte] = useState(hojeISO())
  const [rec, setRec] = useState(''); const [tpe, setTpe] = useState('')
  const [ed, setEd] = useState<any | null>(null)
  const [exc, setExc] = useState<any | null>(null)
  const soSobrepostos = qs.get('f') === 'sobrepostos'
  // ordenação por coluna (padrão: mais recente primeiro) e cor de cada projetista
  const ord = useOrdem({ k: 'quando', dir: -1 })
  const cores = useMemo(() => new Map((base?.recursos ?? []).map((r: any, i: number) => [String(r.id), corRecurso(r, i)])), [base])
  const VALOR: Record<string, (a: any) => any> = {
    seq: (a) => Number(a.seq), quando: (a) => `${a.dia} ${a.hora_inicio}`, projetista: (a) => a.recurso_nome, tpe: (a) => a.tpe_codigo,
    horario: (a) => a.hora_inicio, normais: (a) => Number(a.horas_normais), extras: (a) => Number(a.horas_extras), custo: (a) => Number(a.custo_total ?? 0),
    descricao: (a) => a.descricao, origem: (a) => a.origem,
  }

  const linhas = useMemo(() => {
    if (!base) return []
    let ls = base.aps
    if (soSobrepostos) {
      const ids = new Set<number>()
      const m = new Map<string, any[]>()
      for (const a of ls) { const k = `${a.recurso_id}|${a.dia}`; m.set(k, [...(m.get(k) ?? []), a]) }
      for (const g of m.values()) { const s = [...g].sort((x, y) => x.hora_inicio.localeCompare(y.hora_inicio)); for (let i = 1; i < s.length; i++) if (s[i].hora_inicio < s[i - 1].hora_fim) { ids.add(s[i].id); ids.add(s[i - 1].id) } }
      ls = ls.filter((a: any) => ids.has(a.id))
    } else ls = ls.filter((a: any) => a.dia >= de && a.dia <= ate)
    if (rec) ls = ls.filter((a: any) => String(a.recurso_id) === rec)
    if (tpe) ls = ls.filter((a: any) => a.tpe_codigo.includes(tpe.toUpperCase()))
    return ord.ordenar([...ls], (a: any, k) => VALOR[k](a))
  }, [base, de, ate, rec, tpe, soSobrepostos, ord.ord]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (min(ed.hora_fim) <= min(ed.hora_inicio)) return avisar('erro', 'Término deve ser depois do início.')
    if ((ed.descricao ?? '').trim().length < 3) return avisar('erro', 'Descreva a atividade.')
    const reg = { tpe_id: Number(ed.tpe_id), recurso_id: Number(ed.recurso_id), dia: ed.dia, hora_inicio: ed.hora_inicio, hora_fim: ed.hora_fim, descricao: ed.descricao.trim() }
    const { error } = ed.id ? await supabase.from('apontamentos').update(reg).eq('id', ed.id) : await supabase.from('apontamentos').insert({ ...reg, client_request_id: ed.req })
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', 'Apontamento salvo (registrado na auditoria).'); setEd(null); recarregar()
  }
  async function excluir() {
    const { error } = await supabase.rpc('excluir_apontamento', { p_id: exc.id, p_motivo: exc.motivo ?? '' })
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', 'Apontamento excluído (exclusão lógica, com motivo e auditoria).'); setExc(null); recarregar()
  }
  if (!base) return <Carregando />
  const total = linhas.reduce((s: number, a: any) => s + a.horas_totais, 0)
  return (
    <div className="stack">
      <Cabecalho titulo="Apontamentos" texto="Consulte, corrija ou lance horas em nome de um projetista. Toda alteração fica na auditoria; exclusão exige motivo e não apaga o registro do banco."
        acoes={<button className="btn" onClick={() => setEd({ dia: hojeISO(), hora_inicio: '', hora_fim: '', descricao: '', tpe_id: '', recurso_id: '', req: crypto.randomUUID() })}><Icone n="mais" /> Lançar apontamento</button>} />
      {soSobrepostos && <Aviso tipo="atencao">Mostrando apenas lançamentos com horário sobreposto ao de outro lançamento do mesmo projetista no mesmo dia. Confira com a agenda antes de corrigir.</Aviso>}
      <div className="row nao-imprimir">
        {!soSobrepostos && <><Campo rotulo="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo><Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo></>}
        <Campo rotulo="Projetista"><select value={rec} onChange={(e) => setRec(e.target.value)}><option value="">Todos</option>{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
        <Campo rotulo="TPE"><input value={tpe} onChange={(e) => setTpe(e.target.value)} placeholder="TPE-012" /></Campo>
        <span className="muted small">{linhas.length} apontamentos · {h1(total)} h · clique no título da coluna para ordenar</span>
      </div>
      <div className="rolagem"><table className="tabela"><thead><tr><ord.Th k="seq">Nº</ord.Th><ord.Th k="quando">Data</ord.Th><ord.Th k="projetista">Projetista</ord.Th><ord.Th k="tpe">TPE</ord.Th><ord.Th k="horario">Horário</ord.Th><ord.Th k="normais" num>Normais</ord.Th><ord.Th k="extras" num>Extras</ord.Th><ord.Th k="custo" num>Custo</ord.Th><ord.Th k="descricao">Descrição</ord.Th><ord.Th k="origem">Origem</ord.Th><th></th></tr></thead>
        <tbody>{linhas.slice(0, 1000).map((a: any) => (
          <tr key={a.id} style={{ boxShadow: `inset 3px 0 0 ${cores.get(String(a.recurso_id)) ?? 'transparent'}` }}><td>{a.seq}</td><td>{dataBR(a.dia)}{a.tipo_dia !== 'DIA ÚTIL' && <div className="small muted">{a.tipo_dia}</div>}</td><td className="sem-quebra"><span className="ind-proj" style={{ fontWeight: 600, color: cores.get(String(a.recurso_id)) }}><span className="g2-ponto" style={{ background: cores.get(String(a.recurso_id)) }} />{a.recurso_nome}</span></td><td className="sem-quebra">{a.tpe_codigo}</td>
            <td className="mono">{hhmm(a.hora_inicio)}–{hhmm(a.hora_fim)}</td><td className="num">{h1(a.horas_normais)}</td><td className="num">{a.horas_extras ? h1(a.horas_extras) : '—'}</td><td className="num">{reais(a.custo_total)}</td>
            <td className="small" style={{ maxWidth: 300 }}>{a.descricao}</td><td><span className="badge">{a.origem}</span></td>
            <td className="nao-imprimir"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button className="btn sec pequeno" onClick={() => setEd({ ...a, hora_inicio: hhmm(a.hora_inicio), hora_fim: hhmm(a.hora_fim) })}>Editar</button>
              <button className="btn fantasma pequeno" onClick={() => setExc({ ...a, motivo: '' })} aria-label="Excluir"><Icone n="lixo" /></button></div></td></tr>))}</tbody></table></div>
      <Dialogo titulo={ed?.id ? `Editar apontamento nº ${ed.seq}` : 'Lançar apontamento'} aberto={!!ed} aoFechar={() => setEd(null)}>
        {ed && (<div className="stack">
          <Campo rotulo="Projetista"><select value={ed.recurso_id} onChange={(e) => setEd({ ...ed, recurso_id: e.target.value })}><option value="">Escolha…</option>{base.recursos.map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
          <Campo rotulo="TPE"><select value={ed.tpe_id} onChange={(e) => setEd({ ...ed, tpe_id: e.target.value })}><option value="">Escolha…</option>{[...base.tpes].sort((a: any, b: any) => b.numero - a.numero).map((t: any) => <option key={t.id} value={t.id}>{t.codigo} · {t.cliente} · {t.grupo}</option>)}</select></Campo>
          <div className="grid2"><Campo rotulo="Data"><input type="date" value={ed.dia} onChange={(e) => setEd({ ...ed, dia: e.target.value })} /></Campo><div />
            <Campo rotulo="Início"><input type="time" value={ed.hora_inicio} onChange={(e) => setEd({ ...ed, hora_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Término"><input type="time" value={ed.hora_fim} onChange={(e) => setEd({ ...ed, hora_fim: e.target.value })} /></Campo></div>
          <Campo rotulo="Descrição"><textarea rows={3} maxLength={500} value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} /></Campo>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setEd(null)}>Cancelar</button><button className="btn" disabled={!ed.tpe_id || !ed.recurso_id} onClick={salvar}>Salvar</button></div>
        </div>)}
      </Dialogo>
      <Dialogo titulo={`Excluir apontamento nº ${exc?.seq}`} aberto={!!exc} aoFechar={() => setExc(null)}>
        {exc && (<div className="stack">
          <Aviso tipo="atencao">{exc.recurso_nome} · {exc.tpe_codigo} · {dataBR(exc.dia)} {hhmm(exc.hora_inicio)}–{hhmm(exc.hora_fim)}. A exclusão é lógica: o registro sai dos cálculos, mas permanece no banco com seu motivo.</Aviso>
          <Campo rotulo="Motivo (obrigatório)"><input value={exc.motivo} onChange={(e) => setExc({ ...exc, motivo: e.target.value })} placeholder="Ex.: lançamento em duplicidade, conferido com a agenda" /></Campo>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setExc(null)}>Cancelar</button><button className="btn perigo" disabled={exc.motivo.trim().length < 5} onClick={excluir}>Excluir</button></div>
        </div>)}
      </Dialogo>
    </div>
  )
}
