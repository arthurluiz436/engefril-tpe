// Calendário de trabalho: dias úteis (seg–sex, sem feriados), durações e reprogramação
// de tarefas em sequência. Datas sempre em 'AAAA-MM-DD', sem fuso.

const utc = (d: string) => { const [a, m, dd] = d.slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, dd) }
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const somaDiasCorridos = (d: string, n: number) => iso(utc(d) + n * 86400000)
/** 0 = domingo … 6 = sábado */
export const diaSemana = (d: string) => new Date(utc(d)).getUTCDay()

export function ehDiaUtil(d: string, feriados: Set<string> = new Set()): boolean {
  const w = diaSemana(d)
  return w !== 0 && w !== 6 && !feriados.has(d.slice(0, 10))
}
/** O próprio dia, se útil; senão o próximo dia útil. */
export function proximoDiaUtil(d: string, feriados?: Set<string>): string {
  let x = d.slice(0, 10)
  for (let i = 0; i < 400 && !ehDiaUtil(x, feriados); i++) x = somaDiasCorridos(x, 1)
  return x
}
/** Último dia de uma tarefa de `n` dias úteis que começa em `ini` (o início conta como 1º dia). */
export function fimPorDiasUteis(ini: string, n: number, feriados?: Set<string>): string {
  let d = proximoDiaUtil(ini, feriados)
  for (let k = 1; k < Math.max(1, Math.round(n)); k++) d = proximoDiaUtil(somaDiasCorridos(d, 1), feriados)
  return d
}
/** Dias úteis de `a` até `b`, contando os dois extremos (0 se b < a). */
export function diasUteisEntre(a: string, b: string, feriados?: Set<string>): number {
  if (b < a) return 0
  let n = 0
  for (let d = a.slice(0, 10); d <= b && n < 5000; d = somaDiasCorridos(d, 1)) if (ehDiaUtil(d, feriados)) n++
  return n
}

export interface TarefaAgenda { id: number; codigo: string; data_inicio: string | null; prazo: string | null; predecessora_id?: number | null }
export interface Reprogramada { id: number; codigo: string; de: [string | null, string | null]; para: [string | null, string | null]; dias: number | null; mudou: boolean }

/**
 * Reprograma uma fila de tarefas na ordem dada, mantendo a duração (dias úteis entre início e prazo) de cada uma.
 * A fila começa no início mais cedo entre as tarefas (o "lugar" da fila no calendário não muda).
 * Cada tarefa começa no dia útil seguinte ao fim da anterior e nunca antes do início da predecessora.
 * Tarefas sem início ou sem prazo não têm duração conhecida: ficam como estão e não empurram a fila.
 */
export function reprogramarFila(fila: TarefaAgenda[], feriados: Set<string>, outras: Map<number, TarefaAgenda> = new Map()): Reprogramada[] {
  const comDatas = fila.filter((t) => t.data_inicio && t.prazo)
  if (!comDatas.length) return fila.map((t) => ({ id: t.id, codigo: t.codigo, de: [t.data_inicio, t.prazo], para: [t.data_inicio, t.prazo], dias: null, mudou: false }))
  let cursor = proximoDiaUtil(comDatas.map((t) => t.data_inicio!.slice(0, 10)).sort()[0], feriados)
  const novoInicio = new Map<number, string>()
  return fila.map((t) => {
    if (!t.data_inicio || !t.prazo) return { id: t.id, codigo: t.codigo, de: [t.data_inicio, t.prazo], para: [t.data_inicio, t.prazo], dias: null, mudou: false }
    const dias = Math.max(1, diasUteisEntre(t.data_inicio.slice(0, 10), t.prazo.slice(0, 10), feriados))
    let ini = cursor
    if (t.predecessora_id) {
      const p = novoInicio.get(t.predecessora_id) ?? outras.get(t.predecessora_id)?.data_inicio?.slice(0, 10)
      if (p && p > ini) ini = proximoDiaUtil(p, feriados)
    }
    const fim = fimPorDiasUteis(ini, dias, feriados)
    novoInicio.set(t.id, ini)
    cursor = proximoDiaUtil(somaDiasCorridos(fim, 1), feriados)
    const mudou = ini !== t.data_inicio.slice(0, 10) || fim !== t.prazo.slice(0, 10)
    return { id: t.id, codigo: t.codigo, de: [t.data_inicio.slice(0, 10), t.prazo.slice(0, 10)], para: [ini, fim], dias, mudou }
  })
}

/** Média de dias úteis (início → finalização) das TPEs finalizadas do mesmo principal+grupo (ou do principal). */
export function prazoMedioGrupo(tpes: any[], principal: string, grupo: string, feriados?: Set<string>): { dias: number; n: number; base: 'grupo' | 'principal' } | null {
  const dur = (ts: any[]) => ts.filter((t) => t.status === 'FINALIZADA' && t.data_inicio && t.data_fim && t.data_fim >= t.data_inicio)
    .map((t) => Math.max(1, diasUteisEntre(String(t.data_inicio).slice(0, 10), String(t.data_fim).slice(0, 10), feriados)))
  const g = dur(tpes.filter((t) => t.principal === principal && t.grupo === grupo))
  if (g.length) return { dias: Math.round(g.reduce((a, b) => a + b, 0) / g.length), n: g.length, base: 'grupo' }
  const p = dur(tpes.filter((t) => t.principal === principal))
  if (p.length) return { dias: Math.round(p.reduce((a, b) => a + b, 0) / p.length), n: p.length, base: 'principal' }
  return null
}

/** Menor número de TPE livre (reaproveita o número de uma TPE apagada). */
export function proximoNumeroTpe(numeros: number[]): number {
  const usados = new Set(numeros)
  let n = 1
  while (usados.has(n)) n++
  return n
}

// ---------------------------------------------------------------- cores dos projetistas
export const PALETA = ['#1f6fd1', '#d9480f', '#2b8a3e', '#7048e8', '#c2255c', '#0c8599', '#e67700', '#5c7cfa']
export function corRecurso(r: { id: number; cor?: string | null } | undefined, i = 0): string {
  if (r?.cor && /^#[0-9a-f]{6}$/i.test(r.cor)) return r.cor
  return PALETA[((r ? Number(r.id) - 1 : i) % PALETA.length + PALETA.length) % PALETA.length]
}
/** Mistura a cor com branco (0 = cor pura, 1 = branco): fundos e barras de planejado. */
export function clarear(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const m = (c: number) => Math.round(c + (255 - c) * f)
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}
