import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useBase } from '../../lib/base'
import { dataHoraBR } from '../../lib/formato'
import { Aviso, Cabecalho, Campo, Dialogo, Icone, useAvisar, useConfirmar } from '../../components/ui'

export default function Usuarios() {
  const { perfil } = useAuth()
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [perfis, setPerfis] = useState<any[]>([])
  const [convite, setConvite] = useState<any | null>(null)
  const [enviando, setEnviando] = useState(false)
  const carregar = () => supabase.from('profiles').select('*, recursos(nome)').order('nome').then(({ data }) => setPerfis(data ?? []))
  useEffect(() => { carregar() }, [])

  async function admin(acao: string, dados: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: { acao, ...dados } })
    if (error) { const ctx = await (error as any).context?.json?.().catch(() => null); throw new Error(ctx?.erro ?? error.message) }
    return data
  }
  async function convidar() {
    setEnviando(true)
    try {
      await admin('convidar', { email: convite.email.trim().toLowerCase(), nome: convite.nome.trim(), recurso_id: convite.recurso_id ? Number(convite.recurso_id) : null, papel: convite.papel })
      avisar('ok', 'Convite enviado por e-mail. O usuário definirá a própria senha pelo link.'); setConvite(null); carregar()
    } catch (e) { avisar('erro', mensagemErro(e)) } finally { setEnviando(false) }
  }
  async function alterar(p: any, campos: Record<string, unknown>, rotulo: string) {
    if (!(await confirmar('Confirmar alteração', <>{rotulo} para <strong>{p.nome || p.email}</strong>?</>))) return
    try {
      if ('ativo' in campos) await admin(campos.ativo ? 'reativar' : 'desativar', { user_id: p.user_id })
      else { const { error } = await supabase.from('profiles').update(campos).eq('user_id', p.user_id); if (error) throw error }
      avisar('ok', 'Alteração registrada na auditoria.'); carregar()
    } catch (e) { avisar('erro', mensagemErro(e)) }
  }
  async function novoRecurso() {
    const nome = prompt('Nome do projetista (como aparecerá nos apontamentos):')?.trim(); if (!nome) return
    const { error } = await supabase.from('recursos').insert({ nome })
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'Projetista cadastrado. Defina o custo H/H em Parâmetros.'); recarregar()
  }
  const vinculados = new Set(perfis.map((p) => p.recurso_id).filter(Boolean))
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Usuários" texto="Acesso só por convite. Cada conta é individual e vinculada a um projetista. Desativar bloqueia o login e o acesso aos dados imediatamente, sem apagar o histórico."
        acoes={<><button className="btn sec" onClick={novoRecurso}><Icone n="mais" /> Novo projetista</button><button className="btn" onClick={() => setConvite({ email: '', nome: '', recurso_id: '', papel: 'projetista' })}><Icone n="usuarios" /> Convidar usuário</button></>} />
      <div className="rolagem"><table className="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Projetista vinculado</th><th>Situação</th><th>Criado</th><th></th></tr></thead>
        <tbody>{perfis.map((p) => (
          <tr key={p.user_id}><td>{p.nome}</td><td>{p.email}</td>
            <td><select value={p.papel} disabled={p.user_id === perfil?.user_id} onChange={(e) => alterar(p, { papel: e.target.value }, `Mudar o perfil para ${e.target.value === 'master' ? 'SUPERVISOR' : 'PROJETISTA'}`)} aria-label="Perfil">
              <option value="projetista">Projetista</option><option value="master">Supervisor</option></select></td>
            <td><select value={p.recurso_id ?? ''} onChange={(e) => alterar(p, { recurso_id: e.target.value ? Number(e.target.value) : null }, 'Alterar o projetista vinculado')} aria-label="Projetista">
              <option value="">— nenhum —</option>{(base?.recursos ?? []).map((r: any) => <option key={r.id} value={r.id} disabled={vinculados.has(r.id) && p.recurso_id !== r.id}>{r.nome}</option>)}</select></td>
            <td>{p.ativo ? <span className="badge verde">ativo</span> : <span className="badge vermelho">desativado</span>}</td><td className="small">{dataHoraBR(p.criado_em)}</td>
            <td>{p.user_id !== perfil?.user_id && <button className="btn sec pequeno" onClick={() => alterar(p, { ativo: !p.ativo }, p.ativo ? 'Desativar o acesso' : 'Reativar o acesso')}>{p.ativo ? 'Desativar' : 'Reativar'}</button>}</td></tr>))}</tbody></table></div>
      <Aviso tipo="info">O primeiro Supervisor é criado por procedimento no banco (docs/PUBLICACAO.md). Não há cadastro público: desative “Allow new users to sign up” no Supabase.</Aviso>
      <Dialogo titulo="Convidar usuário" aberto={!!convite} aoFechar={() => setConvite(null)}>
        {convite && (<div className="stack">
          <Campo rotulo="E-mail corporativo"><input type="email" value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} /></Campo>
          <Campo rotulo="Nome"><input value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} /></Campo>
          <Campo rotulo="Projetista vinculado" ajuda="Necessário para registrar apontamentos."><select value={convite.recurso_id} onChange={(e) => setConvite({ ...convite, recurso_id: e.target.value })}>
            <option value="">— nenhum (somente Supervisor) —</option>{(base?.recursos ?? []).filter((r: any) => !vinculados.has(r.id)).map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
          <Campo rotulo="Perfil"><select value={convite.papel} onChange={(e) => setConvite({ ...convite, papel: e.target.value })}><option value="projetista">Projetista</option><option value="master">Supervisor</option></select></Campo>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setConvite(null)}>Cancelar</button>
            <button className="btn" disabled={enviando || !/^\S+@\S+\.\S+$/.test(convite.email) || convite.nome.trim().length < 2} onClick={convidar}>{enviando ? 'Enviando…' : 'Enviar convite'}</button></div>
        </div>)}
      </Dialogo>
    </div>
  )
}
