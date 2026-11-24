// Migração 0010: perfil Observador (somente leitura) e exclusão de projetista sem vínculos. Dados fictícios.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, falha, novoBanco } from './harness'

let db: PGlite
let sup: string, ana: string, obs: string, rAna: number, rLivre: number, tpe: number

beforeAll(async () => {
  db = await novoBanco()
  sup = await criarUsuario(db, 'sup@exemplo.test')
  ana = await criarUsuario(db, 'ana@exemplo.test')
  obs = await criarUsuario(db, 'obs@exemplo.test')
  await db.query(`select public.promover_master('sup@exemplo.test')`)
  await como(db, sup, async (q) => {
    rAna = (await q(`insert into recursos (nome) values ('Ana') returning id`))[0].id
    rLivre = (await q(`insert into recursos (nome) values ('Teste') returning id`))[0].id
    await q(`insert into custos_hh (recurso_id, valor, vigente_desde) values ($1, 50, '2026-01-01'), ($2, 40, '2026-01-01')`, [rAna, rLivre])
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rAna, ana])
    await q(`update profiles set papel = 'observador', recurso_id = $1 where user_id = $2`, [rLivre, obs]) // vínculo é descartado
    await q(`update profiles set recurso_id = null where user_id = $1`, [obs])
    await q(`insert into ordens_servico (os, nome) values (61922, 'Cliente')`)
    tpe = (await q(`insert into tpes (codigo, os, principal, grupo) values ('TPE-001.0', 61922, 'EQ', 'VASO') returning id`))[0].id
    await q(`select atribuir_tpe($1, $2)`, [tpe, rAna])
  })
  await como(db, ana, (q) => q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, current_date, '08:00', '10:00', 'Desenho')`, [tpe, rAna]))
})

describe('Observador', () => {
  it('lê O.S., TPEs, apontamentos e custos como o Supervisor', async () => {
    const r = await como(db, obs, async (q) => ({
      os: await q(`select os from ordens_servico`),
      tpes: await q(`select codigo, responsavel from v_tpes`),
      aps: await q(`select horas_totais::float h, custo_total::float c from v_apontamentos`),
    }))
    expect(r.os).toEqual([{ os: 61922 }])
    expect(r.tpes).toEqual([{ codigo: 'TPE-001.0', responsavel: 'Ana' }])
    expect(r.aps[0].h).toBe(2)
    expect(r.aps[0].c).toBeGreaterThan(0)
  })
  it('não grava nada', async () => {
    expect(await falha(db, obs, `insert into ordens_servico (os, nome) values (1, 'X')`)).toMatch(/row-level security/)
    const alteradas = await como(db, obs, (q) => q(`update tpes set descricao = 'x' where id = $1 returning id`, [tpe]))
    expect(alteradas).toEqual([]) // a RLS não deixa alterar nenhuma linha
    expect(await falha(db, obs, `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, current_date, '10:00', '11:00', 'x')`, [tpe, rAna])).toMatch(/row-level security|sem projetista/)
    expect(await falha(db, obs, `select atribuir_tpe($1, null)`, [tpe])).toMatch(/Master|Supervisor|permission/i)
    expect(await falha(db, obs, `select excluir_recurso($1)`, [rLivre])).toMatch(/Somente o Supervisor/)
  })
  it('não tem projetista vinculado', async () => {
    const r = await como(db, sup, (q) => q(`select papel::text, recurso_id from profiles where user_id = $1`, [obs]))
    expect(r).toEqual([{ papel: 'observador', recurso_id: null }])
  })
})

describe('Apagar projetista', () => {
  it('bloqueia quem tem TPE vinculada e apaga quem não tem', async () => {
    expect(await falha(db, sup, `select excluir_recurso($1)`, [rAna])).toMatch(/Ana não pode ser apagado porque tem 1 TPE\(s\) vinculada\(s\): TPE-001.0/)
    const r = await como(db, sup, (q) => q(`select excluir_recurso($1) as nome`, [rLivre]))
    expect(r[0].nome).toBe('Teste')
    const resto = await como(db, sup, (q) => q(`select count(*)::int n from custos_hh where recurso_id = $1`, [rLivre]))
    expect(resto[0].n).toBe(0)
  })
})
