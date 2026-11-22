import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { dataHoraBR } from '../../lib/formato'
import { Aviso, Cabecalho, Campo, Carregando, Vazio } from '../../components/ui'

const TABELAS = ['apontamentos', 'tpes', 'atribuicoes', 'ordens_servico', 'profiles', 'recursos', 'custos_hh', 'parametros', 'feriados', 'catalogo_grupos', 'import_lotes', 'reconciliacao']

export default function Auditoria() {
  const [linhas, setLinhas] = useState<any[] | null>(null)
  const [tabela, setTabela] = useState('')
  const [acao, setAcao] = useState('')
  const [registro, setRegistro] = useState('')
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { supabase.from('profiles').select('user_id, nome, email').then(({ data }) => setUsuarios(Object.fromEntries((data ?? []).map((p: any) => [p.user_id, p.nome || p.email])))) }, [])
  useEffect(() => {
    setLinhas(null)
    let q = supabase.from('auditoria').select('*').order('quando', { ascending: false }).limit(300)
    if (tabela) q = q.eq('tabela', tabela)
    if (acao) q = q.eq('acao', acao)
    if (registro) q = q.eq('registro', registro)
    q.then(({ data, error }) => { if (error) setErro(mensagemErro(error)); else setLinhas(data ?? []) })
  }, [tabela, acao, registro])
  const dif = (a: any, d: any) => {
    if (!a || !d) return null
    return Object.keys(d).filter((k) => !['atualizado_em', 'atualizado_por'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k])).map((k) => `${k}: ${a[k] ?? '∅'} → ${d[k] ?? '∅'}`).join('; ')
  }
  return (
    <div className="stack">
      <Cabecalho titulo="Auditoria" texto="Toda inclusão, alteração e exclusão nas tabelas principais é registrada automaticamente pelo banco (quem, quando, antes e depois). Ninguém, nem o Master, edita este histórico pelo aplicativo." />
      <div className="row">
        <Campo rotulo="Tabela"><select value={tabela} onChange={(e) => setTabela(e.target.value)}><option value="">Todas</option>{TABELAS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo rotulo="Ação"><select value={acao} onChange={(e) => setAcao(e.target.value)}><option value="">Todas</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select></Campo>
        <Campo rotulo="Registro (id)"><input value={registro} onChange={(e) => setRegistro(e.target.value.trim())} placeholder="ex.: 128" /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!linhas ? <Carregando /> : linhas.length === 0 ? <Vazio>Nenhum registro.</Vazio> : (
        <div className="rolagem"><table className="tabela"><thead><tr><th>Quando</th><th>Usuário</th><th>Tabela</th><th>Registro</th><th>Ação</th><th>Alterações</th></tr></thead>
          <tbody>{linhas.map((l) => <tr key={l.id}><td className="small">{dataHoraBR(l.quando)}</td><td>{l.usuario ? usuarios[l.usuario] ?? l.usuario.slice(0, 8) : 'sistema'}</td><td>{l.tabela}</td><td>{l.registro}</td>
            <td><span className={`badge ${l.acao === 'DELETE' ? 'vermelho' : l.acao === 'UPDATE' ? 'ambar' : 'azul'}`}>{l.acao}</span></td>
            <td className="small" style={{ maxWidth: 520 }}>{l.acao === 'UPDATE' ? dif(l.antes, l.depois) : l.acao === 'INSERT' ? summary(l.depois) : summary(l.antes)}</td></tr>)}</tbody></table></div>)}
    </div>
  )
}
const summary = (o: any) => (o ? Object.entries(o).filter(([k, v]) => v !== null && !['criado_em', 'atualizado_em'].includes(k)).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ') : '')
