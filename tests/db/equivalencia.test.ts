// Importa a planilha ORIGINAL (VER_035) pelo mesmo caminho do aplicativo — leitura no "navegador"
// (importador.ts) + função protegida processar_importacao — e compara cada número com o Excel.
// Requer private/TAREF_PROJ_ENGEFRIL_VER_035.xlsx e private/fixture_excel.json (fora do git).
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import type { PGlite } from '@electric-sql/pglite'
import { como, criarUsuario, novoBanco } from './harness'
import { lerPlanilha, type PayloadImportacao } from '../../src/lib/importador'
import { calcularApontamento, indicadores, PARAMETROS_VER035 } from '../../src/lib/calculo'

const ARQ = 'private/TAREF_PROJ_ENGEFRIL_VER_035.xlsx'
const FIX = 'private/fixture_excel.json'
const ESP = 'private/esperado.json' // nomes, custos H/H e correções esperadas (confidencial)
const temDados = existsSync(ARQ) && existsSync(FIX) && existsSync(ESP)
const d = temDados ? describe : describe.skip

let db: PGlite, master: string, payload: PayloadImportacao, fx: any, esp: any, avisos: string[]
const imp = (p: unknown, confirmar: boolean) => como(db, master, (q) => q(`select processar_importacao($1::jsonb, $2) as r`, [JSON.stringify(p), confirmar])).then((r) => r[0].r)

beforeAll(async () => {
  if (!temDados) return
  fx = JSON.parse(readFileSync(FIX, 'utf8'))
  esp = JSON.parse(readFileSync(ESP, 'utf8'))
  db = await novoBanco()
  master = await criarUsuario(db, 'master@exemplo.test')
  await db.query(`select promover_master('master@exemplo.test')`)
  const buf = readFileSync(ARQ)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const leitura = lerPlanilha(wb as any, 'TAREF_PROJ_ENGEFRIL_VER_035.xlsx', createHash('sha256').update(buf).digest('hex'))
  payload = leitura.payload; avisos = leitura.avisos
})

d('Importação da VER_035', () => {
  it('reconhece o modelo e lê todas as linhas', () => {
    expect(payload.modelo).toBe('VER_035')
    expect(payload.os).toHaveLength(40); expect(payload.tpes).toHaveLength(181); expect(payload.apontamentos).toHaveLength(442)
    expect(payload.recursos.map((r) => r.nome).sort()).toEqual(Object.keys(fx.recursos).sort())
    expect(payload.recursos.find((r) => r.nome === esp.inicio_08)?.inicio_padrao).toBe('08:00')
    for (const r of payload.recursos) expect(r.custo).toBe(esp.custos[r.nome]) // custos lidos da aba REF
    expect(payload.feriados.length).toBe(13)
    expect(avisos.some((a) => a.includes(`${esp.inicio_08} = 08:00`))).toBe(true)
  })
  it('prévia não grava nada', async () => {
    const r = await imp(payload, false)
    expect(r.lote_id).toBeNull()
    expect(r.resumo.apontamentos.inserido).toBe(442); expect(r.resumo.apontamentos.rejeitado ?? 0).toBe(0)
    expect(r.resumo.tpes.inserido).toBe(181); expect(r.resumo.os.inserido).toBe(40)
    const n = await db.query<any>('select count(*)::int n from apontamentos')
    expect(n.rows[0].n).toBe(0)
  })
  it('confirmação grava com proveniência', async () => {
    const r = await imp(payload, true)
    expect(r.lote_id).toBeGreaterThan(0)
    const n = await db.query<any>(`select (select count(*) from apontamentos)::int a, (select count(*) from tpes)::int t,
      (select count(*) from tpes where status = 'FINALIZADA')::int f, (select count(*) from import_itens where lote_id = $1)::int i`, [r.lote_id])
    expect(n.rows[0]).toEqual({ a: 442, t: 181, f: 148, i: 40 + 181 + 442 + 4 })
    // grupos padronizados com o texto original preservado
    const g = await db.query<any>(`select count(*)::int n from tpes where grupo <> grupo_original`)
    expect(g.rows[0].n).toBe(43) // 13+1+8+4+12+1+1+2+1 linhas com grafia padronizada pelo de-para
  })
  it('SQL (v_apontamentos) reproduz horas e custos do Excel nos 442 lançamentos', async () => {
    const rows = await como(db, master, (q) => q(`select seq, tipo_dia, to_char(inicio_jornada,'HH24:MI') ij, horas_normais, horas_extras, custo_normal, custo_he, custo_total from v_apontamentos`))
    const porSeq = new Map(rows.map((r) => [Number(r.seq), r]))
    let difs = 0
    for (const e of fx.apontamentos) {
      const w = porSeq.get(e.seq)!
      const ok = w && w.tipo_dia === e.tipo_dia && w.ij === e.inicio_jornada &&
        Math.abs(Number(w.horas_normais) - e.horas_normais) < 1e-6 && Math.abs(Number(w.horas_extras) - e.horas_extras) < 1e-6 &&
        Math.abs(Number(w.custo_total) - e.custo_total) < 1e-6 && Math.abs(Number(w.custo_he) - e.custo_he) < 1e-6
      if (!ok) difs++
    }
    expect(difs).toBe(0)
  })
  it('Motor TypeScript reproduz o Excel nos 442 lançamentos', () => {
    const custos: Record<string, number> = Object.fromEntries(payload.recursos.map((r) => [r.nome, r.custo as number]))
    const ini: Record<string, string> = Object.fromEntries(payload.recursos.filter((r) => r.inicio_padrao).map((r) => [r.nome, r.inicio_padrao as string]))
    const fer = new Set(payload.feriados.map((f) => f.data))
    let difs = 0
    for (const e of fx.apontamentos) {
      const doDia = fx.apontamentos.filter((x: any) => x.recurso === e.recurso && x.dia === e.dia).map((x: any) => x.hora_inicio)
      const r = calcularApontamento(e, PARAMETROS_VER035, fer, ini[e.recurso] ?? '07:00', doDia, custos[e.recurso])
      if (Math.abs(r.horas_normais - e.horas_normais) > 1e-9 || Math.abs(r.horas_extras - e.horas_extras) > 1e-9 ||
          Math.abs((r.custo_total ?? 0) - e.custo_total) > 1e-6 || r.tipo_dia !== e.tipo_dia || r.inicio_jornada !== e.inicio_jornada) difs++
    }
    expect(difs).toBe(0)
  })
  it('Indicadores (KPI) batem com o Excel, exceto as correções documentadas', async () => {
    const aps = (await como(db, master, (q) => q(`select * from v_apontamentos`))).map((r) => ({ ...r, dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : r.dia,
      horas_normais: Number(r.horas_normais), horas_extras: Number(r.horas_extras), horas_totais: Number(r.horas_totais),
      custo_normal: Number(r.custo_normal), custo_he: Number(r.custo_he), custo_total: Number(r.custo_total) }))
    const tpes = (await como(db, master, (q) => q(`select codigo, os, principal, grupo, status, to_char(data_inicio,'YYYY-MM-DD') data_inicio, to_char(data_fim,'YYYY-MM-DD') data_fim, revisao from tpes`)))
    const oss = await como(db, master, (q) => q(`select os, nome, nivel, vendedor, classificacao from ordens_servico`))
    const fer = new Set(payload.feriados.map((f) => f.data))
    const k = indicadores(aps as any, tpes as any, oss as any, Object.keys(fx.recursos), PARAMETROS_VER035, fer)
    const K = fx.kpi
    const perto = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)
    expect(k.resumo.inicio).toBe(K.B5); expect(k.resumo.fim).toBe(K.B6)
    expect(k.resumo.tpes).toBe(K.B7); expect(k.resumo.finalizados).toBe(K.B8); expect(k.resumo.abertos).toBe(K.B9)
    expect(k.resumo.reaberturas).toBe(K.B10); perto(k.resumo.indice_reabertura, K.B11); perto(k.resumo.os_atendidas, K.B12)
    perto(k.resumo.horas, K.B13); perto(k.resumo.horas_normais, K.B14); perto(k.resumo.horas_extras, K.B15); perto(k.resumo.pct_he, K.B16)
    perto(k.resumo.tempo_medio_tpe, K.B17); perto(k.resumo.tempo_medio_os, K.B18); perto(k.resumo.prazo_medio, K.B19)
    perto(k.custos.total, K.B156); perto(k.custos.normal, K.B157); perto(k.custos.extra, K.B158); perto(k.custos.pct_extra, K.B159)
    perto(k.custos.he_dia_util, K.B160); perto(k.custos.he_sabado, K.B161); perto(k.custos.he_dom_feriado, K.B162)
    perto(k.custos.por_hora, K.B163); perto(k.custos.por_tpe, K.B164); perto(k.custos.por_os, K.B165)
    for (const [p, e] of Object.entries<any>(fx.principal)) {
      const w = k.porPrincipal.find((x) => x.chave === p)!
      expect(w.qtd_tpes).toBe(e.qtd); expect(w.finalizados).toBe(e.fin); perto(w.horas, e.horas); perto(w.horas_extras, e.he)
      perto(w.tempo_medio_tpe, e.tm); perto(w.prazo_medio, e.prazo)
    }
    for (const [m, e] of Object.entries<any>(fx.meses)) {
      const w = k.meses.find((x) => x.mes === m)!
      perto(w.capacidade, e.capacidade); perto(w.equipe, e.equipe); perto(w.extras, e.extras)
    }
    for (const [r, e] of Object.entries<any>(fx.recursos)) {
      const w = k.porRecurso.find((x) => x.recurso === r)!
      perto(w.dias, e.dias); perto(w.capacidade, e.capacidade); perto(w.horas, e.horas); perto(w.alocacao, e.alocacao)
      // correção documentada: o Excel contava TPE-xxx e TPE-xxx.0 como TPEs distintas
      const esperado = esp.tpes_corrigidas[r] ?? Math.round(e.tpes)
      expect(w.tpes_atendidos).toBe(esperado)
    }
    for (const [v, e] of Object.entries<any>(fx.vendedor)) {
      const w = k.porVendedor.find((x) => x.chave === v)!
      perto(w.os_atendidas, e.os); expect(w.qtd_tpes).toBe(e.qtd); perto(w.horas, e.horas); expect(w.reaberturas).toBe(e.reab)
    }
    // correção documentada: média/mediana por O.S. agora incluem as O.S. que faltavam na lista fixa
    perto(k.tempo_medio_por_os, 2877.75 / 37); expect(k.mediana_por_os).toBe(25)
  })
  it('reimportar o mesmo arquivo detecta duplicidades e não grava nada em silêncio', async () => {
    const r = await imp(payload, false)
    expect(r.ja_importado).toBe(true)
    expect(r.resumo.apontamentos.duplicado).toBe(442); expect(r.resumo.apontamentos.inserido ?? 0).toBe(0)
    expect(r.resumo.tpes.inserido ?? 0).toBe(0); expect(r.resumo.os.inserido ?? 0).toBe(0)
  })
  it('reversão do lote remove exatamente o que entrou', async () => {
    const lote = (await db.query<any>(`select id from import_lotes where status = 'confirmado'`)).rows[0].id
    const r = await como(db, master, (q) => q(`select reverter_lote($1) as r`, [lote]))
    expect(r[0].r).toEqual({ apontamentos_removidos: 442, tpes_removidas: 181, os_removidas: 40 })
    const n = await db.query<any>(`select (select count(*) from apontamentos)::int a, (select status from import_lotes where id = $1) s`, [lote])
    expect(n.rows[0]).toEqual({ a: 0, s: 'revertido' })
  })
})
