// Jornada flexível no banco: a view v_apontamentos usa o início informado no dia.
import { describe, expect, it } from 'vitest'
import { como, criarUsuario, novoBanco } from './harness'

describe('Jornada flexível (view v_apontamentos)', () => {
  it('início informado vale para todos os lançamentos do dia; sem ele, a regra antiga continua', async () => {
    const db = await novoBanco()
    const m = await criarUsuario(db, 'sup@exemplo.test')
    await db.query(`select promover_master('sup@exemplo.test')`)
    const r = await como(db, m, async (q) => {
      const rec = (await q(`insert into recursos (nome, jornada_flexivel) values ('Flex', true) returning id, inicios_flexiveis`))[0]
      await q(`insert into ordens_servico (os, nome) values (61922, 'Cliente')`)
      const t = (await q(`insert into tpes (codigo, os, principal, grupo) values ('TPE-001.0', 61922, 'EQUIPAMENTO', 'VASO') returning id`))[0].id
      // quarta-feira: 08–12 informando jornada 08:00 e 13–18 sem informar (o dia já tem a informação)
      await q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao, inicio_jornada_informado) values ($1,$2,'2026-11-18','08:00','12:00','Manhã','08:00')`, [t, rec.id])
      await q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1,$2,'2026-11-18','13:00','18:00','Tarde')`, [t, rec.id])
      // quinta-feira sem informação: 08–18 → jornada padrão 07–17 → 1 h extra
      await q(`insert into apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao) values ($1,$2,'2026-11-19','08:00','18:00','Dia')`, [t, rec.id])
      return { rec, linhas: await q(`select dia::text, hora_inicio::text, inicio_jornada::text, fim_jornada::text, horas_normais::float, horas_extras::float from v_apontamentos order by dia, hora_inicio`) }
    })
    expect(r.rec.inicios_flexiveis).toBeTruthy()
    expect(r.linhas.map((l: any) => [l.dia, l.inicio_jornada.slice(0, 5), l.fim_jornada.slice(0, 5), l.horas_normais, l.horas_extras])).toEqual([
      ['2026-11-18', '08:00', '18:00', 4, 0],
      ['2026-11-18', '08:00', '18:00', 5, 0],
      ['2026-11-19', '07:00', '17:00', 8, 1],
    ])
    await expect(como(db, m, (q) => q(`update apontamentos set inicio_jornada_informado = '15:00' where dia = '2026-11-19'`))).rejects.toThrow(/apontamentos_inicio_jornada_chk/)
  })
})
