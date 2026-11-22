// Backup e restauração de teste em ambiente isolado: pg_dump do banco → restauração num banco
// novo e vazio → verificação de integridade (contagens, hashes, órfãos, RLS, sequência).
// Usa dados fictícios gerados aqui (não depende da planilha real).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgDump } from '@electric-sql/pglite-tools/pg_dump'
import { como, criarUsuario, novoBanco } from './harness'

const VERIFICA = readFileSync('supabase/verificar_integridade.sql', 'utf8')

describe('Backup e restauração', () => {
  it('pg_dump → restauração isolada preserva relações, dados, RLS e sequência', async () => {
    const db = await novoBanco()
    const m = await criarUsuario(db, 'master@exemplo.test')
    const p = await criarUsuario(db, 'proj@exemplo.test')
    await db.query(`select promover_master('master@exemplo.test')`)
    await como(db, m, async (q) => {
      const r = (await q(`insert into recursos (nome) values ('Projetista Fictício') returning id`))[0].id
      await q(`insert into custos_hh (recurso_id, valor) values ($1, 42.5)`, [r])
      await q(`update profiles set recurso_id = $1 where user_id = $2`, [r, p])
      await q(`insert into ordens_servico (os, nome) values (5001, 'Cliente Demo'), (5002, 'Outro Demo')`)
      for (let i = 1; i <= 12; i++) {
        const t = (await q(`insert into tpes (codigo, os, principal, grupo) values ($1, $2, 'EQUIPAMENTO', 'VASO DE PRESSÃO') returning id`,
          [`TPE-${String(i).padStart(3, '0')}.0`, i % 2 ? 5001 : 5002]))[0].id
        await q(`select atribuir_tpe($1, $2)`, [t, r])
        for (let d = 1; d <= 5; d++) {
          await q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1, $2, $3::date, '07:00', $4::time, 'Atividade demo')`,
            [t, r, `2026-10-${String(d + (i % 3) * 7).padStart(2, '0')}`, `${10 + (i % 4)}:30`])
        }
      }
    })
    const antes = (await db.query<any>(VERIFICA)).rows

    // 1) backup
    const arquivo = await pgDump({ pg: db, args: ['--no-owner'] })
    const sql = await arquivo.text()
    expect(sql).toContain('CREATE TABLE public.apontamentos')
    expect(sql.length).toBeGreaterThan(10000)

    // 2) restauração num ambiente novo e isolado (só os papéis do Supabase pré-criados)
    const novo = new PGlite()
    await novo.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`)
    await novo.exec(sql)
    await novo.exec('set search_path to public; set row_security to on')  // o arquivo do pg_dump altera essas opções da sessão
    const depois = (await novo.query<any>(VERIFICA)).rows

    // 3) verificação
    expect(depois.every((r) => r.ok)).toBe(true)
    expect(depois.map((r) => [r.verificacao, r.valor])).toEqual(antes.map((r) => [r.verificacao, r.valor]))
    expect(depois.find((r) => r.verificacao === 'contagem_apontamentos').valor).toBe('60')
    // a restauração mantém o isolamento: projetista restaurado só vê o que é seu
    await novo.query(`select set_config('request.jwt.claim.sub', $1, false)`, [p])
    await novo.exec('set role authenticated')
    const vis = await novo.query<any>(`select count(*)::int n from apontamentos`)
    expect(vis.rows[0].n).toBe(60)
    await novo.query(`select set_config('request.jwt.claim.sub', $1, false)`, ['00000000-0000-4000-8000-000000000000'])
    const nada = await novo.query<any>(`select count(*)::int n from apontamentos`)
    expect(nada.rows[0].n).toBe(0)
  })
})
