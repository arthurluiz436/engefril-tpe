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

export interface TarefaAgenda {
  id: number; codigo: string; data_inicio: string | null; prazo: string | null; predecessora_id?: number | null
  status?: string | null; primeiro_apontamento?: string | null
}
export interface Reprogramada {
  id: number; codigo: string; de: [string | null, string | null]; para: [string | null, string | null]; dias: number | null; mudou: boolean
  /** em andamento: as datas planejadas não mudam (são a linha de base); só o fim efetivo empurra a fila */
  iniciada?: boolean
  /** fim previsto de fato (iniciada: início real + duração, ou hoje se já passou do prazo) */
  fimEfetivo?: string | null
  /** desvio do fim em dias úteis em relação ao prazo salvo: + atraso/postergação, − antecipação */
  desvio?: number
  /** início definido à mão nesta edição */
  manual?: boolean
}

/** Diferença com sinal, em dias úteis, entre o prazo salvo e o novo fim (+ depois, − antes). */
export function desvioDiasUteis(prazo: string, novoFim: string, feriados?: Set<string>): number {
  if (novoFim === prazo) return 0
  return novoFim > prazo ? diasUteisEntre(somaDiasCorridos(prazo, 1), novoFim, feriados) : -diasUteisEntre(somaDiasCorridos(novoFim, 1), prazo, feriados)
}
const comecou = (t: TarefaAgenda) => !!t.primeiro_apontamento || t.status === 'EM ANDAMENTO' || t.status === 'PAUSADA'

/**
 * Reprograma a fila de um projetista na ordem dada, como num cronograma com vínculos término→início:
 * - cada tarefa mantém a sua duração (dias úteis entre início e prazo salvos);
 * - cada tarefa começa no dia útil seguinte ao fim da anterior e nunca antes do início da predecessora;
 * - tarefas sem início ou sem prazo não têm duração conhecida: ficam como estão e não empurram a fila.
 *
 * Com `hoje` (atualização pelo andamento real, como a "data de status" do MS Project):
 * - tarefa JÁ INICIADA não tem as datas alteradas (o prazo é a linha de base e o atraso continua visível),
 *   mas o fim efetivo dela é o início real + duração; se isso já passou e ela não terminou, o fim efetivo é hoje.
 *   É esse fim que empurra (atraso) ou puxa (antecipação) as tarefas seguintes;
 * - tarefa NÃO INICIADA nunca é programada para antes de hoje.
 *
 * Com `opcoes.ordemSalva`, duas TPEs que continuam vizinhas mantêm o intervalo salvo entre elas (folga, ou
 * passagem no mesmo dia), como um vínculo término→início com defasagem. Com `opcoes.inicios`, a TPE começa
 * na data informada à mão e as seguintes se recalculam a partir dela.
 */
export interface OpcoesFila {
  /** ordem salva da fila (ids): entre duas TPEs que continuam vizinhas, o intervalo (folga ou passagem) salvo é mantido */
  ordemSalva?: number[]
  /** início definido à mão (id → data): a TPE começa nessa data e as seguintes se ajustam a partir dela */
  inicios?: Map<number, string>
  /** dias de férias/ausência do projetista (já incluídos em `feriados`): usados para preservar a duração de TPEs
   *  planejadas antes do cadastro das férias */
  ferias?: Set<string>
}

/** Anda `n` dias úteis a partir de `d` (n = 0: o próprio dia, ou o próximo útil; n < 0: para trás). */
export function moverDiasUteis(d: string, n: number, feriados?: Set<string>): string {
  let x = proximoDiaUtil(d, feriados)
  for (let k = 0; k < n && k < 2000; k++) x = proximoDiaUtil(somaDiasCorridos(x, 1), feriados)
  for (let k = 0; k < -n && k < 2000; k++) { x = somaDiasCorridos(x, -1); for (let i = 0; i < 400 && !ehDiaUtil(x, feriados); i++) x = somaDiasCorridos(x, -1) }
  return x
}

/**
 * Duração (dias úteis de trabalho) de uma TPE já planejada. Normalmente desconta fins de semana, feriados e férias.
 * Exceção: se a TPE começa ou termina num dia de férias, ela foi planejada antes de as férias serem cadastradas —
 * aí os dias de férias do período contaram como trabalho no planejamento e a duração definida é mantida
 * (só fins de semana e feriados são descontados). Ao reprogramar, ela é colocada pulando as férias.
 */
export function duracaoTarefa(di: string, pz: string, feriados: Set<string>, ferias?: Set<string>): number {
  const normal = Math.max(1, diasUteisEntre(di, pz, feriados))
  if (!ferias?.size || !(ferias.has(di) || ferias.has(pz))) return normal
  const semFerias = new Set([...feriados].filter((d) => !ferias.has(d)))
  return Math.max(1, diasUteisEntre(di, pz, semFerias))
}

export function reprogramarFila(fila: TarefaAgenda[], feriados: Set<string>, outras: Map<number, TarefaAgenda> = new Map(), hoje?: string, opcoes: OpcoesFila = {}): Reprogramada[] {
  const fixa = (t: TarefaAgenda): Reprogramada => ({ id: t.id, codigo: t.codigo, de: [t.data_inicio, t.prazo], para: [t.data_inicio, t.prazo], dias: null, mudou: false })
  const comDatas = fila.filter((t) => t.data_inicio && t.prazo)
  if (!comDatas.length) return fila.map(fixa)
  const hojeUtil = hoje ? proximoDiaUtil(hoje, feriados) : null
  const porId = new Map(fila.map((t) => [t.id, t]))
  // vizinha anterior (com datas) na ordem SALVA: base para manter o intervalo entre as duas
  const anteriorSalva = new Map<number, TarefaAgenda>()
  if (opcoes.ordemSalva) {
    let ant: TarefaAgenda | null = null
    for (const id of opcoes.ordemSalva) { const t = porId.get(id); if (!t?.data_inicio || !t.prazo) continue; if (ant) anteriorSalva.set(t.id, ant); ant = t }
  }
  let fimAnterior: string | null = null
  let anterior: TarefaAgenda | null = null
  const novoInicio = new Map<number, string>()
  const primeiroInicio = proximoDiaUtil(comDatas.map((t) => t.data_inicio!.slice(0, 10)).sort()[0], feriados)
  // Só as TPEs iniciadas que estão no COMEÇO da fila ficam presas às datas reais. Uma TPE com apontamento
  // antigo colocada depois de uma não iniciada segue a ordem da fila (escada), como o Supervisor definiu.
  let soIniciadasAteAqui = true
  return fila.map((t) => {
    if (!t.data_inicio || !t.prazo) return fixa(t)
    const di = t.data_inicio.slice(0, 10), pz = t.prazo.slice(0, 10)
    const dias = duracaoTarefa(di, pz, feriados, opcoes.ferias)
    if (!(hoje && comecou(t))) soIniciadasAteAqui = false
    if (hoje && comecou(t) && soIniciadasAteAqui) {
      const real = (t.primeiro_apontamento ? String(t.primeiro_apontamento).slice(0, 10) : di)
      let fimEf = fimPorDiasUteis(real, dias, feriados)
      if (fimEf < hoje) fimEf = hojeUtil!
      novoInicio.set(t.id, real)
      fimAnterior = fimEf; anterior = t
      return { id: t.id, codigo: t.codigo, de: [di, pz], para: [di, pz], dias, mudou: false, iniciada: true, fimEfetivo: fimEf, desvio: desvioDiasUteis(pz, fimEf, feriados) }
    }
    const manual = opcoes.inicios?.get(t.id)
    let ini: string
    if (manual) ini = proximoDiaUtil(manual, feriados)
    else {
      if (!fimAnterior) ini = primeiroInicio
      else {
        // intervalo salvo entre as duas (1 = dia útil seguinte; 0 = começa no dia em que a anterior termina; 2+ = folga)
        const viz = anterior && anteriorSalva.get(t.id) === anterior ? anterior : null
        // folga salva (>1) é mantida; sobreposição ou passagem no mesmo dia (≤0) vira escada: dia útil seguinte
        const lag = viz ? Math.max(1, desvioDiasUteis(viz.prazo!.slice(0, 10), di, feriados)) : 1
        ini = moverDiasUteis(fimAnterior, lag, feriados)
      }
      if (hojeUtil && ini < hojeUtil) ini = hojeUtil
    }
    if (t.predecessora_id) {
      const p = novoInicio.get(t.predecessora_id) ?? outras.get(t.predecessora_id)?.data_inicio?.slice(0, 10)
      if (p && p > ini) ini = proximoDiaUtil(p, feriados)
    }
    const fim = fimPorDiasUteis(ini, dias, feriados)
    novoInicio.set(t.id, ini)
    fimAnterior = fim; anterior = t
    const mudou = ini !== di || fim !== pz
    return { id: t.id, codigo: t.codigo, de: [di, pz], para: [ini, fim], dias, mudou, fimEfetivo: fim, desvio: desvioDiasUteis(pz, fim, feriados), ...(manual ? { manual: true } : {}) }
  })
}

/**
 * Prazo sugerido para uma nova TPE: média de HORAS por TPE do mesmo principal+grupo (ou do principal),
 * a mesma regra do indicador "Méd./TPE" — as revisões (.1, .2…) somam na TPE original e contam uma vez —,
 * convertida em dias úteis pelas horas de trabalho de um dia (ex.: 119,5 h ÷ 8,8 h/dia ≈ 14 dias úteis).
 */
export function prazoMedioGrupo(tpes: any[], principal: string, grupo: string, horasPorDia: number):
  { dias: number; horas: number; n: number; base: 'grupo' | 'principal' } | null {
  const raiz = (c: string) => String(c).replace(/\.\d+$/, '')
  const media = (ts: any[]) => {
    const porTarefa = new Map<string, number>()
    for (const t of ts) porTarefa.set(raiz(t.codigo), (porTarefa.get(raiz(t.codigo)) ?? 0) + Number(t.horas_totais ?? 0))
    const hs = [...porTarefa.values()].filter((h) => h > 0)
    return hs.length ? { horas: hs.reduce((a, b) => a + b, 0) / hs.length, n: hs.length } : null
  }
  const hd = horasPorDia > 0 ? horasPorDia : 8.8
  const g = media(tpes.filter((t) => t.principal === principal && t.grupo === grupo))
  if (g) return { ...g, dias: Math.max(1, Math.ceil(g.horas / hd - 1e-9)), base: 'grupo' }
  const p = media(tpes.filter((t) => t.principal === principal))
  if (p) return { ...p, dias: Math.max(1, Math.ceil(p.horas / hd - 1e-9)), base: 'principal' }
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

// ---------------------------------------------------------------- férias e ausências
export interface Ausencia { id?: number; recurso_id: number; inicio: string; fim: string; tipo?: string; observacao?: string | null }
export const ROTULO_AUSENCIA: Record<string, string> = { FERIAS: 'Férias', LICENCA: 'Licença', OUTRO: 'Ausência' }

/** Dias (inclusive) de férias/ausência de um projetista. */
export function diasDeAusencia(aus: Ausencia[] = [], recursoId?: number | string | null): Set<string> {
  const s = new Set<string>()
  if (recursoId == null || recursoId === '') return s
  for (const a of aus) {
    if (String(a.recurso_id) !== String(recursoId)) continue
    for (let d = String(a.inicio).slice(0, 10), k = 0; d <= String(a.fim).slice(0, 10) && k < 400; d = somaDiasCorridos(d, 1), k++) s.add(d)
  }
  return s
}
/** Feriados/dias sem expediente + férias do projetista: dias que não contam na duração das TPEs dele. */
export function indisponiveis(feriados: Set<string>, aus: Ausencia[] = [], recursoId?: number | string | null): Set<string> {
  const f = diasDeAusencia(aus, recursoId)
  if (!f.size) return feriados
  for (const d of feriados) f.add(d)
  return f
}
/** Quantos dias úteis de férias caem dentro de um período. */
export function diasDeFeriasNoPeriodo(ini: string, fim: string, feriados: Set<string>, aus: Ausencia[] = [], recursoId?: number | string | null): number {
  const f = diasDeAusencia(aus, recursoId)
  let n = 0
  for (const d of f) if (d >= ini && d <= fim && ehDiaUtil(d, feriados)) n++
  return n
}

// ---------------------------------------------------------------- carga diária e sobrecarga
/**
 * Tarefas em aberto que ocupam a pessoa em cada dia útil, pelo período planejado (início → prazo);
 * tarefa atrasada continua ocupando do prazo até hoje.
 * Sobrecarga: soma de "pesos" > 1 no dia — 1 no meio da tarefa e 0,5 no dia de início ou do prazo.
 * Assim, uma tarefa que termina e outra que começa no mesmo dia (passagem) não contam como sobrecarga.
 */
export function cargaDiaria<T extends { data_inicio?: string | null; prazo?: string | null }>(
  tarefas: T[], naoUteis: Set<string>, hoje: string, desde?: string,
): { carga: Map<string, T[]>; sobre: Set<string> } {
  const carga = new Map<string, T[]>(), peso = new Map<string, number>()
  for (const t of tarefas) {
    const a = t.data_inicio ? String(t.data_inicio).slice(0, 10) : null
    const p = t.prazo ? String(t.prazo).slice(0, 10) : null
    const b = p && p < hoje ? hoje : p
    if (!a || !b || b < a) continue
    for (let x = desde && a < desde ? desde : a, k = 0; x <= b && k < 400; x = somaDiasCorridos(x, 1), k++) {
      if (!ehDiaUtil(x, naoUteis)) continue
      carga.set(x, [...(carga.get(x) ?? []), t])
      peso.set(x, (peso.get(x) ?? 0) + (a === b ? 1 : x === a || x === b ? 0.5 : 1))
    }
  }
  return { carga, sobre: new Set([...peso].filter(([, w]) => w > 1.001).map(([x]) => x)) }
}
