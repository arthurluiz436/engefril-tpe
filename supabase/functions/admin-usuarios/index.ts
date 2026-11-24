// Edge Function protegida: convite, desativação e reativação de usuários.
// Roda nos servidores do Supabase; a chave service_role vem de variável de ambiente
// (SUPABASE_SERVICE_ROLE_KEY, injetada automaticamente) e NUNCA chega ao navegador.
// Toda chamada exige um JWT válido de um usuário Master ativo (verificado no banco).
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const URL_APP = Deno.env.get('URL_APP') ?? ''

function cors(origem: string | null) {
  const ok = origem && (ORIGENS.length === 0 || ORIGENS.includes(origem))
  return {
    'Access-Control-Allow-Origin': ok ? origem! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
const resp = (status: number, corpo: unknown, h: Record<string, string>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...h, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  if (req.method !== 'POST') return resp(405, { erro: 'Método não permitido.' }, h)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return resp(401, { erro: 'Não autenticado.' }, h)

  // 1) identidade do chamador (com a chave pública + JWT dele)
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: u, error: eu } = await comoUsuario.auth.getUser(jwt)
  if (eu || !u?.user) return resp(401, { erro: 'Sessão inválida.' }, h)
  const { data: master } = await comoUsuario.rpc('is_master')
  if (master !== true) return resp(403, { erro: 'Somente o Master pode administrar usuários.' }, h)

  // 2) validação da entrada
  let corpo: Record<string, unknown>
  try { corpo = await req.json() } catch { return resp(400, { erro: 'JSON inválido.' }, h) }
  const acao = String(corpo.acao ?? '')
  const admin = createClient(url, servico, { auth: { persistSession: false } })
  const registrar = (detalhe: Record<string, unknown>) =>
    admin.from('auditoria').insert({ tabela: 'auth.users', registro: String(detalhe.alvo ?? ''), acao: `ADMIN:${acao.toUpperCase()}`, depois: detalhe, usuario: u.user.id })

  try {
    if (acao === 'convidar') {
      const email = String(corpo.email ?? '').trim().toLowerCase()
      const nome = String(corpo.nome ?? '').trim().slice(0, 80)
      const papel = corpo.papel === 'master' ? 'master' : corpo.papel === 'observador' ? 'observador' : 'projetista'
      const recurso = corpo.recurso_id == null || papel === 'observador' ? null : Number(corpo.recurso_id)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return resp(400, { erro: 'E-mail inválido.' }, h)
      if (nome.length < 2) return resp(400, { erro: 'Informe o nome.' }, h)
      if (recurso !== null && !Number.isInteger(recurso)) return resp(400, { erro: 'Projetista inválido.' }, h)
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo: URL_APP ? `${URL_APP}#/definir-senha` : undefined })
      if (error) return resp(400, { erro: error.message }, h)
      // o gatilho do banco cria o perfil como projetista; aqui o Master define papel e vínculo
      const { error: ep } = await admin.from('profiles').update({ nome, papel, recurso_id: recurso, ativo: true }).eq('user_id', data.user.id)
      if (ep) return resp(400, { erro: ep.message }, h)
      await registrar({ alvo: data.user.id, email, papel, recurso_id: recurso })
      return resp(200, { ok: true, user_id: data.user.id }, h)
    }
    if (acao === 'desativar' || acao === 'reativar') {
      const alvo = String(corpo.user_id ?? '')
      if (!/^[0-9a-f-]{36}$/.test(alvo)) return resp(400, { erro: 'Usuário inválido.' }, h)
      if (alvo === u.user.id) return resp(400, { erro: 'Você não pode desativar a si mesmo.' }, h)
      const ativo = acao === 'reativar'
      // atualiza o perfil com a identidade do Master (passa pelas regras do banco, inclusive "último Master")
      const { error: ep } = await comoUsuario.from('profiles').update({ ativo }).eq('user_id', alvo)
      if (ep) return resp(400, { erro: ep.message }, h)
      const { error } = await admin.auth.admin.updateUserById(alvo, { ban_duration: ativo ? 'none' : '876000h' })
      if (error) return resp(400, { erro: error.message }, h)
      await registrar({ alvo, ativo })
      return resp(200, { ok: true }, h)
    }
    return resp(400, { erro: 'Ação desconhecida.' }, h)
  } catch (e) {
    return resp(500, { erro: 'Falha interna.', detalhe: String(e).slice(0, 200) }, h)
  }
})
