// Motor de cálculo — reprodução testada das regras da planilha VER_035.
// Mesma regra implementada em SQL (view public.v_apontamentos). Os testes comparam
// as duas implementações com os valores gravados no Excel original.

export interface Parametros {
  inicio_antecipado: string       // '07:00'  (coluna Z: se algum lançamento do dia começa até aqui, a jornada começa aqui)
  jornada_seg_qui_min: number     // 600 = 10 h com almoço (07–17)
  jornada_sex_min: number         // 540 = 9 h com almoço (07–16)
  almoco_inicio: string           // '12:00'
  almoco_fim: string              // '13:00'
  adic_dia_util: number           // 0,60
  adic_sabado: number             // 0,75
  adic_dom_feriado: number        // 1,00
  descontar_feriados_capacidade: boolean
  os_interna_limite: number       // O.S. < 1000 = interna
  /** dias atípicos cadastrados em Parâmetros (feriado, não trabalhado, dia normal, % próprio) */
  dias_especiais?: Map<string, DiaEspecial>
}

export const PARAMETROS_VER035: Parametros = {
  inicio_antecipado: '07:00', jornada_seg_qui_min: 600, jornada_sex_min: 540, almoco_inicio: '12:00', almoco_fim: '13:00',
  adic_dia_util: 0.6, adic_sabado: 0.75, adic_dom_feriado: 1, descontar_feriados_capacidade: false, os_interna_limite: 1000,
}

export type TipoDia = 'DIA ÚTIL' | 'SÁBADO' | 'DOMINGO' | 'FERIADO' | 'NÃO TRABALHADO'
export type TipoEspecial = 'FERIADO' | 'NAO_TRABALHADO' | 'DIA_NORMAL' | 'PERCENTUAL'
export interface DiaEspecial { tipo: TipoEspecial; adicional: number | null; descricao?: string }

export function min(h: string): number {
  const [a, b] = h.split(':').map(Number)
  return a * 60 + b
}
export function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
}
/** Dia da semana ISO (1 = segunda … 7 = domingo) de 'AAAA-MM-DD', sem fuso. */
export function isoDow(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number)
  const w = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

export function tipoDia(dia: string, feriados: Set<string>, especiais?: Map<string, DiaEspecial>): TipoDia {
  const e = especiais?.get(dia)
  if (e?.tipo === 'FERIADO') return 'FERIADO'
  if (e?.tipo === 'NAO_TRABALHADO') return 'NÃO TRABALHADO'
  if (e?.tipo === 'DIA_NORMAL') return 'DIA ÚTIL'
  if (feriados.has(dia)) return 'FERIADO'
  const w = isoDow(dia)
  return w === 7 ? 'DOMINGO' : w === 6 ? 'SÁBADO' : 'DIA ÚTIL'
}

export interface EntradaApontamento { dia: string; hora_inicio: string; hora_fim: string }
export interface ResultadoApontamento {
  tipo_dia: TipoDia; inicio_jornada: string; fim_jornada: string; adicional: number
  horas_normais: number; horas_extras: number; horas_totais: number
  custo_normal: number | null; custo_he: number | null; custo_total: number | null
}

/**
 * Calcula um lançamento.
 * @param iniciosDoDia horários de início (HH:MM) de TODOS os lançamentos do mesmo recurso no mesmo dia (incluindo este)
 * @param inicioDeclarado jornada informada pelo projetista com horário flexível naquele dia (ex.: '08:00').
 *        Quando existe, prevalece sobre a regra automática do início antecipado.
 */
export function calcularApontamento(a: EntradaApontamento, p: Parametros, feriados: Set<string>, inicioPadrao: string,
                                    iniciosDoDia: string[], custoHH: number | null, inicioDeclarado?: string | null): ResultadoApontamento {
  const tipo = tipoDia(a.dia, feriados, p.dias_especiais)
  const especial = p.dias_especiais?.get(a.dia)
  const q = min(a.hora_inicio), r = min(a.hora_fim)
  const ant = min(p.inicio_antecipado)
  const z = inicioDeclarado ? min(inicioDeclarado.slice(0, 5)) : iniciosDoDia.some((h) => min(h) <= ant) ? ant : min(inicioPadrao)
  const aa = z + (isoDow(a.dia) <= 4 ? p.jornada_seg_qui_min : p.jornada_sex_min)
  const ai = min(p.almoco_inicio), af = min(p.almoco_fim)
  const pos = (x: number) => Math.max(0, x)
  // coluna T (hora normal)
  const normal = tipo !== 'DIA ÚTIL' ? 0
    : Math.round(pos(Math.min(r, aa) - Math.max(q, z)) - pos(Math.min(r, aa, af) - Math.max(q, z, ai)))
  // coluna S (hora extra) = líquido do lançamento (descontado almoço cruzado) − normal
  const liquido = Math.round(r - q - pos(Math.min(r, af) - Math.max(q, ai)))
  const extra = pos(liquido - normal)
  const adicional = (especial?.tipo === 'NAO_TRABALHADO' || especial?.tipo === 'PERCENTUAL') && especial.adicional != null ? especial.adicional
    : tipo === 'FERIADO' || tipo === 'DOMINGO' ? p.adic_dom_feriado : tipo === 'SÁBADO' ? p.adic_sabado : p.adic_dia_util
  const hn = normal / 60, he = extra / 60
  const cn = custoHH == null ? null : hn * custoHH
  const ce = custoHH == null ? null : he * custoHH * (1 + adicional)
  return {
    tipo_dia: tipo, inicio_jornada: hhmm(z), fim_jornada: hhmm(aa), adicional,
    horas_normais: hn, horas_extras: he, horas_totais: hn + he,
    custo_normal: cn, custo_he: ce, custo_total: cn == null || ce == null ? null : cn + ce,
  }
}

// ------------------------------------------------------------------ capacidade (KPI item 4/5)
function addDias(d: string, n: number): string {
  const [a, m, dd] = d.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, dd + n))
  return x.toISOString().slice(0, 10)
}
/** Horas de trabalho de um dia útil médio (seg–qui 9 h, sex 8 h, sem almoço → 8,8 h). */
export function horasPorDiaUtil(p: Parametros): number {
  const almoco = (min(p.almoco_fim) - min(p.almoco_inicio)) / 60
  return ((p.jornada_seg_qui_min / 60 - almoco) * 4 + (p.jornada_sex_min / 60 - almoco)) / 5
}
/** Horas disponíveis de UMA pessoa entre duas datas: dias úteis × 9 h (seg–qui) / 8 h (sex). */
/** `ausente`: dias de férias/ausência da pessoa — nunca contam como capacidade (mesmo que o período cruze meses). */
export function capacidade(ini: string, fim: string, p: Parametros, feriados: Set<string>, ausente?: Set<string>): number {
  if (fim < ini) return 0
  const almoco = (min(p.almoco_fim) - min(p.almoco_inicio)) / 60
  const hsq = p.jornada_seg_qui_min / 60 - almoco
  const hsex = p.jornada_sex_min / 60 - almoco
  let total = 0
  for (let d = ini; d <= fim; d = addDias(d, 1)) {
    const w = isoDow(d)
    if (w >= 6) continue
    if (p.descontar_feriados_capacidade && feriados.has(d)) continue
    if (ausente?.has(d)) continue
    total += w === 5 ? hsex : hsq
  }
  return total
}

// ------------------------------------------------------------------ indicadores
export interface LinhaAp {
  tpe_codigo: string; os: number; principal: string; grupo: string; recurso_nome: string; dia: string; tipo_dia: string
  horas_normais: number; horas_extras: number; horas_totais: number
  custo_normal: number | null; custo_he: number | null; custo_total: number | null
}
export interface LinhaTPE {
  codigo: string; os: number; principal: string; grupo: string; status: string
  data_inicio: string | null; data_fim: string | null; revisao: number
}
export interface LinhaOS { os: number; nome: string; nivel: string | null; vendedor: string | null; classificacao: string | null }

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const media = (xs: number[]) => (xs.length ? soma(xs) / xs.length : 0)
const div = (a: number, b: number) => (b ? a / b : 0)
function mediana(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const diasCorridos = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000 + 1

/** 'TPE-002.1' → 'TPE-002': as revisões somam na TPE original. */
export const tpeBase = (codigo: string) => codigo.replace(/\.\d+$/, '')

export interface OpcoesIndicadores {
  /**
   * true (padrão do sistema): as horas das revisões (.1, .2…) somam na TPE original e as médias
   * "por TPE" contam a tarefa uma vez só (2 h na .0 + 1 h na .1 = 1 TPE de 3 h).
   * false: regra original da VER_035 (cada revisão é uma TPE), usada na reconciliação com a planilha.
   */
  agruparRevisoes?: boolean
  /** dias de férias/ausência de cada projetista (por nome): descontados da capacidade dele */
  ferias?: Map<string, Set<string>>
}

export function indicadores(aps: LinhaAp[], tpes: LinhaTPE[], oss: LinhaOS[], recursos: string[], p: Parametros, feriados: Set<string>,
                            opcoes: OpcoesIndicadores = {}) {
  const agrupar = opcoes.agruparRevisoes ?? true
  const chave = (codigo: string) => (agrupar ? tpeBase(codigo) : codigo)
  const osMap = new Map(oss.map((o) => [o.os, o]))
  const porTpe = new Map<string, { h: number; he: number; custo: number }>()
  for (const a of aps) {
    const k = chave(a.tpe_codigo)
    const x = porTpe.get(k) ?? { h: 0, he: 0, custo: 0 }
    x.h += a.horas_totais; x.he += a.horas_extras; x.custo += a.custo_total ?? 0
    porTpe.set(k, x)
  }
  /** horas de cada tarefa distinta (TPE original + revisões, quando agrupado) dentro do conjunto */
  const horasPorTarefa = (ts: LinhaTPE[]) => [...new Set(ts.map((t) => chave(t.codigo)))].map((k) => porTpe.get(k)?.h ?? 0)
  const qtdTarefas = (ts: LinhaTPE[]) => new Set(ts.map((t) => chave(t.codigo))).size
  /** a TPE (com as revisões) só conta como finalizada se nenhuma revisão dela estiver aberta */
  const qtdFinalizadas = (ts: LinhaTPE[]) => {
    const aberta = new Map<string, boolean>()
    for (const t of ts) aberta.set(chave(t.codigo), (aberta.get(chave(t.codigo)) ?? false) || t.status !== 'FINALIZADA')
    return [...aberta.values()].filter((x) => !x).length
  }
  // horas do próprio registro (sem somar revisões): usadas em totais, que não podem contar duas vezes
  const hReg = new Map<string, number>(), heReg = new Map<string, number>()
  for (const a of aps) {
    hReg.set(a.tpe_codigo, (hReg.get(a.tpe_codigo) ?? 0) + a.horas_totais)
    heReg.set(a.tpe_codigo, (heReg.get(a.tpe_codigo) ?? 0) + a.horas_extras)
  }
  const hR = (t: LinhaTPE) => hReg.get(t.codigo) ?? 0
  const heR = (t: LinhaTPE) => heReg.get(t.codigo) ?? 0
  const dias = aps.map((a) => a.dia).sort()
  const ini = dias[0] ?? null, fim = dias[dias.length - 1] ?? null
  const horas = soma(aps.map((a) => a.horas_totais)), hn = soma(aps.map((a) => a.horas_normais)), he = soma(aps.map((a) => a.horas_extras))
  const reab = tpes.filter((t) => t.revisao !== 0).length
  const osAtendidas = new Set(tpes.map((t) => t.os))
  const comHoras = horasPorTarefa(tpes).filter((h) => h > 0)
  const prazos = tpes.filter((t) => t.data_inicio && t.data_fim).map((t) => diasCorridos(t.data_inicio!, t.data_fim!))
  const ctot = soma(aps.map((a) => a.custo_total ?? 0))

  const resumo = {
    inicio: ini, fim, tpes: qtdTarefas(tpes), finalizados: qtdFinalizadas(tpes),
    abertos: qtdTarefas(tpes) - qtdFinalizadas(tpes), reaberturas: reab, indice_reabertura: div(reab, tpes.length - reab),
    os_atendidas: osAtendidas.size, horas, horas_normais: hn, horas_extras: he, pct_he: div(he, horas),
    tempo_medio_tpe: media(comHoras), tempo_medio_os: div(horas, osAtendidas.size), prazo_medio: media(prazos),
    os_clientes: [...osAtendidas].filter((o) => o >= p.os_interna_limite).length,
    os_internas: [...osAtendidas].filter((o) => o < p.os_interna_limite).length,
  }

  const agrupa = <K extends string | number>(chave: (t: LinhaTPE) => K) => {
    const m = new Map<K, LinhaTPE[]>()
    for (const t of tpes) { const k = chave(t); m.set(k, [...(m.get(k) ?? []), t]) }
    return m
  }
  const linhaDim = (k: string, ts: LinhaTPE[]) => {
    const h = soma(ts.map(hR)), hx = soma(ts.map(heR)), ht = horasPorTarefa(ts)
    const qOS = new Set(ts.map((t) => t.os)).size, rb = ts.filter((t) => t.revisao !== 0).length
    return { chave: k, os_atendidas: qOS, qtd_tpes: qtdTarefas(ts), finalizados: qtdFinalizadas(ts),
      horas: h, horas_extras: hx, tempo_medio_os: div(h, qOS), tempo_medio_tpe: media(ht.filter((x) => x > 0)),
      reaberturas: rb, indice_reabertura: div(rb, ts.length - rb), pct_horas: div(h, horas),
      prazo_medio: media(ts.filter((t) => t.data_inicio && t.data_fim).map((t) => diasCorridos(t.data_inicio!, t.data_fim!))),
      menor_tpe: Math.min(...ht.filter((x) => x > 0), Infinity), maior_tpe: Math.max(0, ...ht) }
  }
  const porPrincipal = [...agrupa((t) => t.principal)].map(([k, ts]) => linhaDim(k, ts))
  const porGrupo = [...agrupa((t) => `${t.principal} › ${t.grupo}`)].map(([k, ts]) => linhaDim(k, ts))
  const dimOS = (campo: 'vendedor' | 'nivel' | 'classificacao') =>
    [...agrupa((t) => (osMap.get(t.os)?.[campo] ?? '') || '(vazio)')].map(([k, ts]) => linhaDim(k, ts))

  const porRecurso = recursos.map((nome) => {
    const as = aps.filter((a) => a.recurso_nome === nome)
    const ds = as.map((a) => a.dia).sort()
    const d0 = ds[0] ?? null, d1 = ds[ds.length - 1] ?? null
    const fer = opcoes.ferias?.get(nome)
    const cap = d0 && d1 ? capacidade(d0, d1, p, feriados, fer) : 0
    const diasFerias = d0 && d1 && fer ? [...fer].filter((x) => x >= d0 && x <= d1 && isoDow(x) <= 5).length : 0
    const h = soma(as.map((a) => a.horas_totais)), x = soma(as.map((a) => a.horas_extras))
    const diasTrab = new Set(as.map((a) => a.dia)).size
    const tpesAt = new Set(as.map((a) => chave(a.tpe_codigo))).size
    return { recurso: nome, primeiro_dia: d0, ultimo_dia: d1, dias: diasTrab, capacidade: cap, horas_normais: h - x, horas_extras: x,
      horas: h, alocacao: div(h, cap), dias_ferias: diasFerias, pct_he: div(x, h), media_dia: div(h, diasTrab), tpes_atendidos: tpesAt, horas_por_tpe: div(h, tpesAt),
      custo: soma(as.map((a) => a.custo_total ?? 0)) }
  })

  const meses: { mes: string; capacidade: number; equipe: number; extras: number; custo: number; porRecurso: Record<string, { h: number; pct: number; custo: number; cap: number; ferias: number }> }[] = []
  if (ini && fim) {
    let m = ini.slice(0, 7) + '-01'
    while (m <= fim) {
      const [a, mm] = m.split('-').map(Number)
      const ultimo = new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10)
      const b0 = m < ini ? ini : m, b1 = ultimo > fim ? fim : ultimo
      const cap = capacidade(b0, b1, p, feriados)
      const as = aps.filter((x) => x.dia.slice(0, 7) === m.slice(0, 7))
      const pr: Record<string, { h: number; pct: number; custo: number; cap: number; ferias: number }> = {}
      for (const r of recursos) {
        const h = soma(as.filter((x) => x.recurso_nome === r).map((x) => x.horas_totais))
        // capacidade da pessoa no mês: sem os dias de férias dela (que podem começar num mês e terminar no outro)
        const fer = opcoes.ferias?.get(r)
        const capR = fer ? capacidade(b0, b1, p, feriados, fer) : cap
        const ferMes = fer ? [...fer].filter((x) => x >= b0 && x <= b1 && isoDow(x) <= 5).length : 0
        pr[r] = { h, pct: div(h, capR), cap: capR, ferias: ferMes, custo: soma(as.filter((x) => x.recurso_nome === r).map((x) => x.custo_total ?? 0)) }
      }
      meses.push({ mes: m, capacidade: cap, equipe: soma(as.map((x) => x.horas_totais)), extras: soma(as.map((x) => x.horas_extras)),
        custo: soma(as.map((x) => x.custo_total ?? 0)), porRecurso: pr })
      m = new Date(Date.UTC(a, mm, 1)).toISOString().slice(0, 10)
    }
  }

  const porOS = [...agrupa((t) => t.os)].map(([os, ts]) => {
    const as = aps.filter((a) => a.os === os)
    const ds = as.map((a) => a.dia).sort()
    const h = soma(ts.map(hR))
    return { os, cliente: osMap.get(os)?.nome ?? '', nivel: osMap.get(os)?.nivel ?? '', vendedor: osMap.get(os)?.vendedor ?? '',
      classificacao: osMap.get(os)?.classificacao ?? '', qtd_tpes: qtdTarefas(ts), horas: h,
      horas_extras: soma(ts.map(heR)), horas_por_tpe: div(h, qtdTarefas(ts)),
      primeiro: ds[0] ?? null, ultimo: ds[ds.length - 1] ?? null, pct_horas: div(h, horas), custo: soma(as.map((a) => a.custo_total ?? 0)) }
  }).sort((a, b) => b.horas - a.horas)

  const ce = soma(aps.map((a) => a.custo_he ?? 0))
  const custos = {
    total: ctot, normal: soma(aps.map((a) => a.custo_normal ?? 0)), extra: ce, pct_extra: div(ce, ctot),
    he_dia_util: soma(aps.filter((a) => a.tipo_dia === 'DIA ÚTIL').map((a) => a.custo_he ?? 0)),
    he_sabado: soma(aps.filter((a) => a.tipo_dia === 'SÁBADO').map((a) => a.custo_he ?? 0)),
    he_dom_feriado: soma(aps.filter((a) => a.tipo_dia === 'DOMINGO' || a.tipo_dia === 'FERIADO' || a.tipo_dia === 'NÃO TRABALHADO').map((a) => a.custo_he ?? 0)),
    por_hora: div(ctot, horas),
    por_tpe: div(ctot, [...porTpe.values()].filter((x) => x.custo > 0).length),
    por_os: div(ctot, osAtendidas.size),
  }
  return {
    resumo, porPrincipal, porGrupo, porRecurso, meses, porOS, custos,
    porVendedor: dimOS('vendedor'), porNivel: dimOS('nivel'), porClassificacao: dimOS('classificacao'),
    tempo_medio_por_os: media(porOS.filter((o) => o.horas > 0).map((o) => o.horas)), mediana_por_os: mediana(porOS.map((o) => o.horas)),
  }
}

/** Definição explícita de cada indicador exibido (exigência 12.1 do documento de requisitos). */
export const DEFINICOES: Record<string, { nome: string; numerador: string; denominador: string; unidade: string; populacao: string; vazio: string; origem: string }> = {
  horas: { nome: 'Horas apontadas', numerador: 'Σ (horas normais + horas extras) dos apontamentos', denominador: '—', unidade: 'h decimais', populacao: 'Apontamentos não excluídos no período', vazio: '0', origem: 'KPI!B13' },
  pct_he: { nome: '% em hora extra', numerador: 'Σ horas extras', denominador: 'Σ horas apontadas', unidade: '%', populacao: 'Idem', vazio: '0% se não houver horas', origem: 'KPI!B16' },
  indice_reabertura: { nome: 'Índice de reabertura', numerador: 'TPEs com revisão ≠ .0', denominador: 'TPEs originais (.0)', unidade: '%', populacao: 'Todas as TPEs', vazio: '0', origem: 'KPI!B11' },
  os_atendidas: { nome: 'O.S. atendidas', numerador: 'O.S. distintas com TPE (inclui internas < 1000)', denominador: '—', unidade: 'qtd', populacao: 'Todas as TPEs', vazio: '0', origem: 'KPI!B12' },
  tempo_medio_tpe: { nome: 'Tempo médio por TPE', numerador: 'Σ horas das TPEs com horas > 0 (as revisões .1, .2… somam na TPE original)', denominador: 'nº de TPEs originais com horas (cada TPE conta uma vez, com as revisões)', unidade: 'h', populacao: 'TPEs com apontamento', vazio: '0', origem: 'KPI!B17, ajustado: revisões somadas à TPE original' },
  alocacao: { nome: 'Índice de alocação', numerador: 'horas apontadas do recurso', denominador: 'capacidade = dias úteis entre o 1º e o último apontamento × 9 h (seg–qui) / 8 h (sex)', unidade: '%', populacao: 'Por recurso', vazio: '0', origem: 'KPI!I72' },
  custo_total: { nome: 'Custo de engenharia', numerador: 'Σ horas normais × custo H/H + horas extras × custo H/H × (1 + adicional)', denominador: '—', unidade: 'R$', populacao: 'Apontamentos', vazio: '0', origem: 'KPI!B156' },
  consumo_estimativa: { nome: 'Horas consumidas ÷ estimadas', numerador: 'horas apontadas na TPE', denominador: 'horas estimadas (média do grupo)', unidade: '%', populacao: 'Por TPE', vazio: '—', origem: 'novo (não é % de conclusão física)' },
}
