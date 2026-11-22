import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Perfil {
  user_id: string
  nome: string
  email: string | null
  papel: 'projetista' | 'master'
  recurso_id: number | null
  ativo: boolean
  recurso_nome?: string | null
}

interface Ctx {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const AuthCtx = createContext<Ctx>({ sessao: null, perfil: null, carregando: true, recarregar: async () => {}, sair: async () => {} })

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
    supabase.auth.getSession().then(async ({ data }) => {
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
      sessao, perfil, carregando,
      recarregar: () => carregarPerfil(sessao),
      sair: async () => { await supabase.auth.signOut(); setPerfil(null) },
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
