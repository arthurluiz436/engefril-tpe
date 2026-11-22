import { supabase, buscarTudo } from './supabase'
import { hojeISO, somaDias } from './formato'

export interface Tarefa {
  tpe_id: number; codigo: string; os: number; cliente: string | null; cidade: string | null; uf: string | null
  principal: string; grupo: string; descricao: string; instrucoes: string | null; status: string
  sequencia: number | null; prazo: string | null; data_inicio: string | null; horas_apontadas: number; ultimo_apontamento: string | null
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
    os, recursos, parametros: params.data as any, feriados: new Set<string>(feriados.map((f) => f.data)),
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
