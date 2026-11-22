// Predecessora, cor do projetista e exclusão de TPE (migração 0007). Dados fictícios.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, falha, novoBanco } from './harness'

let db: PGlite
let sup: string, ana: string
let rAna: number, tA: number, tB: number

const hoje = () => new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  db = await novoBanco()
  sup = await criarUsuario(db, 'sup@exemplo.test')
  ana = await criarUsuario(db, 'ana@exemplo.test')
  await db.query(`select public.promover_master('sup@exemplo.test')`)
  await como(db, sup, async (q) => {
    rAna = (await q(`insert into recursos (nome) values ('Ana') returning id`))[0].id
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rAna, ana])
    await q(`insert into ordens_servico (os, nome) values (61922, 'Cliente')`)
    tA = (await q(`insert into tpes (codigo, os, principal, grupo, descricao) values ('TPE-001.0', 61922, 'EQUIPAMENTO', 'VASO', 'Base') returning id`))[0].id
    tB = (await q(`insert into tpes (codigo, os, principal, grupo, descricao, predecessora_id) values ('TPE-002.0', 61922, 'EQUIPAMENTO', 'VASO', 'Depende da 001', $1) returning id`, [tA]))[0].id
    await q(`select atribuir_tpe($1, $2)`, [tB, rAna])
  })
})

describe('Cor do projetista', () => {
  it('recebe uma cor padrão e aceita só #RRGGBB', async () => {
    const r = await como(db, sup, (q) => q(`select cor from recursos where id = $1`, [rAna]))
    expect(r[0].cor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(await falha(db, sup, `update recursos set cor = 'azul' where id = $1`, [rAna])).toMatch(/recursos_cor_chk/)
  })
})

describe('Predecessora', () => {
  it('projetista não aponta e Supervisor não inicia enquanto a predecessora não começou', async () => {
    const t = await como(db, ana, (q) => q(`select codigo, predecessora_codigo, predecessora_liberada from minhas_tarefas()`))
    expect(t).toEqual([{ codigo: 'TPE-002.0', predecessora_codigo: 'TPE-001.0', predecessora_liberada: false }])
    expect(await falha(db, ana, `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, $3, '08:00', '09:00', 'Tentativa')`, [tB, rAna, hoje()]))
      .toMatch(/row-level security/i)
    expect(await falha(db, sup, `update tpes set status = 'EM ANDAMENTO' where id = $1`, [tB])).toMatch(/predecessora TPE-001.0/)
  })
  it('depois que a predecessora é iniciada, libera apontamento e início', async () => {
    await como(db, sup, (q) => q(`update tpes set status = 'EM ANDAMENTO' where id = $1`, [tA]))
    const t = await como(db, ana, (q) => q(`select predecessora_liberada from minhas_tarefas()`))
    expect(t[0].predecessora_liberada).toBe(true)
    await como(db, ana, (q) => q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, $3, '08:00', '09:00', 'Liberado')`, [tB, rAna, hoje()]))
    await como(db, sup, (q) => q(`update tpes set status = 'EM ANDAMENTO' where id = $1`, [tB]))
  })
  it('impede ciclo de predecessoras', async () => {
    expect(await falha(db, sup, `update tpes set predecessora_id = $1 where id = $2`, [tB, tA])).toMatch(/ciclo/)
  })
  it('v_tpes traz a predecessora', async () => {
    const r = await como(db, sup, (q) => q(`select predecessora_id from v_tpes where id = $1`, [tB]))
    expect(Number(r[0].predecessora_id)).toBe(tA)
  })
})

describe('Exclusão de TPE', () => {
  it('bloqueia revisões vinculadas, apontamentos e predecessora; apaga o resto', async () => {
    const [c, c1] = await como(db, sup, async (q) => [
      (await q(`insert into tpes (codigo, os, principal, grupo) values ('TPE-003.0', 61922, 'EQUIPAMENTO', 'VASO') returning id`))[0].id,
      (await q(`insert into tpes (codigo, os, principal, grupo) values ('TPE-003.1', 61922, 'EQUIPAMENTO', 'VASO') returning id`))[0].id,
    ])
    expect(await falha(db, sup, `select excluir_tpe($1)`, [c])).toMatch(/revisões vinculadas \(TPE-003.1\)/)
    expect(await falha(db, sup, `select excluir_tpe($1)`, [tA])).toMatch(/predecessora de TPE-002.0/)
    expect(await falha(db, sup, `select excluir_tpe($1)`, [tB])).toMatch(/1 apontamento/)
    expect(await falha(db, ana, `select excluir_tpe($1)`, [c1])).toMatch(/Somente o Supervisor|permission denied/)
    const r = await como(db, sup, async (q) => [(await q(`select excluir_tpe($1) as c`, [c1]))[0].c, (await q(`select excluir_tpe($1) as c`, [c]))[0].c])
    expect(r).toEqual(['TPE-003.1', 'TPE-003.0'])
    const resto = await como(db, sup, (q) => q(`select codigo from tpes order by codigo`))
    expect(resto.map((x: any) => x.codigo)).toEqual(['TPE-001.0', 'TPE-002.0'])
  })
})
