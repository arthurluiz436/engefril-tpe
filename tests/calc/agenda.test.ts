// Calendário de dias úteis e reprogramação de fila (Sequência por projetista).
import { describe, expect, it } from 'vitest'
import { cargaDiaria, diasDeFeriasNoPeriodo, diasUteisEntre, fimPorDiasUteis, indisponiveis, prazoMedioGrupo, proximoNumeroTpe, reprogramarFila } from '../../src/lib/agenda'

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
  it('média de horas por TPE do grupo (revisões somam na original) ÷ horas do dia', () => {
    const tpes = [
      { codigo: 'TPE-001.0', principal: 'ELE', grupo: 'PLC', horas_totais: 100 },
      { codigo: 'TPE-001.1', principal: 'ELE', grupo: 'PLC', horas_totais: 19.5 }, // mesma TPE: 119,5 h
      { codigo: 'TPE-002.0', principal: 'ELE', grupo: 'PLC', horas_totais: 119.5 },
      { codigo: 'TPE-003.0', principal: 'ELE', grupo: 'PLC', horas_totais: 0 }, // sem horas: fora da média
    ]
    expect(prazoMedioGrupo(tpes, 'ELE', 'PLC', 8.8)).toEqual({ horas: 119.5, n: 2, dias: 14, base: 'grupo' })
    expect(prazoMedioGrupo(tpes, 'ELE', 'OUTRO', 8.8)).toEqual({ horas: 119.5, n: 2, dias: 14, base: 'principal' })
    expect(prazoMedioGrupo(tpes, 'MEC', 'X', 8.8)).toBeNull()
    expect(prazoMedioGrupo([{ codigo: 'TPE-009.0', principal: 'A', grupo: 'B', horas_totais: 17.6 }], 'A', 'B', 8.8)!.dias).toBe(2)
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

describe('Carga diária e sobrecarga', () => {
  const H = '2026-11-01'
  it('uma tarefa termina e a próxima começa no mesmo dia: passagem, não sobrecarga', () => {
    const { carga, sobre } = cargaDiaria([
      { data_inicio: '2026-11-16', prazo: '2026-11-18' },
      { data_inicio: '2026-11-18', prazo: '2026-11-20' },
    ], new Set(), H)
    expect(carga.get('2026-11-18')!.length).toBe(2)
    expect(sobre.size).toBe(0)
  })
  it('duas tarefas no meio do período: sobrecarga', () => {
    const { sobre } = cargaDiaria([
      { data_inicio: '2026-11-16', prazo: '2026-11-20' },
      { data_inicio: '2026-11-17', prazo: '2026-11-19' },
    ], new Set(), H)
    expect([...sobre].sort()).toEqual(['2026-11-17', '2026-11-18', '2026-11-19'])
  })
  it('tarefa atrasada ocupa até hoje', () => {
    const { carga } = cargaDiaria([{ data_inicio: '2026-11-16', prazo: '2026-11-17' }], new Set(), '2026-11-20')
    expect(carga.has('2026-11-20')).toBe(true)
  })
})

describe('Atualização do cronograma pelo andamento (atraso e antecipação)', () => {
  const S = new Set<string>()
  it('atraso da TPE em andamento empurra as seguintes; a atrasada mantém as datas', () => {
    // hoje = qua 25/11; TPE-001 em andamento, prazo seg 23/11 (atrasada); TPE-002 (2 d.u.) e TPE-003 (3 d.u.)
    const r = reprogramarFila([
      { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-18', prazo: '2026-11-23', status: 'EM ANDAMENTO', primeiro_apontamento: '2026-11-18' },
      { id: 2, codigo: 'TPE-002.0', data_inicio: '2026-11-24', prazo: '2026-11-25' },
      { id: 3, codigo: 'TPE-003.0', data_inicio: '2026-11-26', prazo: '2026-11-30' },
    ], S, new Map(), '2026-11-25')
    expect(r[0]).toMatchObject({ mudou: false, iniciada: true, fimEfetivo: '2026-11-25', desvio: 2 })
    expect(r[1].para).toEqual(['2026-11-26', '2026-11-27'])
    expect(r[1].desvio).toBe(2)
    expect(r[2].para).toEqual(['2026-11-30', '2026-12-02'])
  })
  it('TPE que começou antes do planejado puxa as seguintes', () => {
    const r = reprogramarFila([
      { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-23', prazo: '2026-11-27', status: 'EM ANDAMENTO', primeiro_apontamento: '2026-11-19' },
      { id: 2, codigo: 'TPE-002.0', data_inicio: '2026-11-30', prazo: '2026-12-01' },
    ], S, new Map(), '2026-11-20')
    expect(r[0]).toMatchObject({ fimEfetivo: '2026-11-25', desvio: -2, mudou: false })
    expect(r[1].para).toEqual(['2026-11-26', '2026-11-27'])
    expect(r[1].desvio).toBe(-2)
  })
  it('tarefa não iniciada nunca vai para antes de hoje', () => {
    const r = reprogramarFila([{ id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-16', prazo: '2026-11-17' }], S, new Map(), '2026-11-25')
    expect(r[0].para).toEqual(['2026-11-25', '2026-11-26'])
  })
  it('sem atraso nem mudança, nada muda', () => {
    const r = reprogramarFila([
      { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-23', prazo: '2026-11-24', status: 'EM ANDAMENTO', primeiro_apontamento: '2026-11-23' },
      { id: 2, codigo: 'TPE-002.0', data_inicio: '2026-11-25', prazo: '2026-11-26' },
    ], S, new Map(), '2026-11-23')
    expect(r.some((x) => x.mudou)).toBe(false)
  })
})

describe('Início editado à mão e intervalos salvos', () => {
  const S = new Set<string>()
  const fila = [
    { id: 1, codigo: 'TPE-001.0', data_inicio: '2026-11-23', prazo: '2026-11-24' }, // seg–ter
    { id: 2, codigo: 'TPE-002.0', data_inicio: '2026-11-24', prazo: '2026-11-25' }, // começa no dia em que a 1 termina
    { id: 3, codigo: 'TPE-003.0', data_inicio: '2026-11-30', prazo: '2026-12-01' }, // folga de 2 dias úteis (qui, sex)
  ]
  it('sem mudança, mantém passagem no mesmo dia e folgas salvas', () => {
    const r = reprogramarFila(fila, S, new Map(), '2026-11-20', { ordemSalva: [1, 2, 3] })
    expect(r.some((x) => x.mudou)).toBe(false)
  })
  it('início da 1ª à mão empurra as seguintes mantendo durações e intervalos', () => {
    const r = reprogramarFila(fila, S, new Map(), '2026-11-20', { ordemSalva: [1, 2, 3], inicios: new Map([[1, '2026-11-25']]) })
    expect(r.map((x) => x.para)).toEqual([['2026-11-25', '2026-11-26'], ['2026-11-26', '2026-11-27'], ['2026-12-02', '2026-12-03']])
    expect(r[0].manual).toBe(true)
  })
  it('data à mão em fim de semana vai para o próximo dia útil', () => {
    const r = reprogramarFila(fila, S, new Map(), '2026-11-20', { ordemSalva: [1, 2, 3], inicios: new Map([[2, '2026-11-28']]) })
    expect(r[1].para).toEqual(['2026-11-30', '2026-12-01'])
  })
})
