// Indicadores por Cliente/O.S.: consistência dos totais, situação e prazo.
import { describe, expect, it } from 'vitest'
import { analisarOS } from '../../src/lib/indicadoresOS'

const ap = (os: number, tpe: string, principal: string, grupo: string, quem: string, dia: string, h: number, he = 0, custo = h * 50) =>
  ({ os, tpe_codigo: tpe, principal, grupo, recurso_nome: quem, dia, tipo_dia: 'DIA ÚTIL', horas_totais: h, horas_extras: he, custo_total: custo, custo_he: he * 30 })
const tpe = (os: number, codigo: string, status: string, prazo: string | null, grupo = 'VASO', principal = 'EQUIP') => ({ os, codigo, status, prazo, grupo, principal, descricao: codigo })
const S = new Set<string>()

describe('Indicadores por O.S.', () => {
  const O = { os: 61922, nome: 'CLIENTE', status: 'EM ANDAMENTO', data_inicio: '2026-11-02', prazo_final: '2026-11-30' }
  const aps = [
    ap(61922, 'TPE-001.0', 'EQUIP', 'VASO', 'Ana', '2026-11-05', 10, 2),
    ap(61922, 'TPE-001.1', 'EQUIP', 'VASO', 'Bia', '2026-11-10', 4),      // revisão soma na TPE-001
    ap(61922, 'TPE-002.0', 'ELETR', 'PAINEL', 'Ana', '2026-11-12', 6),
    ap(99999, 'TPE-900.0', 'EQUIP', 'VASO', 'Ana', '2026-11-12', 50),     // outra O.S.: não entra
  ]
  const tpes = [tpe(61922, 'TPE-001.0', 'FINALIZADA', '2026-11-06'), tpe(61922, 'TPE-001.1', 'FINALIZADA', '2026-11-11'),
    tpe(61922, 'TPE-002.0', 'EM ANDAMENTO', '2026-11-25', 'PAINEL', 'ELETR')]
  const a = analisarOS(O, aps, tpes, S, '2026-11-20')

  it('as visões por principal, grupo, TPE e projetista somam o total da O.S.', () => {
    expect(a.resumo.horas).toBe(20)
    for (const v of [a.porPrincipal, a.porGrupo, a.porTpe, a.porProjetista]) {
      expect(v.reduce((s, x) => s + x.horas, 0)).toBe(20)
      expect(v.reduce((s, x) => s + x.custo, 0)).toBe(a.custos.total)
    }
    expect(a.resumo.qtdTpes).toBe(2)       // TPE-001 (com a revisão) + TPE-002
    expect(a.resumo.revisoes).toBe(1)
    expect(a.porTpe[0]).toMatchObject({ chave: 'TPE-001', horas: 14, revisoes: 1 })
  })
  it('situação e previsão: em andamento, previsão pelo maior prazo das TPEs abertas', () => {
    expect(a.situacao).toBe('EM_ANDAMENTO')
    expect(a.previsao).toBe('2026-11-25')
    expect(a.parecer).toBe('ANTES')
    expect(a.desvio!.corridos).toBe(-5)
  })
  it('prazo: janela dos apontamentos e intervalos em dias corridos e úteis', () => {
    expect(a.prazo.prazoTotal).toEqual({ corridos: 29, uteis: 21 })
    expect(a.prazo.janela).toEqual({ corridos: 8, uteis: 6 })            // 05/11 a 12/11
    expect(a.prazo.inicioAte1o).toEqual({ corridos: 3, uteis: 3 })        // 02/11 → 05/11
    expect(a.prazo.pctJanela).toBeCloseTo(8 / 29)
  })
  it('finalizada depois do prazo: atendida com atraso', () => {
    const f = analisarOS({ ...O, status: 'FINALIZADA', data_finalizacao: '2026-12-02' }, aps, tpes, S, '2026-12-10')
    expect(f.situacao).toBe('FINALIZADA')
    expect(f.parecer).toBe('ATRASO')
    expect(f.desvio).toEqual({ corridos: 2, uteis: 2 })
  })
  it('sem apontamentos: não iniciada', () => {
    const n = analisarOS({ os: 1, nome: 'X', status: 'EM ANDAMENTO', prazo_final: null }, aps, [], S, '2026-11-20')
    expect(n.situacao).toBe('NAO_INICIADA')
    expect(n.parecer).toBe('SEM_PRAZO')
  })
})
