import type { DiaEspecial } from './calculo'
import { supabase, buscarTudo } from './supabase'
import { hojeISO, somaDias } from './formato'

export interface Tarefa {
  tpe_id: number; codigo: string; os: number; cliente: string | null; cidade: string | null; uf: string | null
  principal: string; grupo: string; descricao: string; instrucoes: string | null; status: string
  sequencia: number | null; prazo: string | null; data_inicio: string | null; horas_apontadas: number; ultimo_apontamento: string | null
  /** só com a migração 0007 */
  predecessora_codigo?: string | null; predecessora_liberada?: boolean | null
}

export async function minhasTarefas(): Promise<Tarefa[]> {
  const { data, error } = await supabase.rpc('minhas_tarefas')
  if (error) throw error
  return (data ?? []) as Tarefa[]
}

export type SituacaoPrazo = 'ATRASADA' | 'VENCE EM BREVE' | 'NO PRAZO' | null
/** Situação do prazo definido pelo Master (não é percentual de conclusão). */
export function situacaoPrazo(prazo: string | null, status: string, diasAlerta = 3): SituacaoPrazo {
  if (!prazo || status === 'FINALIZADA') return null
  const hoje = hojeISO()
  if (prazo < hoje) return 'ATRASADA'
  if (prazo <= somaDias(hoje, diasAlerta)) return 'VENCE EM BREVE'
  return 'NO PRAZO'
}

export async function carregarBaseMaster() {
  const [aps, tpes, os, recursos, params, feriados] = await Promise.all([
    buscarTudo<any>('v_apontamentos', '*'),
    buscarTudo<any>('v_tpes', '*'),
    buscarTudo<any>('ordens_servico', '*'),
    buscarTudo<any>('recursos', '*', (q) => q.order('id')),
    supabase.rpc('parametros_vigentes', { p_dia: hojeISO() }),
    buscarTudo<any>('feriados', '*'),
  ])
  const num = (x: any) => (x == null ? null : Number(x))
  return {
    aps: aps.map((a) => ({ ...a, horas_normais: Number(a.horas_normais), horas_extras: Number(a.horas_extras), horas_totais: Number(a.horas_totais),
      custo_normal: num(a.custo_normal), custo_he: num(a.custo_he), custo_total: num(a.custo_total), custo_hh: num(a.custo_hh) })),
    tpes: tpes.map((t) => ({ ...t, horas_totais: Number(t.horas_totais), horas_extras: Number(t.horas_extras), horas_normais: Number(t.horas_normais), custo_total: num(t.custo_total) })),
    os, recursos, parametros: params.data as any, ...lerDiasEspeciais(feriados), feriadosLista: feriados,
  }
}

export function paraParametros(p: any) {
  const minutos = (iv: string) => { const m = String(iv).match(/(\d+):(\d+)/); const h = String(iv).match(/(\d+)\s*hours?/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : h ? Number(h[1]) * 60 : 600 }
  return {
    inicio_antecipado: String(p?.inicio_antecipado ?? '07:00').slice(0, 5), jornada_seg_qui_min: minutos(p?.jornada_seg_qui ?? '10:00:00'),
    jornada_sex_min: minutos(p?.jornada_sex ?? '09:00:00'), almoco_inicio: String(p?.almoco_inicio ?? '12:00').slice(0, 5),
    almoco_fim: String(p?.almoco_fim ?? '13:00').slice(0, 5), adic_dia_util: Number(p?.adic_dia_util ?? 0.6), adic_sabado: Number(p?.adic_sabado ?? 0.75),
    adic_dom_feriado: Number(p?.adic_dom_feriado ?? 1), descontar_feriados_capacidade: Boolean(p?.descontar_feriados_capacidade),
    os_interna_limite: Number(p?.os_interna_limite ?? 1000),
  }
}

/** TPE esperando a predecessora ser iniciada (o projetista ainda não pode apontar nela). */
export const aguardandoPredecessora = (t: Pick<Tarefa, 'predecessora_codigo' | 'predecessora_liberada'>) => !!t.predecessora_codigo && t.predecessora_liberada === false

/**
 * Feriados e dias atípicos (Parâmetros). `feriados` = dias sem expediente (feriado e dia útil não
 * trabalhado), usados na agenda e na capacidade; `especiais` = regra de cálculo de cada data.
 * Sem a migração 0008 todos os registros são feriados.
 */
export function lerDiasEspeciais(linhas: any[]): { feriados: Set<string>; especiais: Map<string, DiaEspecial> } {
  const especiais = new Map<string, DiaEspecial>()
  const feriados = new Set<string>()
  for (const l of linhas) {
    const d = String(l.data).slice(0, 10)
    const tipo = (l.tipo ?? 'FERIADO') as DiaEspecial['tipo']
    especiais.set(d, { tipo, adicional: l.adicional_he == null ? null : Number(l.adicional_he), descricao: l.descricao })
    if (tipo === 'FERIADO' || tipo === 'NAO_TRABALHADO') feriados.add(d)
  }
  return { feriados, especiais }
}

/** Cronograma da equipe sem custos (funções da migração 0008), para projetistas e Supervisor. */
export async function carregarEquipe() {
  const [tpes, recursos, dias] = await Promise.all([
    supabase.rpc('cronograma_equipe'),
    supabase.from('recursos').select('*').order('id'),
    supabase.from('feriados').select('*'),
  ])
  if (tpes.error) throw tpes.error
  if (recursos.error) throw recursos.error
  const lidos = lerDiasEspeciais(dias.data ?? [])
  return {
    tpes: (tpes.data ?? []).map((t: any) => ({ ...t, horas_totais: Number(t.horas_totais), qtd_apontamentos: Number(t.qtd_apontamentos) })),
    recursos: recursos.data ?? [], dias: dias.data ?? [], ...lidos,
  }
}
export async function calendarioEquipe(ini: string, fim: string) {
  const { data, error } = await supabase.rpc('calendario_equipe', { p_ini: ini, p_fim: fim })
  if (error) throw error
  return (data ?? []) as any[]
}
/** Mensagem amigável quando a migração ainda não foi aplicada. */
export const faltaMigracao = (e: unknown) => /cronograma_equipe|calendario_equipe|schema cache|Could not find the function/i.test(String((e as any)?.message ?? e))
