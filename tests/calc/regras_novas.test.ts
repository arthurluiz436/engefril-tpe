// Regras acrescentadas depois da VER_035: jornada flexível informada e médias por TPE com revisões.
import { describe, expect, it } from 'vitest'
import { calcularApontamento, indicadores, PARAMETROS_VER035 as P, tpeBase, type DiaEspecial } from '../../src/lib/calculo'

const F = new Set<string>()

describe('Jornada flexível informada pelo projetista', () => {
  it('quem começou às 08:00 e foi até 18:00 numa quarta não faz hora extra', () => {
    const r = calcularApontamento({ dia: '2026-11-18', hora_inicio: '08:00', hora_fim: '18:00' }, P, F, '07:00', ['08:00'], 50, '08:00')
    expect([r.inicio_jornada, r.fim_jornada, r.horas_normais, r.horas_extras]).toEqual(['08:00', '18:00', 9, 0])
  })
  it('sem a informação, o mesmo lançamento segue a regra antiga (07–17 → 1 h extra)', () => {
    const r = calcularApontamento({ dia: '2026-11-18', hora_inicio: '08:00', hora_fim: '18:00' }, P, F, '07:00', ['08:00'], 50)
    expect([r.inicio_jornada, r.horas_normais, r.horas_extras]).toEqual(['07:00', 8, 1])
  })
  it('jornada informada às 07:00 vale mesmo se o 1º lançamento do dia começou depois', () => {
    const r = calcularApontamento({ dia: '2026-11-18', hora_inicio: '07:30', hora_fim: '18:00' }, P, F, '08:00', ['07:30'], 50, '07:00')
    expect([r.fim_jornada, r.horas_normais, r.horas_extras]).toEqual(['17:00', 8.5, 1])
  })
  it('sexta com início às 08:00: jornada até 17:00', () => {
    const r = calcularApontamento({ dia: '2026-11-13', hora_inicio: '08:00', hora_fim: '18:00' }, P, F, '07:00', ['08:00'], 50, '08:00')
    expect([r.fim_jornada, r.horas_normais, r.horas_extras]).toEqual(['17:00', 8, 1])
  })
})

describe('Média por TPE com revisões', () => {
  const ap = (codigo: string, h: number) => ({ tpe_codigo: codigo, os: 61922, principal: 'EQUIPAMENTO', grupo: 'VASO', recurso_nome: 'Ana', dia: '2026-11-18',
    tipo_dia: 'DIA ÚTIL', horas_normais: h, horas_extras: 0, horas_totais: h, custo_normal: h * 10, custo_he: 0, custo_total: h * 10 })
  const tpe = (codigo: string, revisao: number) => ({ codigo, os: 61922, principal: 'EQUIPAMENTO', grupo: 'VASO', status: 'FINALIZADA', data_inicio: null, data_fim: null, revisao })
  const aps = [ap('TPE-002.0', 2), ap('TPE-002.1', 1), ap('TPE-003.0', 5)]
  const tpes = [tpe('TPE-002.0', 0), tpe('TPE-002.1', 1), tpe('TPE-003.0', 0)]
  it('2 h na .0 + 1 h na .1 contam como uma TPE de 3 h', () => {
    expect(tpeBase('TPE-002.1')).toBe('TPE-002')
    const k = indicadores(aps, tpes, [], ['Ana'], P, F)
    expect(k.resumo.tempo_medio_tpe).toBe((3 + 5) / 2)
    expect(k.porGrupo[0].tempo_medio_tpe).toBe(4)
    expect([k.porGrupo[0].menor_tpe, k.porGrupo[0].maior_tpe]).toEqual([3, 5])
    expect(k.porRecurso[0].tpes_atendidos).toBe(2)
    expect(k.porOS[0].horas_por_tpe).toBe(4)
    expect(k.resumo.horas).toBe(8) // totais não mudam
    expect(k.resumo.tpes).toBe(2) // a revisão não conta como outra TPE
    expect(k.porGrupo.reduce((s, g) => s + g.qtd_tpes, 0)).toBe(2)
    expect(k.resumo.reaberturas).toBe(1) // reabertura continua contada
  })
  it('modo VER_035 (reconciliação): cada revisão é uma TPE', () => {
    const k = indicadores(aps, tpes, [], ['Ana'], P, F, { agruparRevisoes: false })
    expect(k.resumo.tempo_medio_tpe).toBeCloseTo((2 + 1 + 5) / 3)
  })
})

describe('Feriados e dias atípicos no cálculo (prévia do Registrar atividade)', () => {
  const esp = new Map<string, DiaEspecial>([
    ['2026-11-23', { tipo: 'NAO_TRABALHADO', adicional: 0.6 }],
    ['2026-11-28', { tipo: 'DIA_NORMAL', adicional: null }],
    ['2026-12-05', { tipo: 'PERCENTUAL', adicional: 0.5 }],
  ])
  const c = (dia: string) => calcularApontamento({ dia, hora_inicio: '08:00', hora_fim: '12:00' }, { ...P, dias_especiais: esp }, F, '07:00', ['08:00'], 50)
  it('mesma regra da view do banco', () => {
    expect([c('2026-11-23').tipo_dia, c('2026-11-23').horas_extras, c('2026-11-23').adicional]).toEqual(['NÃO TRABALHADO', 4, 0.6])
    expect([c('2026-11-28').tipo_dia, c('2026-11-28').horas_normais, c('2026-11-28').horas_extras]).toEqual(['DIA ÚTIL', 4, 0])
    expect([c('2026-12-05').tipo_dia, c('2026-12-05').horas_extras, c('2026-12-05').adicional]).toEqual(['SÁBADO', 4, 0.5])
    expect(c('2026-11-23').custo_total).toBeCloseTo(4 * 50 * 1.6)
  })
})
