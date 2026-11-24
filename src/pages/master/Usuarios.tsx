import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useBase } from '../../lib/base'
import { dataHoraBR } from '../../lib/formato'
import { corRecurso } from '../../lib/agenda'
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
    const email = convite.email.trim().toLowerCase()
    try {
      const obs = convite.papel === 'observador'
      const r = await admin('convidar', { email, nome: convite.nome.trim(), recurso_id: obs ? null : convite.recurso_id ? Number(convite.recurso_id) : null, papel: convite.papel })
      if (obs) {
        const id = r?.user_id ?? (await supabase.from('profiles').select('user_id').eq('email', email).maybeSingle()).data?.user_id
        const { error } = await supabase.from('profiles').update({ papel: 'observador', recurso_id: null }).eq('user_id', id)
        if (error) throw error
      }
      avisar('ok', 'Convite enviado por e-mail. O usuário definirá a própria senha pelo link.'); setConvite(null); carregar()
    } catch (e) {
      // antes de mostrar erro, confere no banco se o convite foi criado mesmo assim (ex.: resposta perdida ou repetida)
      const { data: ja } = await supabase.from('profiles').select('user_id, nome').eq('email', email).maybeSingle()
      if (ja) { avisar('ok', `O convite para ${email} foi criado e o e-mail enviado. Confira a lista abaixo.`); setConvite(null); carregar(); return }
      avisar('erro', explicarErroConvite(mensagemErro(e), email))
    } finally { setEnviando(false) }
  }
  async function alterar(p: any, campos: Record<string, unknown>, rotulo: string) {
    if (!(await confirmar('Confirmar alteração', <>{rotulo} para <strong>{p.nome || p.email}</strong>?</>))) return
    try {
      if ('ativo' in campos) await admin(campos.ativo ? 'reativar' : 'desativar', { user_id: p.user_id })
      else { const { error } = await supabase.from('profiles').update(campos).eq('user_id', p.user_id); if (error) throw error }
      avisar('ok', 'Alteração registrada na auditoria.'); carregar()
    } catch (e) { avisar('erro', mensagemErro(e)) }
  }
  async function apagarRecurso(r: any) {
    const login = perfis.find((p) => p.recurso_id === r.id)
    if (login) return avisar('erro', `${r.nome} está vinculado ao login de ${login.nome || login.email}. Tire o vínculo na tabela acima antes de apagar.`)
    if (!(await confirmar('Apagar projetista', <>Apagar <strong>{r.nome}</strong>? Só é possível se ele não tiver TPE vinculada nem apontamento. O custo H/H e as férias cadastradas dele também são apagados. Esta ação não pode ser desfeita.</>, 'Apagar', true))) return
    const { data, error } = await supabase.rpc('excluir_recurso', { p_recurso: r.id })
    if (error) return avisar('erro', /excluir_recurso/.test(error.message) && /function|schema cache/i.test(error.message) ? 'Para apagar projetistas, aplique a migração 20261124000010 no Supabase.' : mensagemErro(error))
    avisar('ok', `${data ?? r.nome} apagado.`); recarregar()
  }
  async function novoRecurso() {
    const nome = prompt('Nome do projetista (como aparecerá nos apontamentos):')?.trim(); if (!nome) return
    const { error } = await supabase.from('recursos').insert({ nome })
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'Projetista cadastrado. Defina o custo H/H em Parâmetros.'); recarregar()
  }
  const vinculados = new Set(perfis.map((p) => p.recurso_id).filter(Boolean))
  const semCor = !!base?.recursos.length && !('cor' in base.recursos[0])
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Usuários" texto="Acesso só por convite. Cada conta é individual e vinculada a um projetista. Desativar bloqueia o login e o acesso aos dados imediatamente, sem apagar o histórico."
        acoes={<><span className="small muted" style={{ maxWidth: 260 }}>Observador: só consulta (painel, indicadores, O.S., TPEs, cronograma e calendário).</span><button className="btn sec" onClick={novoRecurso}><Icone n="mais" /> Novo projetista</button><button className="btn" onClick={() => setConvite({ email: '', nome: '', recurso_id: '', papel: 'projetista' })}><Icone n="usuarios" /> Convidar usuário</button></>} />
      <div className="rolagem"><table className="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Projetista vinculado</th><th>Situação</th><th>Criado</th><th></th></tr></thead>
        <tbody>{perfis.map((p) => (
          <tr key={p.user_id}><td>{p.nome}</td><td>{p.email}</td>
            <td><select value={p.papel} disabled={p.user_id === perfil?.user_id} onChange={(e) => alterar(p, e.target.value === 'observador' ? { papel: 'observador', recurso_id: null } : { papel: e.target.value }, `Mudar o perfil para ${({ master: 'SUPERVISOR', projetista: 'PROJETISTA', observador: 'OBSERVADOR (somente consulta)' } as Record<string, string>)[e.target.value]}`)} aria-label="Perfil">
              <option value="projetista">Projetista</option><option value="master">Supervisor</option><option value="observador">Observador</option></select></td>
            <td><select value={p.recurso_id ?? ''} disabled={p.papel === 'observador'} title={p.papel === 'observador' ? 'O Observador não aponta horas' : undefined} onChange={(e) => alterar(p, { recurso_id: e.target.value ? Number(e.target.value) : null }, 'Alterar o projetista vinculado')} aria-label="Projetista">
              <option value="">— nenhum —</option>{(base?.recursos ?? []).map((r: any) => <option key={r.id} value={r.id} disabled={vinculados.has(r.id) && p.recurso_id !== r.id}>{r.nome}</option>)}</select></td>
            <td>{p.ativo ? <span className="badge verde">ativo</span> : <span className="badge vermelho">desativado</span>}</td><td className="small">{dataHoraBR(p.criado_em)}</td>
            <td>{p.user_id !== perfil?.user_id && <button className="btn sec pequeno" onClick={() => alterar(p, { ativo: !p.ativo }, p.ativo ? 'Desativar o acesso' : 'Reativar o acesso')}>{p.ativo ? 'Desativar' : 'Reativar'}</button>}</td></tr>))}</tbody></table></div>
      <div className="card">
        <h2>Cor de cada projetista</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Usada nas faixas e barras dos cronogramas. Escolha cores bem diferentes entre si para cada pessoa ser reconhecida de longe.</p>
        {semCor && <Aviso tipo="atencao">Para gravar as cores, aplique a migração <code>20261122000007_predecessora_cor_exclusao.sql</code> no Supabase. Até lá o sistema usa cores automáticas.</Aviso>}
        <div className="cores-proj">
          {(base?.recursos ?? []).map((r: any, i: number) => {
            const login = perfis.find((p) => p.recurso_id === r.id)
            return (
              <label key={r.id} className="cor-proj" style={{ borderLeftColor: corRecurso(r, i) }}>
                <input type="color" defaultValue={corRecurso(r, i)} disabled={semCor} aria-label={`Cor de ${r.nome}`}
                  onBlur={async (e) => {
                    const cor = e.target.value
                    if (cor.toLowerCase() === corRecurso(r, i).toLowerCase()) return
                    const { error } = await supabase.from('recursos').update({ cor }).eq('id', r.id)
                    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : `Cor de ${r.nome} atualizada.`); if (!error) recarregar()
                  }} />
                <span><strong>{r.nome}</strong><span className="small muted">{login ? login.email : 'sem login'}{!r.ativo ? ' · inativo' : ''}</span></span>
                {!login && <button type="button" className="btn fantasma pequeno btn-apagar cor-proj-apagar" title={`Apagar ${r.nome} (só sem TPE vinculada)`} aria-label={`Apagar ${r.nome}`} onClick={(e) => { e.preventDefault(); apagarRecurso(r) }}><Icone n="lixo" /></button>}
              </label>)
          })}
        </div>
      </div>
      <Aviso tipo="info">O primeiro Supervisor é criado por procedimento no banco (docs/PUBLICACAO.md). Não há cadastro público: desative “Allow new users to sign up” no Supabase.</Aviso>
      <Dialogo titulo="Convidar usuário" aberto={!!convite} aoFechar={() => setConvite(null)}>
        {convite && (<div className="stack">
          <Campo rotulo="E-mail corporativo"><input type="email" value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} /></Campo>
          <Campo rotulo="Nome"><input value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} /></Campo>
          <Campo rotulo="Projetista vinculado" ajuda={convite.papel === 'observador' ? 'O Observador não aponta horas: fica sem projetista.' : 'Necessário para registrar apontamentos.'}><select value={convite.papel === 'observador' ? '' : convite.recurso_id} disabled={convite.papel === 'observador'} onChange={(e) => setConvite({ ...convite, recurso_id: e.target.value })}>
            <option value="">— nenhum (somente Supervisor) —</option>{(base?.recursos ?? []).filter((r: any) => !vinculados.has(r.id)).map((r: any) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
          <Campo rotulo="Perfil"><select value={convite.papel} onChange={(e) => setConvite({ ...convite, papel: e.target.value })}><option value="projetista">Projetista</option><option value="master">Supervisor</option><option value="observador">Observador (somente consulta)</option></select></Campo>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setConvite(null)}>Cancelar</button>
            <button className="btn" disabled={enviando || !/^\S+@\S+\.\S+$/.test(convite.email) || convite.nome.trim().length < 2} onClick={convidar}>{enviando ? 'Enviando…' : 'Enviar convite'}</button></div>
        </div>)}
      </Dialogo>
    </div>
  )
}

/** Traduz as respostas do Supabase Auth para o Supervisor. */
function explicarErroConvite(msg: string, email: string): string {
  if (/is invalid|email_address_invalid/i.test(msg))
    return `O Supabase recusou o endereço ${email}: ele confere se o e-mail pode receber mensagens e este parece não existir (no Gmail, por exemplo, o nome antes do @ tem no mínimo 6 caracteres). Confira o endereço com a pessoa.`
  if (/already been registered|already registered|exists/i.test(msg)) return `Já existe um acesso com ${email}. Use Reativar na lista, se estiver desativado.`
  if (/rate limit|too many/i.test(msg)) return 'Limite de envio de e-mails do Supabase atingido (poucos por hora no envio padrão). Tente de novo mais tarde ou configure o SMTP da empresa.'
  if (/not authorized/i.test(msg)) return `O envio padrão do Supabase só manda e-mail para endereços autorizados. Configure o SMTP da empresa (Authentication › Emails › SMTP) para convidar ${email}.`
  return msg
}
