// Exportação XLSX/CSV gerada no navegador do Master, a partir de dados que o banco já
// filtrou pela RLS (um projetista não consegue obter linhas de terceiros).
import { textoSeguroPlanilha } from './normaliza'

export type TipoColuna = 'texto' | 'numero' | 'inteiro' | 'data' | 'hora' | 'horas' | 'moeda' | 'pct'
export interface ColunaExport { chave: string; rotulo: string; tipo: TipoColuna; largura?: number; /** formato Excel próprio (ex.: '000000' para O.S.) */ numFmt?: string }

const FMT: Record<TipoColuna, string | undefined> = {
  texto: undefined, numero: '#,##0.00', inteiro: '0', data: 'dd/mm/yyyy', hora: 'hh:mm', horas: '#,##0.00', moeda: '"R$" #,##0.00', pct: '0.0%',
}

function valorTipado(v: unknown, tipo: TipoColuna): unknown {
  if (v === null || v === undefined || v === '') return null
  switch (tipo) {
    case 'numero': case 'horas': case 'moeda': case 'pct': case 'inteiro': { const n = Number(v); return Number.isFinite(n) ? n : null }
    case 'data': { const s = String(v).slice(0, 10); const [a, m, d] = s.split('-').map(Number); return a ? new Date(Date.UTC(a, m - 1, d)) : null }
    case 'hora': { const [h, mi] = String(v).split(':').map(Number); return (h * 60 + mi) / 1440 }
    default: return textoSeguroPlanilha(String(v))
  }
}

export async function exportarXLSX(arquivo: string, abas: { nome: string; colunas: ColunaExport[]; linhas: Record<string, unknown>[] }[],
                                   parametros: [string, string][]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Engefril · Gestão de TPEs'; wb.created = new Date()
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = aba.colunas.map((c) => ({ header: c.rotulo, key: c.chave, width: c.largura ?? Math.max(12, Math.min(48, c.rotulo.length + 4)) }))
    for (const l of aba.linhas) ws.addRow(Object.fromEntries(aba.colunas.map((c) => [c.chave, valorTipado(l[c.chave], c.tipo)])))
    aba.colunas.forEach((c, i) => { const f = c.numFmt ?? FMT[c.tipo]; if (f) ws.getColumn(i + 1).numFmt = f })
    const cab = ws.getRow(1)
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A2E31' } }
    cab.alignment = { vertical: 'middle', wrapText: true }
    if (aba.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } }
  }
  const p = wb.addWorksheet('Parâmetros da exportação')
  p.columns = [{ header: 'Item', key: 'k', width: 32 }, { header: 'Valor', key: 'v', width: 80 }]
  for (const [k, v] of parametros) p.addRow({ k, v: textoSeguroPlanilha(v) })
  p.getRow(1).font = { bold: true }
  const buf = await wb.xlsx.writeBuffer()
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), arquivo)
}

export function exportarCSV(arquivo: string, colunas: ColunaExport[], linhas: Record<string, unknown>[]) {
  const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const fmt = (v: unknown, t: TipoColuna) => {
    if (v === null || v === undefined || v === '') return ''
    if (t === 'data') { const [a, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${a}` }
    if (t === 'hora') return String(v).slice(0, 5)
    if (['numero', 'horas', 'moeda'].includes(t)) return Number(v).toFixed(2).replace('.', ',')
    if (t === 'pct') return (Number(v) * 100).toFixed(1).replace('.', ',')
    return textoSeguroPlanilha(String(v))
  }
  const txt = [colunas.map((c) => esc(c.rotulo)).join(';'), ...linhas.map((l) => colunas.map((c) => esc(fmt(l[c.chave], c.tipo))).join(';'))].join('\r\n')
  baixar(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }), arquivo)
}

export function baixar(blob: Blob, nome: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1_')
