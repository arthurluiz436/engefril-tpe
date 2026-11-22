// Calendário de dias úteis e reprogramação de fila (Sequência por projetista).
import { describe, expect, it } from 'vitest'
import { diasDeFeriasNoPeriodo, diasUteisEntre, fimPorDiasUteis, indisponiveis, prazoMedioGrupo, proximoNumeroTpe, reprogramarFila } from '../../src/lib/agenda'

const F = new Set(['2026-11-20']) // feriado numa sexta

describe('Dias úteis', () => {
  it('pula sábado, domingo e feriado', () => {
    expect(fimPorDiasUteis('2026-11-18', 3, F)).toBe('2026-11-23') // qua, qui, (sex feriado), seg
    expect(diasUteisEntre('2026-11-16', '2026-11-22', F)).toBe(4)
    expect(fimPorDiasUteis('2026-11-21', 1, F)).toBe('2026-11-23') // começa no sábado → segunda
  })
})

describe('Reprogramação ao mudar a ordem', () => {
  it('troca a ordem mantendo a duração de cada TPE', () => {
    // TPE-001: seg 23 → qua 25 (3 d.u.); TPE-002: qui 26 → sex 27 (2 d.u.)
    const t1 = { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-23', prazo: '2026-11-25' }
    const t2 = { id: 2, codigo: 'TPE-002.0', data_inicio: '2026-11-26', prazo: '2026-11-27' }
    const r = reprogramarFila([t2, t1], new Set())
    expect(r.map((x) => [x.codigo, ...x.para, x.dias])).toEqual([
      ['TPE-002.0', '2026-11-23', '2026-11-24', 2],
      ['TPE-001.0', '2026-11-25', '2026-11-27', 3],
    ])
  })
  it('não começa antes da predecessora e ignora TPE sem datas', () => {
    const outras = new Map([[9, { id: 9, codigo: 'TPE-009.0', data_inicio: '2026-11-30', prazo: '2026-12-02' }]])
    const r = reprogramarFila([
      { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-23', prazo: '2026-11-23', predecessora_id: 9 },
      { id: 2, codigo: 'TPE-002.0', data_inicio: null, prazo: null },
    ], new Set(), outras)
    expect(r[0].para).toEqual(['2026-11-30', '2026-11-30'])
    expect(r[1].mudou).toBe(false)
  })
})

describe('Prazo médio e numeração', () => {
  it('média de dias úteis das finalizadas do grupo', () => {
    const tpes = [
      { principal: 'EQ', grupo: 'VASO', status: 'FINALIZADA', data_inicio: '2026-11-16', data_fim: '2026-11-18' }, // 3
      { principal: 'EQ', grupo: 'VASO', status: 'FINALIZADA', data_inicio: '2026-11-16', data_fim: '2026-11-20' }, // 5
      { principal: 'EQ', grupo: 'VASO', status: 'EM ANDAMENTO', data_inicio: '2026-11-16', data_fim: null },
    ]
    expect(prazoMedioGrupo(tpes, 'EQ', 'VASO')).toEqual({ dias: 4, n: 2, base: 'grupo' })
    expect(prazoMedioGrupo(tpes, 'EQ', 'OUTRO')).toEqual({ dias: 4, n: 2, base: 'principal' })
  })
  it('reaproveita o menor número livre', () => {
    expect(proximoNumeroTpe([1, 3, 4])).toBe(2)
    expect(proximoNumeroTpe([1, 2])).toBe(3)
    expect(proximoNumeroTpe([])).toBe(1)
  })
})

describe('Férias no cálculo de datas', () => {
  it('tarefa de 15 dias úteis que começa antes das férias termina depois delas', () => {
    // férias de 07/12 a 18/12/2026 (10 dias úteis); começa seg 30/11
    const cal = indisponiveis(new Set(), [{ recurso_id: 1, inicio: '2026-12-07', fim: '2026-12-18' }], 1)
    expect(fimPorDiasUteis('2026-11-30', 15, cal)).toBe('2027-01-01') // 5 antes + férias + 10 depois (21/12 a 01/01)
    expect(fimPorDiasUteis('2026-11-30', 15, new Set())).toBe('2026-12-18')
    expect(diasDeFeriasNoPeriodo('2026-11-30', '2027-01-01', new Set(), [{ recurso_id: 1, inicio: '2026-12-07', fim: '2026-12-18' }], 1)).toBe(10)
  })
  it('férias de outra pessoa não interferem', () => {
    expect(indisponiveis(new Set(['2026-12-25']), [{ recurso_id: 2, inicio: '2026-12-07', fim: '2026-12-18' }], 1)).toEqual(new Set(['2026-12-25']))
  })
})
