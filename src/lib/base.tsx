import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { carregarBaseMaster } from './dados'
import { mensagemErro } from './supabase'

type Base = Awaited<ReturnType<typeof carregarBaseMaster>>
interface Ctx { base: Base | null; erro: string | null; carregando: boolean; recarregar: () => Promise<void>; atualizadoEm: Date | null }
const BaseCtx = createContext<Ctx>({ base: null, erro: null, carregando: false, recarregar: async () => {}, atualizadoEm: null })

/** Base consolidada do Master (lida via RLS), compartilhada entre as telas e recarregável. */
export function BaseProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Base | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [atualizadoEm, setAt] = useState<Date | null>(null)
  const recarregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try { setBase(await carregarBaseMaster()); setAt(new Date()) } catch (e) { setErro(mensagemErro(e)) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  return <BaseCtx.Provider value={{ base, erro, carregando, recarregar, atualizadoEm: atualizadoEm }}>{children}</BaseCtx.Provider>
}
export const useBase = () => useContext(BaseCtx)
