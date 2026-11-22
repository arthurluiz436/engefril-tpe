// O modelo de planilha gerado pelo sistema é lido corretamente pelo importador.
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { montarModelo } from '../../src/lib/modeloImportacao'
import { lerPlanilha } from '../../src/lib/importador'

describe('Modelo de importação', () => {
  it('cada aba é reconhecida e as linhas preenchidas viram registros', async () => {
    const wb = montarModelo(ExcelJS)
    wb.getWorksheet('CLIENTES E OS').addRow([61922, 'LATICINIOS SANTA MARIA', 'AL', 'BATALHA', 'PROJETO COMPLETO', 'GRANDE', 'FERNANDO', 'CLASSE A', new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 11, 22)), 'EM ANDAMENTO'])
    wb.getWorksheet('TPES').addRow(['TPE-001.0', 61922, 'EQUIPAMENTO', 'VASO DE PRESSÃO', 'Elaboração do vaso', 'EM ANDAMENTO', new Date(Date.UTC(2026, 10, 3)), null, 'Arthur Luiz'])
    wb.getWorksheet('APONTAMENTOS').addRow(['TPE-001.0', 61922, 'Arthur Luiz', 'Cálculo de espessura', new Date(Date.UTC(2026, 10, 3)), '07:00', '12:00'])
    const par = wb.getWorksheet('PARAMETROS')
    par.getRow(2).values = ['Arthur Luiz', 55, '08:00', '', new Date(Date.UTC(2026, 10, 20)), 'Consciência Negra']
    const buf = await wb.xlsx.writeBuffer()
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(buf)
    const r = lerPlanilha(lido as any, 'modelo.xlsx', 'x')
    expect(Object.fromEntries(r.abas.map((a) => [a.aba, a.entidade]))).toEqual({
      'LEIA-ME': 'ignorar', 'CLIENTES E OS': 'os', TPES: 'tpes', APONTAMENTOS: 'apontamentos', PARAMETROS: 'ignorar',
    })
    expect(r.payload.os).toMatchObject([{ os: 61922, nome: 'LATICINIOS SANTA MARIA', prazo_final: '2026-12-22', status: 'EM ANDAMENTO' }])
    expect(r.payload.tpes).toMatchObject([{ codigo: 'TPE-001.0', os: 61922, grupo: 'VASO DE PRESSÃO', status: 'EM ANDAMENTO', data_inicio: '2026-11-03', responsavel: 'Arthur Luiz' }])
    expect(r.payload.apontamentos).toMatchObject([{ tpe: 'TPE-001.0', recurso: 'Arthur Luiz', dia: '2026-11-03', hora_inicio: '07:00', hora_fim: '12:00' }])
    expect(r.payload.recursos).toMatchObject([{ nome: 'Arthur Luiz', custo: 55, inicio_padrao: '08:00' }])
    expect(r.payload.feriados).toEqual([{ data: '2026-11-20', descricao: 'Consciência Negra' }])
    expect(r.avisos.filter((a) => /colunas não usadas/.test(a))).toEqual([])
  })
})
