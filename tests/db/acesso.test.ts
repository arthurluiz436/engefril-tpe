// Testes obrigatórios de acesso (seção 14.2 do documento de requisitos), executados contra
// PostgreSQL real com as migrações do projeto. Dados 100% fictícios.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, falha, novoBanco } from './harness'

let db: PGlite
let master: string, ana: string, bruno: string, carla: string
let rAna: number, rBruno: number, rCarla: number, t1: number, t2: number

beforeAll(async () => {
  db = await novoBanco()
  master = await criarUsuario(db, 'master@exemplo.test')
  ana = await criarUsuario(db, 'ana@exemplo.test')
  bruno = await criarUsuario(db, 'bruno@exemplo.test')
  carla = await criarUsuario(db, 'carla@exemplo.test')
  await db.query(`select public.promover_master('master@exemplo.test')`)
  await como(db, master, async (q) => {
    rAna = (await q(`insert into recursos (nome) values ('Ana Teste') returning id`))[0].id
    rBruno = (await q(`insert into recursos (nome, inicio_padrao) values ('Bruno Teste', '08:00') returning id`))[0].id
    rCarla = (await q(`insert into recursos (nome) values ('Carla Teste') returning id`))[0].id
    await q(`insert into custos_hh (recurso_id, valor) values ($1, 50), ($2, 60), ($3, 40)`, [rAna, rBruno, rCarla])
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rAna, ana])
    await q(`update profiles set recurso_id = $1 where user_id = $2`, [rBruno, bruno])
    await q(`update profiles set recurso_id = $1, ativo = false where user_id = $2`, [rCarla, carla])
    await q(`insert into ordens_servico (os, nome, vendedor, nivel) values (1001, 'Cliente Fictício', 'VENDEDOR X', 'GRANDE')`)
    t1 = (await q(`insert into tpes (codigo, os, principal, grupo, descricao) values ('TPE-001.0', 1001, 'EQUIPAMENTO', 'VASO DE PRESSÃO', 'Vaso teste') returning id`))[0].id
    t2 = (await q(`insert into tpes (codigo, os, principal, grupo, descricao) values ('TPE-002.0', 1001, 'EXECUTIVO', 'PLANO DE CARGA', 'Plano teste') returning id`))[0].id
    await q(`select atribuir_tpe($1, $2)`, [t1, rAna])
    await q(`select atribuir_tpe($1, $2)`, [t2, rBruno])
    await q(`select atribuir_tpe($1, $2)`, [t2, rCarla]) // reatribui (encerra a de Bruno)
    await q(`select atribuir_tpe($1, $2)`, [t2, rBruno])
  })
})

const hoje = () => new Date().toISOString().slice(0, 10)

describe('Sessão não autenticada', () => {
  it('não lê nenhuma tabela privada', async () => {
    for (const t of ['apontamentos', 'tpes', 'ordens_servico', 'custos_hh', 'profiles', 'v_apontamentos', 'auditoria']) {
      expect(await falha(db, null, `select * from ${t}`)).toMatch(/permission denied/i)
    }
  })
  it('não executa funções administrativas', async () => {
    expect(await falha(db, null, `select processar_importacao('{}'::jsonb)`)).toMatch(/permission denied/i)
  })
})

describe('Isolamento entre projetistas', () => {
  it('Projetista vê apenas as próprias tarefas e TPEs', async () => {
    const r = await como(db, ana, async (q) => ({ tarefas: await q(`select codigo from minhas_tarefas()`), tpes: await q(`select codigo from tpes`) }))
    expect(r.tarefas.map((x) => x.codigo)).toEqual(['TPE-001.0'])
    expect(r.tpes.map((x) => x.codigo)).toEqual(['TPE-001.0'])
  })
  it('Projetista não lê cadastro de O.S., custos, auditoria nem perfis de terceiros', async () => {
    const r = await como(db, ana, async (q) => ({
      os: await q(`select * from ordens_servico`), custos: await q(`select * from custos_hh`),
      aud: await q(`select * from auditoria`), perfis: await q(`select user_id from profiles`),
    }))
    expect(r.os).toHaveLength(0); expect(r.custos).toHaveLength(0); expect(r.aud).toHaveLength(0)
    expect(r.perfis.map((p) => p.user_id)).toEqual([ana])
  })
  it('Apontamento grava o recurso da identidade autenticada, mesmo se o cliente enviar outro (anti-falsificação)', async () => {
    const id = await como(db, ana, async (q) => (await q(
      `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, $3, '08:00', '12:00', 'Revisão do desenho') returning id, recurso_id`,
      [t1, rBruno, hoje()]))[0])
    expect(Number(id.recurso_id)).toBe(Number(rAna))
  })
  it('Projetista não lança em TPE que não está atribuída a ele', async () => {
    expect(await falha(db, ana, `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, $3, '08:00', '09:00', 'Tentativa')`,
      [t2, rAna, hoje()])).toMatch(/row-level security/i)
  })
  it('Projetista B não lista, não altera e não exclui apontamentos do Projetista A', async () => {
    const r = await como(db, bruno, async (q) => ({
      ver: await q(`select * from apontamentos where recurso_id = $1`, [rAna]),
      vview: await q(`select * from v_apontamentos where recurso_id = $1`, [rAna]),
      upd: await q(`update apontamentos set descricao = 'alterado por B' where recurso_id = $1 returning id`, [rAna]),
    }))
    expect(r.ver).toHaveLength(0); expect(r.vview).toHaveLength(0); expect(r.upd).toHaveLength(0)
    expect(await falha(db, bruno, `delete from apontamentos where recurso_id = $1`, [rAna])).toMatch(/permission denied/i)
  })
  it('Projetista não troca o recurso do próprio apontamento', async () => {
    expect(await falha(db, ana, `update apontamentos set recurso_id = $1 where recurso_id = $2`, [rBruno, rAna])).toMatch(/não permitida|row-level/i)
  })
  it('Projetista vê horas, mas não vê custos (custo H/H é restrito ao Master)', async () => {
    const a = await como(db, ana, (q) => q(`select horas_totais, custo_total from v_apontamentos`))
    expect(Number(a[0].horas_totais)).toBe(4) // 08–12: não cruza o almoço
    expect(a[0].custo_total).toBeNull()
    const m = await como(db, master, (q) => q(`select custo_total from v_apontamentos`))
    expect(Number(m[0].custo_total)).toBeGreaterThan(0)
  })
  it('Usuário desativado não vê nada, mesmo com tarefa atribuída', async () => {
    await como(db, master, (q) => q(`select atribuir_tpe($1, $2)`, [t2, rCarla]))
    const r = await como(db, carla, async (q) => ({ t: await q(`select * from minhas_tarefas()`), tp: await q(`select * from tpes`) }))
    expect(r.t).toHaveLength(0); expect(r.tp).toHaveLength(0)
    await como(db, master, (q) => q(`select atribuir_tpe($1, $2)`, [t2, rBruno]))
  })
})

describe('Operações administrativas', () => {
  it('Projetista não executa importação, atribuição, reordenação, exclusão nem promoção a Master (manipulando a API)', async () => {
    expect(await falha(db, ana, `select processar_importacao($1::jsonb, true)`, [JSON.stringify({ sha256: 'a'.repeat(64) })])).toMatch(/Somente o Master/)
    expect(await falha(db, ana, `select atribuir_tpe($1, $2)`, [t2, rAna])).toMatch(/Somente o Master/)
    expect(await falha(db, ana, `select reordenar_sequencia($1, array[$2]::bigint[])`, [rAna, t1])).toMatch(/Somente o Master/)
    expect(await falha(db, ana, `select excluir_apontamento(1, 'motivo qualquer')`)).toMatch(/Somente o Master/)
    expect(await falha(db, ana, `select promover_master('ana@exemplo.test')`)).toMatch(/permission denied/i)
    expect(await falha(db, ana, `update profiles set papel = 'master' where user_id = $1`, [ana])).toMatch(/Somente o Master/)
    expect(await falha(db, ana, `insert into visualizacoes (conjunto, nome, config) values ('tpes', 'x', '{}')`)).toMatch(/row-level/i)
  })
  it('Projetista não altera status de TPE (status independe do apontamento)', async () => {
    const r = await como(db, ana, (q) => q(`update tpes set status = 'FINALIZADA', data_fim = current_date where id = $1 returning id`, [t1]))
    expect(r).toHaveLength(0)
  })
  it('Exclusão de apontamento exige motivo e fica na auditoria (sem apagar o registro)', async () => {
    const id = (await como(db, ana, (q) => q(`select id from apontamentos limit 1`)))[0].id
    expect(await falha(db, master, `select excluir_apontamento($1, '')`, [id])).toMatch(/motivo/)
    await como(db, master, (q) => q(`select excluir_apontamento($1, 'Lançamento em duplicidade')`, [id]))
    const r = await db.query<any>(`select excluido_em, motivo_exclusao from apontamentos where id = $1`, [id])
    expect(r.rows[0].excluido_em).not.toBeNull()
    const aud = await como(db, master, (q) => q(`select acao from auditoria where tabela = 'apontamentos' and registro = $1::text order by id`, [id]))
    expect(aud.map((x) => x.acao)).toEqual(['INSERT', 'UPDATE'])
  })
  it('Último Master ativo não pode ser rebaixado', async () => {
    expect(await falha(db, master, `update profiles set papel = 'projetista' where user_id = $1`, [master])).toMatch(/último Master/)
  })
  it('Reenvio do mesmo lançamento (duplo clique) é barrado', async () => {
    const req = '11111111-1111-4111-8111-111111111111'
    await como(db, ana, (q) => q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao, client_request_id) values ($1,$2,$3,'14:00','15:00','Cálculo de espessura',$4)`, [t1, rAna, hoje(), req]))
    expect(await falha(db, ana, `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao, client_request_id) values ($1,$2,$3,'14:00','15:00','Cálculo de espessura',$4)`, [t1, rAna, hoje(), req])).toMatch(/duplicate key/i)
    expect(await falha(db, ana, `insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1,$2,$3,'14:00','15:00','Mesmo horário')`, [t1, rAna, hoje()])).toMatch(/duplicate key/i)
  })
  it('Reatribuição preserva o histórico: Ana deixa de ver a tarefa ativa, mas mantém os próprios apontamentos', async () => {
    await como(db, master, (q) => q(`select atribuir_tpe($1, $2)`, [t1, rBruno]))
    const r = await como(db, ana, async (q) => ({ t: await q(`select * from minhas_tarefas()`), a: await q(`select * from apontamentos`), tp: await q(`select codigo from tpes`) }))
    expect(r.t).toHaveLength(0); expect(r.a.length).toBeGreaterThan(0); expect(r.tp.map((x) => x.codigo)).toEqual(['TPE-001.0'])
    const h = await como(db, master, (q) => q(`select recurso_id, ativa from atribuicoes where tpe_id = $1 order by id`, [t1]))
    expect(h.map((x) => x.ativa)).toEqual([false, true])
  })
})
