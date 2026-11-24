// Indicadores gerenciais de UMA O.S., calculados só com os dados já registrados
// (O.S., TPEs e apontamentos). Nada é gravado e nada é estimado: sem metas, orçamentos ou custos fictícios.
// Hierarquia: grupo principal → grupo (subgrupo) → tarefa (TPE; as revisões .1, .2… somam na original).
import { diasUteisEntre } from './agenda'
import { tpeBase } from './calculo'
import { diasEntre } from './formato'

export type Situacao = 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'FINALIZADA'
export interface Fatia { chave: string; rotulo: string; principal?: string; grupo?: string; horas: number; extras: number; custo: number; pctHoras: number; pctCusto: number; tpes?: number; revisoes?: number; descricao?: string; projetistas?: number }
export interface Intervalo { corridos: number; uteis: number }

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const d10 = (x: any) => (x ? String(x).slice(0, 10) : null)
/** período fechado de a até b (os dois dias contam) */
const periodo = (a: string, b: string, fer: Set<string>): Intervalo => ({ corridos: diasEntre(a, b) + 1, uteis: diasUteisEntre(a, b, fer) })
/** distância com sinal de a até b (b depois de a = positivo), em dias corridos e úteis */
const distancia = (a: string, b: string, fer: Set<string>): Intervalo => {
  if (a === b) return { corridos: 0, uteis: 0 }
  const s = b > a ? 1 : -1, [x, y] = b > a ? [a, b] : [b, a]
  // dias úteis depois de x até y (x não conta)
  const u = diasUteisEntre(x, y, fer) - (diasUteisEntre(x, x, fer))
  return { corridos: diasEntre(a, b), uteis: s * u }
}

function agrupar(aps: any[], chave: (a: any) => string, rot: (a: any) => string, totalH: number, totalC: number): Fatia[] {
  const m = new Map<string, Fatia & { _tpes: Set<string>; _proj: Set<string>; _cod: Set<string> }>()
  for (const a of aps) {
    const k = chave(a)
    const f = m.get(k) ?? { chave: k, rotulo: rot(a), principal: a.principal, grupo: a.grupo, horas: 0, extras: 0, custo: 0, pctHoras: 0, pctCusto: 0, _tpes: new Set(), _proj: new Set(), _cod: new Set() }
    f.horas += Number(a.horas_totais) || 0; f.extras += Number(a.horas_extras) || 0; f.custo += Number(a.custo_total) || 0
    f._tpes.add(tpeBase(String(a.tpe_codigo))); f._proj.add(String(a.recurso_nome)); f._cod.add(String(a.tpe_codigo))
    m.set(k, f)
  }
  return [...m.values()].map(({ _tpes, _proj, _cod, ...f }) => ({ ...f, tpes: _tpes.size, projetistas: _proj.size, revisoes: _cod.size - _tpes.size,
    pctHoras: totalH ? f.horas / totalH : 0, pctCusto: totalC ? f.custo / totalC : 0 })).sort((a, b) => b.horas - a.horas)
}
/** maior e menor consumo, só entre itens com horas efetivas */
const extremos = (xs: Fatia[], campo: 'horas' | 'custo' = 'horas') => {
  const c = xs.filter((x) => x[campo] > 0.0001).sort((a, b) => b[campo] - a[campo])
  return { maior: c[0] ?? null, menor: c.length > 1 ? c[c.length - 1] : null }
}

function calcularOS(o: any, todosAps: any[], todasTpes: any[], feriados: Set<string>, hoje: string) {
  const aps = todosAps.filter((a) => Number(a.os) === Number(o.os))
  const tpes = todasTpes.filter((t) => Number(t.os) === Number(o.os) && !t.arquivada)
  const horas = soma(aps.map((a) => Number(a.horas_totais) || 0))
  const extras = soma(aps.map((a) => Number(a.horas_extras) || 0))
  const custo = soma(aps.map((a) => Number(a.custo_total) || 0))
  const custoHe = soma(aps.map((a) => Number(a.custo_he) || 0))
  const dias = aps.map((a) => d10(a.dia)!).sort()
  const primeiroAp = dias[0] ?? null, ultimoAp = dias[dias.length - 1] ?? null
  const raizes = new Set(tpes.map((t) => tpeBase(String(t.codigo))))
  const abertas = tpes.filter((t) => t.status !== 'FINALIZADA')
  const ini = d10(o.data_inicio), prazoFinal = d10(o.prazo_final), finalizada = d10(o.data_finalizacao)

  // ---------- situação e parecer de prazo
  const situacao: Situacao = o.status === 'FINALIZADA' ? 'FINALIZADA'
    : horas > 0 || tpes.some((t) => t.status === 'EM ANDAMENTO') ? 'EM_ANDAMENTO' : 'NAO_INICIADA'
  // previsão de término (O.S. em aberto): maior prazo planejado entre as TPEs em aberto;
  // TPE com prazo vencido e ainda aberta conta como "hoje" (ainda não terminou)
  const prazosAbertos = abertas.map((t) => d10(t.prazo)).filter(Boolean) as string[]
  const semPrazo = abertas.filter((t) => !t.prazo).length
  let previsao: string | null = null
  if (situacao !== 'FINALIZADA' && prazosAbertos.length) {
    previsao = prazosAbertos.map((p) => (p < hoje ? hoje : p)).sort().pop()!
  }
  const referencia = situacao === 'FINALIZADA' ? finalizada : previsao
  const desvio = referencia && prazoFinal ? distancia(prazoFinal, referencia, feriados) : null // + = depois do prazo
  const parecer = !prazoFinal ? 'SEM_PRAZO' : !referencia ? (situacao === 'FINALIZADA' ? 'SEM_DATA' : 'SEM_PREVISAO')
    : desvio!.corridos > 0 ? 'ATRASO' : desvio!.corridos < 0 ? 'ANTES' : 'NO_PRAZO'

  // ---------- distribuição de esforço (a soma de cada visão = total da O.S.: cada apontamento tem 1 principal, 1 grupo, 1 TPE)
  const porPrincipal = agrupar(aps, (a) => a.principal || '(sem principal)', (a) => a.principal || '(sem principal)', horas, custo)
  const porGrupo = agrupar(aps, (a) => `${a.principal} › ${a.grupo}`, (a) => `${a.principal} › ${a.grupo}`, horas, custo)
  const porTpe = agrupar(aps, (a) => tpeBase(String(a.tpe_codigo)), (a) => tpeBase(String(a.tpe_codigo)), horas, custo)
  const descTpe = new Map(tpes.map((t) => [tpeBase(String(t.codigo)), t.descricao]))
  for (const f of porTpe) f.descricao = descTpe.get(f.chave) ?? ''
  const porTipoDia = agrupar(aps, (a) => a.tipo_dia || '—', (a) => a.tipo_dia || '—', horas, custo)
  const porProjetista = agrupar(aps, (a) => String(a.recurso_nome), (a) => String(a.recurso_nome), horas, custo)
  // projetista × principal (horas)
  const matriz = new Map<string, Map<string, number>>()
  for (const a of aps) {
    const p = String(a.recurso_nome), k = a.principal || '(sem principal)'
    const m = matriz.get(p) ?? new Map<string, number>(); m.set(k, (m.get(k) ?? 0) + (Number(a.horas_totais) || 0)); matriz.set(p, m)
  }

  // ---------- análise de prazo
  const prazoTotal = ini && prazoFinal && prazoFinal >= ini ? periodo(ini, prazoFinal, feriados) : null
  const janela = primeiroAp && ultimoAp ? periodo(primeiroAp, ultimoAp, feriados) : null
  const inicioAte1o = ini && primeiroAp ? distancia(ini, primeiroAp, feriados) : null
  const ultimoAteFim = ultimoAp && prazoFinal ? distancia(ultimoAp, prazoFinal, feriados) : null
  const pctJanela = prazoTotal && janela ? janela.corridos / prazoTotal.corridos : null

  // ---------- comparação com outras O.S. (só com compatibilidade: mesmo principal › grupo, 3+ TPEs com horas em outras O.S.)
  const outras = new Map<string, { h: number; grupo: string; os: number }>()
  for (const a of todosAps) {
    if (Number(a.os) === Number(o.os)) continue
    const k = `${a.os}|${tpeBase(String(a.tpe_codigo))}`
    const x = outras.get(k) ?? { h: 0, grupo: `${a.principal} › ${a.grupo}`, os: Number(a.os) }
    x.h += Number(a.horas_totais) || 0; outras.set(k, x)
  }
  const refGrupo = new Map<string, { n: number; os: Set<number>; soma: number }>()
  for (const x of outras.values()) if (x.h > 0) {
    const r = refGrupo.get(x.grupo) ?? { n: 0, os: new Set(), soma: 0 }; r.n++; r.os.add(x.os); r.soma += x.h; refGrupo.set(x.grupo, r)
  }
  const comparacao = porGrupo.filter((g) => g.horas > 0).map((g) => {
    const r = refGrupo.get(g.chave)
    const aqui = g.horas / Math.max(1, g.tpes ?? 1)
    return r && r.n >= 3 && r.os.size >= 2 ? { grupo: g.chave, aqui, tpesAqui: g.tpes ?? 0, media: r.soma / r.n, amostra: r.n, osAmostra: r.os.size, dif: aqui / (r.soma / r.n) - 1 } : null
  }).filter(Boolean) as { grupo: string; aqui: number; tpesAqui: number; media: number; amostra: number; osAmostra: number; dif: number }[]

  // ---------- recorrência (oportunidade de padronização): mesmo grupo várias vezes na O.S., revisões, ou grupo presente em 3+ O.S.
  const osPorGrupo = new Map<string, Set<number>>()
  for (const a of todosAps) { const k = `${a.principal} › ${a.grupo}`; const s = osPorGrupo.get(k) ?? new Set<number>(); s.add(Number(a.os)); osPorGrupo.set(k, s) }
  const recorrentes = porGrupo.filter((g) => g.horas > 0 && ((g.tpes ?? 0) >= 2 || (g.revisoes ?? 0) > 0 || (osPorGrupo.get(g.chave)?.size ?? 0) >= 3))
    .map((g) => ({ grupo: g.chave, tpes: g.tpes ?? 0, revisoes: g.revisoes ?? 0, osComGrupo: osPorGrupo.get(g.chave)?.size ?? 0, horas: g.horas, pct: g.pctHoras }))

  const r = {
    o, aps, tpes, situacao, parecer, previsao, semPrazo, desvio, referencia,
    resumo: { qtdTpes: raizes.size, registros: tpes.length, revisoes: tpes.length - raizes.size, abertas: abertas.length, horas, extras, custo, custoHe, primeiroAp, ultimoAp, ini, prazoFinal, finalizada },
    porPrincipal, porGrupo, porTpe, porTipoDia, porProjetista, matriz,
    extremos: { principal: extremos(porPrincipal), grupo: extremos(porGrupo), tpe: extremos(porTpe) },
    extremosCusto: { grupo: extremos(porGrupo, 'custo'), tpe: extremos(porTpe, 'custo') },
    prazo: { prazoTotal, janela, inicioAte1o, ultimoAteFim, pctJanela },
    custos: { total: custo, porHora: horas ? custo / horas : 0, pctHe: custo ? custoHe / custo : 0, he: custoHe,
      porTpe: porTpe.filter((t) => t.custo > 0).length ? custo / porTpe.filter((t) => t.custo > 0).length : 0 },
    comparacao, recorrentes,
  }
  return r
}

type Analise = ReturnType<typeof calcularOS>

export function analisarOS(o: any, todosAps: any[], todasTpes: any[], feriados: Set<string>, hoje: string) {
  const r = calcularOS(o, todosAps, todasTpes, feriados, hoje)
  return { ...r, diagnostico: diagnosticar(r) }
}
const p0 = (v: number) => `${Math.round(v * 100)}%`
const h = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`

/** Resumo automático: cada frase sai de um indicador calculado acima (sem conclusões sem dado). */
function diagnosticar(a: Analise): { titulo: string; texto: string; tom: 'info' | 'ok' | 'atencao' }[] {
  const out: { titulo: string; texto: string; tom: 'info' | 'ok' | 'atencao' }[] = []
  const R = a.resumo
  if (R.horas <= 0) {
    out.push({ titulo: 'Sem apontamentos', texto: `A O.S. tem ${R.qtdTpes} TPE(s) cadastrada(s), mas nenhuma hora apontada. Os indicadores de esforço, participação e custo aparecem quando houver apontamentos.`, tom: 'info' })
  } else {
    const p = a.porPrincipal[0]
    out.push({ titulo: 'Perfil do trabalho', texto: `${p0(p.pctHoras)} das horas foram em ${p.rotulo}, distribuídas em ${a.porGrupo.length} grupo(s) e ${R.qtdTpes} TPE(s)${R.revisoes ? `, com ${R.revisoes} revisão(ões)` : ''}.`, tom: 'info' })
    const top = a.porTpe.slice(0, 3)
    out.push({ titulo: 'Atividades que mais consumiram horas', texto: top.map((t) => `${t.chave} (${t.grupo}): ${h(t.horas)}, ${p0(t.pctHoras)}`).join('; ') + '.', tom: 'info' })
    const g = a.porGrupo[0]
    const concentrado = g.pctHoras >= 0.5
    out.push({ titulo: 'Concentração do esforço', texto: concentrado
      ? `Esforço concentrado: o grupo ${g.rotulo} reúne ${p0(g.pctHoras)} das horas.`
      : `Esforço distribuído: o maior grupo (${g.rotulo}) tem ${p0(g.pctHoras)} das horas; os 3 maiores somam ${p0(a.porGrupo.slice(0, 3).reduce((s, x) => s + x.pctHoras, 0))}.`, tom: 'info' })
    const pj = a.porProjetista
    out.push({ titulo: 'Participação dos projetistas', texto: pj.length === 1
      ? `Uma pessoa apontou todas as horas: ${pj[0].rotulo}.`
      : `${pj.length} projetistas apontaram horas; ${pj[0].rotulo} teve a maior participação (${p0(pj[0].pctHoras)} das horas). Participação mostra esforço aplicado, não produtividade.`, tom: 'info' })
    if (R.extras > 0.0001) out.push({ titulo: 'Horas extras', texto: `${h(R.extras)} em hora extra (${p0(R.extras / R.horas)} das horas), que representam ${p0(a.custos.pctHe)} do custo de mão de obra.`, tom: R.extras / R.horas >= 0.15 ? 'atencao' : 'info' })
  }
  // prazo
  const d = a.desvio
  if (a.parecer === 'ATRASO' && d) out.push({ titulo: 'Prazo', texto: a.situacao === 'FINALIZADA'
    ? `Finalizada ${d.corridos} dia(s) corrido(s) (${d.uteis} úteis) depois do prazo final.`
    : `Pelas TPEs em aberto, a previsão de término (${a.previsao}) passa ${d.corridos} dia(s) corrido(s) (${d.uteis} úteis) do prazo final.`, tom: 'atencao' })
  else if ((a.parecer === 'ANTES' || a.parecer === 'NO_PRAZO') && d) out.push({ titulo: 'Prazo', texto: a.situacao === 'FINALIZADA'
    ? (d.corridos === 0 ? 'Finalizada no dia do prazo final.' : `Finalizada ${-d.corridos} dia(s) corrido(s) (${-d.uteis} úteis) antes do prazo final.`)
    : `Pelas TPEs em aberto, a previsão de término fica ${d.corridos === 0 ? 'no dia do prazo final' : `${-d.corridos} dia(s) corrido(s) antes do prazo final`}.`, tom: 'ok' })
  else if (a.parecer === 'SEM_PREVISAO') out.push({ titulo: 'Prazo', texto: `Não há previsão de término: ${a.semPrazo ? `${a.semPrazo} TPE(s) em aberto sem prazo` : 'nenhuma TPE em aberto com prazo'}.`, tom: 'atencao' })
  else if (a.parecer === 'SEM_PRAZO') out.push({ titulo: 'Prazo', texto: 'A O.S. não tem prazo final cadastrado: não é possível avaliar o atendimento do prazo.', tom: 'atencao' })
  if (a.prazo.inicioAte1o && a.prazo.inicioAte1o.corridos > 0) out.push({ titulo: 'Início dos trabalhos', texto: `O primeiro apontamento veio ${a.prazo.inicioAte1o.corridos} dia(s) corrido(s) (${a.prazo.inicioAte1o.uteis} úteis) depois do início da O.S.`, tom: a.prazo.prazoTotal && a.prazo.inicioAte1o.corridos > a.prazo.prazoTotal.corridos * 0.25 ? 'atencao' : 'info' })
  if (a.prazo.pctJanela != null) out.push({ titulo: 'Janela de execução', texto: `Os apontamentos ocupam ${p0(a.prazo.pctJanela)} do prazo total da O.S. (do 1º ao último apontamento). Isso mede ocupação do calendário, não percentual de conclusão.`, tom: 'info' })
  // padronização
  const rec = a.recorrentes.slice(0, 3)
  if (rec.length) out.push({ titulo: 'Oportunidade de padronização', texto: rec.map((x) => `${x.grupo}${x.tpes >= 2 ? ` (${x.tpes} TPEs nesta O.S.)` : ''}${x.revisoes ? ` (${x.revisoes} revisão(ões))` : ''}${x.osComGrupo >= 3 ? ` — aparece em ${x.osComGrupo} O.S.` : ''}`).join('; ') + '. Atividades que se repetem podem ganhar modelos, bibliotecas ou automação.', tom: 'info' })
  const acima = a.comparacao.filter((c) => c.dif >= 0.3)
  if (acima.length) out.push({ titulo: 'Comparação com outras O.S.', texto: acima.map((c) => `${c.grupo}: ${h(c.aqui)} por TPE aqui, contra média de ${h(c.media)} em ${c.amostra} TPEs de ${c.osAmostra} outras O.S. (+${p0(c.dif)})`).join('; ') + '.', tom: 'atencao' })
  return out
}
