import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Somente a URL do projeto e a chave PÚBLICA (anon / publishable) ficam no navegador.
// A chave service_role NUNCA entra no front-end: operações privilegiadas passam por RLS,
// funções SQL protegidas ou pela Edge Function admin-usuarios.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && chave)

function papelDaChave(k: string): string {
  if (k.startsWith('sb_secret_')) return 'service_role'
  try { return JSON.parse(atob((k.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).role ?? '' } catch { return '' }
}
if (chave && papelDaChave(chave) === 'service_role') {
  // proteção contra configuração errada: recusa iniciar com chave de serviço
  throw new Error('Configuração insegura: a chave service_role não pode ser usada no navegador.')
}

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', chave ?? 'chave-ausente', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

/** Busca todas as linhas (paginação de 1000 em 1000, limite do PostgREST). */
export async function buscarTudo<T = Record<string, unknown>>(tabela: string, selecao = '*', filtro?: (q: any) => any, limite = 100000): Promise<T[]> {
  const tam = 1000
  const out: T[] = []
  for (let de = 0; de < limite; de += tam) {
    let q = supabase.from(tabela).select(selecao).range(de, de + tam - 1)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < tam) break
  }
  return out
}

/** Mensagem de erro compreensível para o usuário. */
export function mensagemErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.'
  if (/row-level security|permission denied|42501/i.test(m)) return 'Você não tem permissão para esta operação.'
  if (/apontamentos_chave_natural|duplicate key/i.test(m)) return 'Já existe um apontamento igual (mesma TPE, dia e horários).'
  if (/JWT expired|invalid JWT/i.test(m)) return 'Sua sessão expirou. Entre novamente.'
  return m
}
