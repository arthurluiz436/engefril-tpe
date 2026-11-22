import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataBR, hhmm, hm, hojeISO, somaDias } from '../../lib/formato'
import { min } from '../../lib/calculo'
import { Aviso, Cabecalho, Campo, Carregando, Dialogo, Vazio, useAvisar } from '../../components/ui'

const CORRECAO_DIAS = 7

export default function MeusApontamentos() {
  const avisar = useAvisar()
  const [de, setDe] = useState(somaDias(hojeISO(), -30))
  const [ate, setAte] = useState(hojeISO())
  const [linhas, setLinhas] = useState<any[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<any | null>(null)

  async function carregar() {
    setLinhas(null)
    const { data, error } = await supabase.from('v_apontamentos').select('id, seq, tpe_id, tpe_codigo, principal, grupo, dia, hora_inicio, hora_fim, descricao, horas_normais, horas_extras, horas_totais, tipo_dia, criado_em')
      .gte('dia', de).lte('dia', ate).order('dia', { ascending: false }).order('hora_inicio', { ascending: false })
    if (error) setErro(mensagemErro(error)); else setLinhas(data ?? [])
  }
  useEffect(() => { carregar() }, [de, ate]) // eslint-disable-line

  const editavel = (r: any) => Date.now() - Date.parse(r.criado_em) < CORRECAO_DIAS * 86400000
  const total = (linhas ?? []).reduce((s, r) => s + Number(r.horas_totais), 0)

  async function salvarEdicao() {
    const e = editando
    if (min(e.hora_fim) <= min(e.hora_inicio)) return avisar('erro', 'O término deve ser depois do início.')
    if (e.descricao.trim().length < 3) return avisar('erro', 'Descreva o que foi feito.')
    const { error } = await supabase.from('apontamentos').update({ dia: e.dia, hora_inicio: e.hora_inicio, hora_fim: e.hora_fim, descricao: e.descricao.trim() }).eq('id', e.id)
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', 'Correção salva. A alteração fica registrada no histórico de auditoria.')
    setEditando(null); carregar()
  }

  return (
    <div className="stack">
      <Cabecalho titulo="Meus apontamentos" texto={`Seus registros de horas. Correções são permitidas por até ${CORRECAO_DIAS} dias após o lançamento e ficam registradas.`} />
      <div className="row nao-imprimir">
        <Campo rotulo="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <div className="grow" />
        <div className="card" style={{ padding: '8px 14px' }}><span className="muted small">Total no período</span><div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{hm(total)}</div></div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!linhas ? <Carregando /> : linhas.length === 0 ? <div className="card"><Vazio>Nenhum apontamento no período.</Vazio></div> : (
        <div className="rolagem">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Horário</th><th>TPE</th><th>Descrição</th><th className="num">Normais</th><th className="num">Extras</th><th className="nao-imprimir"></th></tr></thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id}>
                  <td>{dataBR(r.dia)}{r.tipo_dia !== 'DIA ÚTIL' && <div className="small muted">{r.tipo_dia}</div>}</td>
                  <td className="mono">{hhmm(r.hora_inicio)}–{hhmm(r.hora_fim)}</td>
                  <td><strong>{r.tpe_codigo}</strong><div className="small muted">{r.grupo}</div></td>
                  <td>{r.descricao}</td>
                  <td className="num">{hm(Number(r.horas_normais))}</td>
                  <td className="num">{Number(r.horas_extras) ? hm(Number(r.horas_extras)) : '—'}</td>
                  <td className="nao-imprimir">{editavel(r) && <button className="btn sec pequeno" onClick={() => setEditando({ ...r, hora_inicio: hhmm(r.hora_inicio), hora_fim: hhmm(r.hora_fim) })}>Corrigir</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo titulo="Corrigir apontamento" aberto={!!editando} aoFechar={() => setEditando(null)}>
        {editando && (
          <div className="stack">
            <Aviso tipo="info">TPE {editando.tpe_codigo}. A TPE e o projetista não podem ser alterados aqui.</Aviso>
            <Campo rotulo="Data"><input type="date" value={editando.dia} max={somaDias(hojeISO(), 1)} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} /></Campo>
            <div className="grid2">
              <Campo rotulo="Início"><input type="time" value={editando.hora_inicio} onChange={(e) => setEditando({ ...editando, hora_inicio: e.target.value })} /></Campo>
              <Campo rotulo="Término"><input type="time" value={editando.hora_fim} onChange={(e) => setEditando({ ...editando, hora_fim: e.target.value })} /></Campo>
            </div>
            <Campo rotulo="Descrição"><textarea rows={3} maxLength={500} value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} /></Campo>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sec" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn" onClick={salvarEdicao}>Salvar correção</button>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  )
}
