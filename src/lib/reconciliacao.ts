// Matriz de reconciliação: valores gravados na aba KPI da planilha original × motor web.
import { normCab, valorCelula, dataISO } from './normaliza'
import type { indicadores } from './calculo'

type K = ReturnType<typeof indicadores>
export interface ItemRec { indicador: string; referencia: string; formula: string; excel: unknown; web: unknown; tolerancia: number; explicacao?: string }

const EXPL = {
  dup: 'Correção documentada: a VER_035 contava TPE-xxx e TPE-xxx.0 como TPEs distintas.',
  os: 'Correção documentada: a lista fixa da VER_035 não tinha duas O.S. cadastradas depois; agora a lista é dinâmica.',
}

/** Lê os valores (cache) da aba KPI e monta a matriz comparando com o motor web. */
export function reconciliar(wb: any, k: K): ItemRec[] {
  const ws = wb.worksheets.find((w: any) => normCab(w.name) === 'KPI')
  if (!ws) throw new Error('Aba KPI não encontrada (a reconciliação usa o modelo VER_035).')
  const v = (ref: string) => { const x = valorCelula(ws.getCell(ref).value); return x instanceof Date ? dataISO(x) : x }
  const itens: ItemRec[] = [
    { indicador: 'Início do período', referencia: 'KPI!B5', formula: 'MIN(dia)', excel: v('B5'), web: k.resumo.inicio, tolerancia: 0 },
    { indicador: 'Fim do período', referencia: 'KPI!B6', formula: 'MAX(dia)', excel: v('B6'), web: k.resumo.fim, tolerancia: 0 },
    { indicador: 'TPEs cadastrados', referencia: 'KPI!B7', formula: 'CONT.VALORES(TPE)', excel: v('B7'), web: k.resumo.tpes, tolerancia: 0 },
    { indicador: 'TPEs finalizados', referencia: 'KPI!B8', formula: 'CONT.SE(FINALIZADA="SIM")', excel: v('B8'), web: k.resumo.finalizados, tolerancia: 0 },
    { indicador: 'Reaberturas', referencia: 'KPI!B10', formula: 'TPEs com revisão ≠ .0', excel: v('B10'), web: k.resumo.reaberturas, tolerancia: 0 },
    { indicador: 'Índice de reabertura', referencia: 'KPI!B11', formula: 'reaberturas ÷ (TPEs − reaberturas)', excel: v('B11'), web: k.resumo.indice_reabertura, tolerancia: 1e-9 },
    { indicador: 'O.S. atendidas', referencia: 'KPI!B12', formula: 'O.S. distintas nas TPEs', excel: v('B12'), web: k.resumo.os_atendidas, tolerancia: 1e-6 },
    { indicador: 'Horas totais', referencia: 'KPI!B13', formula: 'Σ(normal+extra)×24', excel: v('B13'), web: k.resumo.horas, tolerancia: 1e-6 },
    { indicador: 'Horas normais', referencia: 'KPI!B14', formula: 'Σ normal × 24', excel: v('B14'), web: k.resumo.horas_normais, tolerancia: 1e-6 },
    { indicador: 'Horas extras', referencia: 'KPI!B15', formula: 'Σ extra × 24', excel: v('B15'), web: k.resumo.horas_extras, tolerancia: 1e-6 },
    { indicador: '% hora extra', referencia: 'KPI!B16', formula: 'extras ÷ totais', excel: v('B16'), web: k.resumo.pct_he, tolerancia: 1e-9 },
    { indicador: 'Tempo médio por TPE', referencia: 'KPI!B17', formula: 'MÉDIASE(horas>0)', excel: v('B17'), web: k.resumo.tempo_medio_tpe, tolerancia: 1e-6 },
    { indicador: 'Tempo médio por O.S.', referencia: 'KPI!B18', formula: 'horas ÷ O.S.', excel: v('B18'), web: k.resumo.tempo_medio_os, tolerancia: 1e-6 },
    { indicador: 'Prazo médio por TPE (dias)', referencia: 'KPI!B19', formula: 'média(fim − início + 1)', excel: v('B19'), web: k.resumo.prazo_medio, tolerancia: 1e-6 },
    { indicador: 'Custo total', referencia: 'KPI!B156', formula: 'Σ custo', excel: v('B156'), web: k.custos.total, tolerancia: 0.005 },
    { indicador: 'Custo normal', referencia: 'KPI!B157', formula: 'Σ normal × H/H', excel: v('B157'), web: k.custos.normal, tolerancia: 0.005 },
    { indicador: 'Custo H.E.', referencia: 'KPI!B158', formula: 'Σ extra × H/H × (1+adic.)', excel: v('B158'), web: k.custos.extra, tolerancia: 0.005 },
    { indicador: 'Custo médio por hora', referencia: 'KPI!B163', formula: 'custo ÷ horas', excel: v('B163'), web: k.custos.por_hora, tolerancia: 1e-6 },
    { indicador: 'Custo médio por O.S.', referencia: 'KPI!B165', formula: 'custo ÷ O.S.', excel: v('B165'), web: k.custos.por_os, tolerancia: 1e-6 },
    { indicador: 'Tempo médio por O.S. (item 6)', referencia: 'KPI!G127', formula: 'MÉDIASE(G92:G126;">0")', excel: v('G127'), web: k.tempo_medio_por_os, tolerancia: 1e-6, explicacao: EXPL.os },
    { indicador: 'Mediana por O.S. (item 6)', referencia: 'KPI!G128', formula: 'MED(G92:G126)', excel: v('G128'), web: k.mediana_por_os, tolerancia: 1e-6, explicacao: EXPL.os },
  ]
  for (let r = 72; r <= 75; r++) {
    const nome = String(valorCelula(ws.getCell(`A${r}`).value) ?? '')
    const w = k.porRecurso.find((x) => x.recurso === nome)
    if (!w) continue
    itens.push({ indicador: `${nome} · horas`, referencia: `KPI!H${r}`, formula: 'Σ horas do recurso', excel: v(`H${r}`), web: w.horas, tolerancia: 1e-6 })
    itens.push({ indicador: `${nome} · capacidade`, referencia: `KPI!E${r}`, formula: 'DIATRABALHOTOTAL×9 − sextas', excel: v(`E${r}`), web: w.capacidade, tolerancia: 1e-6 })
    itens.push({ indicador: `${nome} · TPEs atendidos`, referencia: `KPI!L${r}`, formula: 'TPEs distintas', excel: v(`L${r}`), web: w.tpes_atendidos, tolerancia: 1e-6, explicacao: EXPL.dup })
  }
  for (let r = 24; r <= 30; r++) {
    const p = String(valorCelula(ws.getCell(`A${r}`).value) ?? '')
    const w = k.porPrincipal.find((x) => x.chave === p)
    if (w) itens.push({ indicador: `${p} · horas`, referencia: `KPI!D${r}`, formula: 'SOMASES por principal', excel: v(`D${r}`), web: w.horas, tolerancia: 1e-6 })
  }
  return itens
}

export function statusItem(i: ItemRec): 'validado' | 'diferenca_explicada' | 'divergente' | 'pendente' {
  if (i.excel === null || i.excel === undefined) return 'pendente'
  const igual = typeof i.excel === 'number' && typeof i.web === 'number' ? Math.abs(i.excel - i.web) <= i.tolerancia : String(i.excel) === String(i.web)
  if (igual) return 'validado'
  return i.explicacao ? 'diferenca_explicada' : 'divergente'
}
