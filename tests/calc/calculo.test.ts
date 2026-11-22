// Casos sintéticos (sem dados reais) que documentam as regras da VER_035 reproduzidas pelo motor.
import { describe, expect, it } from 'vitest'
import { calcularApontamento, capacidade, PARAMETROS_VER035 as P, tipoDia } from '../../src/lib/calculo'
import { dataISO, horaHHMM, normalizaTPE, textoSeguroPlanilha } from '../../src/lib/normaliza'

const F = new Set(['2026-11-20'])
const calc = (dia: string, a: string, b: string, ini = '07:00', doDia: string[] = [a], custo = 50) =>
  calcularApontamento({ dia, hora_inicio: a, hora_fim: b }, P, F, ini, doDia, custo)

describe('Regras de jornada e hora extra (CRM_ANALITICO)', () => {
  it('dia útil 07–17 (seg–qui): 9 h normais, almoço descontado', () => {
    const r = calc('2026-11-18', '07:00', '17:00')
    expect(r).toMatchObject({ tipo_dia: 'DIA ÚTIL', horas_normais: 9, horas_extras: 0, inicio_jornada: '07:00', fim_jornada: '17:00' })
    expect(r.custo_total).toBe(450)
  })
  it('sexta 07–17: jornada termina 16h → 8 h normais + 1 h extra a +60%', () => {
    const r = calc('2026-11-13', '07:00', '17:00')
    expect([r.horas_normais, r.horas_extras]).toEqual([8, 1])
    expect(r.custo_total).toBeCloseTo(8 * 50 + 1 * 50 * 1.6)
  })
  it('projetista com início padrão 08:00 que lança às 07:00 tem a jornada antecipada para 07–17', () => {
    const r1 = calc('2026-11-18', '08:00', '18:00', '08:00')
    expect([r1.horas_normais, r1.horas_extras, r1.inicio_jornada]).toEqual([9, 0, '08:00'])
    const r2 = calc('2026-11-18', '13:00', '18:00', '08:00', ['07:00', '13:00'])
    expect([r2.horas_normais, r2.horas_extras, r2.inicio_jornada]).toEqual([4, 1, '07:00'])
  })
  it('lançamento que não cruza o almoço não desconta almoço', () => {
    expect(calc('2026-11-18', '08:00', '12:00').horas_normais).toBe(4)
    expect(calc('2026-11-18', '11:00', '13:30').horas_normais).toBe(1.5)
  })
  it('sábado = 100% hora extra a +75%; feriado = 100% extra a +100%', () => {
    const s = calc('2026-11-14', '08:00', '12:00')
    expect([s.tipo_dia, s.horas_normais, s.horas_extras]).toEqual(['SÁBADO', 0, 4]); expect(s.custo_total).toBeCloseTo(4 * 50 * 1.75)
    const f = calc('2026-11-20', '08:00', '12:00')
    expect([f.tipo_dia, f.horas_extras]).toEqual(['FERIADO', 4]); expect(f.custo_total).toBeCloseTo(4 * 50 * 2)
    expect(tipoDia('2026-11-22', F)).toBe('DOMINGO')
  })
  it('sem custo H/H (projetista) → horas calculadas, custo nulo', () => {
    const r = calcularApontamento({ dia: '2026-11-18', hora_inicio: '07:00', hora_fim: '12:00' }, P, F, '07:00', ['07:00'], null)
    expect(r.horas_normais).toBe(5); expect(r.custo_total).toBeNull()
  })
})

describe('Capacidade (KPI itens 4 e 5)', () => {
  it('dias úteis × 9 h, sextas 8 h; feriados não descontados por padrão', () => {
    expect(capacidade('2026-11-16', '2026-11-20', P, F)).toBe(9 * 4 + 8)
    expect(capacidade('2026-11-16', '2026-11-20', { ...P, descontar_feriados_capacidade: true }, F)).toBe(9 * 4)
    expect(capacidade('2026-11-21', '2026-11-22', P, F)).toBe(0)
  })
})

describe('Normalização de planilhas', () => {
  it('datas BR, seriais e horários', () => {
    expect(dataISO('05/03/2026')).toBe('2026-03-05')
    expect(dataISO(46122)).toBe('2026-04-10') // serial do Excel (base 1899-12-30)
    expect(dataISO('31/02/2026')).toBeNull()
    expect(horaHHMM(0.5)).toBe('12:00')
    expect(horaHHMM(new Date(Date.UTC(1899, 11, 30, 13, 30)))).toBe('13:30')
  })
  it('códigos de TPE', () => {
    expect(normalizaTPE('TPE-12')).toBe('TPE-012.0')
    expect(normalizaTPE('tpe-103.2')).toBe('TPE-103.2')
    expect(normalizaTPE('X-1')).toBeNull()
  })
  it('proteção contra injeção de fórmulas na exportação', () => {
    expect(textoSeguroPlanilha('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(textoSeguroPlanilha('Normal')).toBe('Normal')
  })
})
