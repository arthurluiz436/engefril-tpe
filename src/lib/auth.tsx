import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Perfil {
  user_id: string
  nome: string
  email: string | null
  papel: 'projetista' | 'master' | 'observador'
  recurso_id: number | null
  ativo: boolean
  recurso_nome?: string | null
}

interface Ctx {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  /** Observador: só consulta (botões de edição ficam ocultos; o banco também bloqueia) */
  somenteLeitura: boolean
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const AuthCtx = createContext<Ctx>({ sessao: null, perfil: null, carregando: true, somenteLeitura: false, recarregar: async () => {}, sair: async () => {} })

/**
 * Links de convite enviados pelo Supabase (painel ou inviteUserByEmail) trazem a sessão no fragmento
 * (#access_token=...&type=invite). O cliente usa fluxo PKCE e não lê esse formato, e o HashRouter
 * também usa o fragmento — então a sessão é extraída aqui e o usuário vai para a tela de criar senha.
 */
async function sessaoDoLink() {
  const h = window.location.hash
  const i = h.search(/(access_token|error_description)=/)
  if (i < 0) return
  const p = new URLSearchParams(h.slice(i))
  const limpar = (rota: string) => {
    history.replaceState(null, '', window.location.pathname + window.location.search + '#' + rota)
    window.dispatchEvent(new PopStateEvent('popstate')) // avisa o HashRouter da nova rota
  }
  if (p.get('error_description')) {
    limpar('/')
    alert('Link inválido ou expirado: ' + p.get('error_description') + '. Peça um novo convite ou use "Esqueci minha senha".')
    return
  }
  const access_token = p.get('access_token'), refresh_token = p.get('refresh_token')
  if (!access_token || !refresh_token) { limpar('/'); return }
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  const tipo = p.get('type')
  limpar(!error && (tipo === 'invite' || tipo === 'recovery' || tipo === 'signup') ? '/definir-senha' : '/')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(s: Session | null) {
    if (!s) { setPerfil(null); return }
    const { data } = await supabase.from('profiles').select('user_id, nome, email, papel, recurso_id, ativo, recursos(nome)').eq('user_id', s.user.id).maybeSingle()
    if (data) setPerfil({ ...(data as any), recurso_nome: (data as any).recursos?.nome ?? null })
    else setPerfil(null)
  }

  useEffect(() => {
    sessaoDoLink().then(() => supabase.auth.getSession()).then(async ({ data }) => {
      setSessao(data.session); await carregarPerfil(data.session); setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s)
      // evita chamadas ao banco dentro do callback (recomendação do supabase-js)
      setTimeout(() => carregarPerfil(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{
      sessao, perfil, carregando, somenteLeitura: perfil?.papel === 'observador',
      recarregar: () => carregarPerfil(sessao),
      sair: async () => { await supabase.auth.signOut(); setPerfil(null) },
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
