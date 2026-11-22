import { useEffect, useMemo, useState } from 'react'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { linhasDe } from '../../lib/conjuntos'
import { dataBR, h1, hojeISO, reais0 } from '../../lib/formato'
import { Cabecalho, Campo, Carregando, Dialogo, Icone, Selo, SeloPrazo, useAvisar, useConfirmar } from '../../components/ui'

export default function OrdensServico() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [busca, setBusca] = useState('')
  const [ed, setEd] = useState<any | null>(null)
  const [listas, setListas] = useState<Record<string, string[]>>({})
  useEffect(() => {
    supabase.from('listas').select('*').eq('ativo', true).order('ordem').then(({ data }) => {
      const m: Record<string, string[]> = {}; for (const l of data ?? []) (m[l.tipo] ??= []).push(l.valor); setListas(m)
    })
  }, [])
  const vendedores = useMemo(() => [...new Set([...(listas.vendedor ?? []), ...(base?.os ?? []).map((o: any) => o.vendedor).filter(Boolean)])].sort(), [listas, base])
  const linhas = useMemo(() => {
    if (!base) return []
    const b = busca.toLowerCase()
    return linhasDe('os', base).filter((o: any) => o.arquivada !== 'SIM' && (!b || `${o.os} ${o.nome} ${o.cidade} ${o.vendedor}`.toLowerCase().includes(b)))
      .sort((a: any, z: any) => z.os - a.os)
  }, [base, busca])

  const erros = ed ? {
    os: !ed.os || Number(ed.os) < 0 ? 'Informe o número.' : ed.novo && base?.os.some((o: any) => o.os === Number(ed.os)) ? 'O.S. já cadastrada.' : null,
    nome: !ed.nome?.trim() ? 'Obrigatório.' : null,
    prazo: ed.prazo_final && ed.data_inicio && ed.prazo_final < ed.data_inicio ? 'Antes do início.' : null,
  } : {}
  async function salvar() {
    const reg = { nome: ed.nome.trim().toUpperCase(), uf: ed.uf || null, cidade: ed.cidade?.trim().toUpperCase() || null, projeto_engefril: ed.projeto_engefril || null,
      nivel: ed.nivel || null, vendedor: ed.vendedor?.trim().toUpperCase() || null, classificacao: ed.classificacao || null,
      data_inicio: ed.data_inicio || null, prazo_final: ed.prazo_final || null, status: ed.status }
    const { error } = ed.novo ? await supabase.from('ordens_servico').insert({ os: Number(ed.os), ...reg }) : await supabase.from('ordens_servico').update(reg).eq('os', ed.os)
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `O.S. ${ed.os} salva.`); setEd(null); recarregar()
  }
  async function finalizar(o: any) {
    const abertas = base!.tpes.filter((t: any) => t.os === o.os && t.status !== 'FINALIZADA')
    if (!(await confirmar('Finalizar O.S.', <>Finalizar a O.S. <strong>{o.os}</strong>?{abertas.length ? <> Ela tem <strong>{abertas.length}</strong> TPE(s) em aberto, que continuarão abertas (finalize-as em TPEs).</> : ''}</>, 'Finalizar'))) return
    const { error } = await supabase.from('ordens_servico').update({ status: 'FINALIZADA' }).eq('os', o.os)
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'O.S. finalizada.'); recarregar()
  }
  async function arquivar(o: any) {
    if (!(await confirmar('Arquivar O.S.', <>Arquivar a O.S. <strong>{o.os}</strong>? Ela some das listas, mas continua na base e nos indicadores.</>, 'Arquivar'))) return
    await supabase.from('ordens_servico').update({ arquivada: true }).eq('os', o.os); recarregar()
  }
  if (!base) return <Carregando />
  const sel = (k: string, ops: string[]) => <select value={ed[k] ?? ''} onChange={(e) => setEd({ ...ed, [k]: e.target.value })}><option value="">—</option>{ops.map((x) => <option key={x}>{x}</option>)}</select>
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Clientes e O.S." texto="Cada O.S. é cadastrada uma vez; as TPEs herdam cliente, local, nível, vendedor e classificação daqui."
        acoes={<button className="btn" onClick={() => setEd({ novo: true, os: '', nome: '', status: 'EM ANDAMENTO', data_inicio: hojeISO() })}><Icone n="mais" /> Nova O.S.</button>} />
      <input type="search" placeholder="Buscar O.S., cliente, cidade, vendedor…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 380 }} aria-label="Buscar" />
      <div className="rolagem"><table className="tabela"><thead><tr><th>O.S.</th><th>Cliente</th><th>Local</th><th>Nível</th><th>Vendedor</th><th>Classificação</th><th>Prazo final</th><th>Status</th><th className="num">TPEs (abertas)</th><th className="num">Horas</th><th className="num">Custo</th><th></th></tr></thead>
        <tbody>{linhas.map((o: any) => (
          <tr key={o.os}><td><strong>{o.os}</strong>{o.tipo === 'INTERNA' && <div><span className="badge">interna</span></div>}</td><td>{o.nome}</td><td className="small">{o.cidade}{o.uf ? `/${o.uf}` : ''}</td><td>{o.nivel}</td><td>{o.vendedor}</td><td className="small">{o.classificacao}</td>
            <td>{dataBR(o.prazo_final)}{o.status !== 'FINALIZADA' && o.prazo_final && o.prazo_final < hojeISO() && <div><SeloPrazo prazo={o.prazo_final} status={o.status} /></div>}</td><td><Selo v={o.status} /></td>
            <td className="num">{o.qtd_tpes} ({o.tpes_abertas})</td><td className="num">{h1(o.horas)}</td><td className="num">{reais0(o.custo)}</td>
            <td className="nao-imprimir"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button className="btn sec pequeno" onClick={() => setEd({ ...o, data_inicio: o.data_inicio ?? '', prazo_final: o.prazo_final ?? '' })}>Editar</button>
              {o.status !== 'FINALIZADA' && <button className="btn sec pequeno" onClick={() => finalizar(o)}>Finalizar</button>}
              <button className="btn fantasma pequeno" onClick={() => arquivar(o)} title="Arquivar"><Icone n="arquivo" /></button></div></td></tr>))}</tbody></table></div>
      <Dialogo titulo={ed?.novo ? 'Nova O.S.' : `O.S. ${ed?.os}`} aberto={!!ed} aoFechar={() => setEd(null)} largo>
        {ed && (
          <div className="stack">
            <div className="grid4">
              <Campo rotulo="O.S." erro={erros.os}><input type="number" min={0} value={ed.os} readOnly={!ed.novo} onChange={(e) => setEd({ ...ed, os: e.target.value })} /></Campo>
              <Campo rotulo="Cliente" erro={erros.nome}><input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></Campo>
              <Campo rotulo="UF">{sel('uf', listas.uf ?? [])}</Campo>
              <Campo rotulo="Cidade"><input value={ed.cidade ?? ''} onChange={(e) => setEd({ ...ed, cidade: e.target.value })} /></Campo>
              <Campo rotulo="Projeto Engefril">{sel('projeto_engefril', listas.projeto_engefril ?? [])}</Campo>
              <Campo rotulo="Nível">{sel('nivel', listas.nivel ?? [])}</Campo>
              <Campo rotulo="Vendedor"><input list="vendedores" value={ed.vendedor ?? ''} onChange={(e) => setEd({ ...ed, vendedor: e.target.value })} /><datalist id="vendedores">{vendedores.map((v) => <option key={v} value={v} />)}</datalist></Campo>
              <Campo rotulo="Classificação">{sel('classificacao', listas.classificacao ?? [])}</Campo>
              <Campo rotulo="Data de início"><input type="date" value={ed.data_inicio ?? ''} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
              <Campo rotulo="Prazo final" erro={erros.prazo}><input type="date" value={ed.prazo_final ?? ''} onChange={(e) => setEd({ ...ed, prazo_final: e.target.value })} /></Campo>
              <Campo rotulo="Status"><select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}><option>EM ANDAMENTO</option><option>FINALIZADA</option></select></Campo>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setEd(null)}>Cancelar</button>
              <button className="btn" disabled={Object.values(erros).some(Boolean)} onClick={salvar}>Salvar</button></div>
          </div>
        )}
      </Dialogo>
    </div>
  )
}
