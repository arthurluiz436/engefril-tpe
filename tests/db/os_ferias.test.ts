// Migração 0009: apagar O.S., data de finalização, férias e prazo da O.S. no cronograma. Dados fictícios.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, falha, novoBanco } from './harness'

let db: PGlite
let sup: string, ana: string, rAna: number

beforeAll(async () => {
  db = await novoBanco()
  sup = await criarUsuario(db, 'sup@exemplo.test')
  ana = await criarUsuario(db, 'ana@exemplo.test')
  await db.query(`select public.promover_master('sup@exemplo.test')`)
  await como(db, sup, async (q) => {
    rAna = (await q(`insert into recursos (nome) values ('Ana') returning id`))[0].id
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rAna, ana])
    await q(`insert into ordens_servico (os, nome, prazo_final) values (61922, 'Com TPE', '2026-12-20'), (70001, 'Vazia', null)`)
    const t = (await q(`insert into tpes (codigo, os, principal, grupo) values ('TPE-001.0', 61922, 'EQ', 'VASO') returning id`))[0].id
    await q(`select atribuir_tpe($1, $2)`, [t, rAna])
  })
})

describe('Apagar O.S.', () => {
  it('bloqueia O.S. com TPE e apaga a O.S. sem vínculo', async () => {
    expect(await falha(db, sup, `select excluir_os(61922)`)).toMatch(/061922 não pode ser apagada porque tem 1 TPE\(s\) vinculada\(s\): TPE-001.0/)
    expect(await falha(db, ana, `select excluir_os(70001)`)).toMatch(/Somente o Supervisor|permission denied/)
    const r = await como(db, sup, (q) => q(`select excluir_os(70001) as os`))
    expect(r[0].os).toBe(70001)
  })
  it('guarda a data de finalização', async () => {
    await como(db, sup, (q) => q(`update ordens_servico set status = 'FINALIZADA', data_finalizacao = '2026-12-18' where os = 61922`))
    const r = await como(db, sup, (q) => q(`select data_finalizacao::text from ordens_servico where os = 61922`))
    expect(r[0].data_finalizacao).toBe('2026-12-18')
  })
})

describe('Férias', () => {
  it('Supervisor cadastra; projetista só lê', async () => {
    await como(db, sup, (q) => q(`insert into ausencias (recurso_id, inicio, fim, observacao) values ($1, '2026-12-07', '2026-12-18', 'Férias')`, [rAna]))
    const r = await como(db, ana, (q) => q(`select inicio::text, fim::text from ausencias`))
    expect(r).toEqual([{ inicio: '2026-12-07', fim: '2026-12-18' }])
    expect(await falha(db, ana, `insert into ausencias (recurso_id, inicio, fim) values ($1, '2027-01-04', '2027-01-08')`, [rAna])).toMatch(/row-level security/)
    expect(await falha(db, sup, `insert into ausencias (recurso_id, inicio, fim) values ($1, '2027-01-08', '2027-01-04')`, [rAna])).toMatch(/check/)
  })
})

describe('Cronograma da equipe', () => {
  it('traz o prazo final da O.S. de cada TPE', async () => {
    const r = await como(db, ana, (q) => q(`select codigo, os_prazo_final::text from cronograma_equipe()`))
    expect(r).toEqual([{ codigo: 'TPE-001.0', os_prazo_final: '2026-12-20' }])
  })
})
