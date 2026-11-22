// Migração 0008: apagar TPE com apontamentos já excluídos, dias atípicos no cálculo
// e funções de equipe (cronograma/calendário) para o projetista. Dados fictícios.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, falha, novoBanco } from './harness'

let db: PGlite
let sup: string, ana: string
let rAna: number, rBia: number, t1: number, t2: number

const ap = (q: any, tpe: number, rec: number, dia: string, a: string, b: string) =>
  q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1,$2,$3,$4,$5,'Teste') returning id`, [tpe, rec, dia, a, b])

beforeAll(async () => {
  db = await novoBanco()
  sup = await criarUsuario(db, 'sup@exemplo.test')
  ana = await criarUsuario(db, 'ana@exemplo.test')
  await db.query(`select public.promover_master('sup@exemplo.test')`)
  await como(db, sup, async (q) => {
    rAna = (await q(`insert into recursos (nome) values ('Ana') returning id`))[0].id
    rBia = (await q(`insert into recursos (nome) values ('Bia') returning id`))[0].id
    await q(`insert into custos_hh (recurso_id, valor) values ($1, 50), ($2, 40)`, [rAna, rBia])
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rAna, ana])
    await q(`insert into ordens_servico (os, nome, vendedor) values (61922, 'Cliente', 'VENDEDOR SECRETO')`)
    t1 = (await q(`insert into tpes (codigo, os, principal, grupo, descricao) values ('TPE-001.0', 61922, 'EQ', 'VASO', 'Primeira') returning id`))[0].id
    t2 = (await q(`insert into tpes (codigo, os, principal, grupo, descricao) values ('TPE-002.0', 61922, 'EQ', 'VASO', 'Segunda') returning id`))[0].id
    await q(`select atribuir_tpe($1, $2)`, [t2, rBia])
  })
})

describe('Apagar TPE com apontamentos já excluídos', () => {
  it('apontamento excluído não bloqueia; ativo continua bloqueando', async () => {
    await como(db, sup, async (q) => {
      const id = (await ap(q, t1, rAna, '2026-11-18', '07:00', '12:00'))[0].id
      await q(`select excluir_apontamento($1, 'Lançamento errado')`, [id])
    })
    const r = await como(db, sup, (q) => q(`select excluir_tpe($1) as c`, [t1]))
    expect(r[0].c).toBe('TPE-001.0')
    await como(db, sup, (q) => ap(q, t2, rBia, '2026-11-18', '07:00', '12:00'))
    expect(await falha(db, sup, `select excluir_tpe($1)`, [t2])).toMatch(/1 apontamento/)
  })
})

describe('Feriados e dias atípicos', () => {
  it('cada tipo de dia muda horas normais, extras e adicional', async () => {
    const linhas = await como(db, sup, async (q) => {
      await q(`insert into feriados (data, descricao, tipo, adicional_he) values
        ('2026-11-20', 'Consciência Negra', 'FERIADO', null),
        ('2026-11-23', 'Ponte (sem expediente)', 'NAO_TRABALHADO', 0.6),
        ('2026-11-28', 'Sábado compensado', 'DIA_NORMAL', null),
        ('2026-12-05', 'Sábado com 50%', 'PERCENTUAL', 0.5)
        on conflict (data) do update set descricao = excluded.descricao, tipo = excluded.tipo, adicional_he = excluded.adicional_he`)
      for (const d of ['2026-11-20', '2026-11-23', '2026-11-28', '2026-12-05']) await ap(q, t2, rBia, d, '08:00', '12:00')
      return q(`select dia::text, tipo_dia, adicional::float, horas_normais::float, horas_extras::float from v_apontamentos where dia >= '2026-11-20' order by dia`)
    })
    expect(linhas).toEqual([
      { dia: '2026-11-20', tipo_dia: 'FERIADO', adicional: 1, horas_normais: 0, horas_extras: 4 },
      { dia: '2026-11-23', tipo_dia: 'NÃO TRABALHADO', adicional: 0.6, horas_normais: 0, horas_extras: 4 },
      { dia: '2026-11-28', tipo_dia: 'DIA ÚTIL', adicional: 0.6, horas_normais: 4, horas_extras: 0 },
      { dia: '2026-12-05', tipo_dia: 'SÁBADO', adicional: 0.5, horas_normais: 0, horas_extras: 4 },
    ])
  })
  it('exige percentual nos tipos que usam percentual', async () => {
    expect(await falha(db, sup, `insert into feriados (data, descricao, tipo) values ('2026-12-07', 'x', 'PERCENTUAL')`)).toMatch(/feriados_tipo_chk/)
  })
})

describe('Equipe para o projetista', () => {
  it('vê o cronograma e o calendário de todos, sem custos nem dados comerciais da O.S.', async () => {
    const r = await como(db, ana, async (q) => ({
      tpes: await q(`select * from cronograma_equipe()`),
      cal: await q(`select * from calendario_equipe('2026-11-01', '2026-12-31')`),
      direto: await q(`select * from apontamentos`),
    }))
    expect(r.tpes.map((t: any) => [t.codigo, t.responsavel])).toEqual([['TPE-002.0', 'Bia']])
    expect(Object.keys(r.tpes[0])).not.toContain('vendedor')
    expect(r.cal.length).toBe(5)
    expect(Object.keys(r.cal[0]).some((k) => k.startsWith('custo'))).toBe(false)
    expect(r.direto).toHaveLength(0) // a tabela continua protegida
    expect(await falha(db, ana, `select * from calendario_equipe('2026-01-01', '2026-12-31')`)).toMatch(/máximo de 62 dias/)
  })
})
