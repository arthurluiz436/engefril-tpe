import type { ColunaExport } from './exportar'
import { situacaoPrazo } from './dados'
import { tpeBase } from './calculo'

export type Conjunto = 'apontamentos' | 'tpes' | 'os'
export interface Col extends ColunaExport { padrao?: boolean }

export const COLUNAS: Record<Conjunto, Col[]> = {
  apontamentos: [
    { chave: 'seq', rotulo: 'Nº', tipo: 'inteiro', padrao: true, largura: 8 },
    { chave: 'dia', rotulo: 'Data', tipo: 'data', padrao: true },
    { chave: 'tipo_dia', rotulo: 'Tipo de dia', tipo: 'texto' },
    { chave: 'recurso_nome', rotulo: 'Projetista', tipo: 'texto', padrao: true },
    { chave: 'tpe_codigo', rotulo: 'TPE', tipo: 'texto', padrao: true },
    { chave: 'os', rotulo: 'O.S.', tipo: 'inteiro', padrao: true, numFmt: '000000' },
    { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
    { chave: 'principal', rotulo: 'Principal', tipo: 'texto' },
    { chave: 'grupo', rotulo: 'Grupo', tipo: 'texto' },
    { chave: 'hora_inicio', rotulo: 'Início', tipo: 'hora', padrao: true },
    { chave: 'hora_fim', rotulo: 'Fim', tipo: 'hora', padrao: true },
    { chave: 'horas_normais', rotulo: 'Horas normais (h)', tipo: 'horas', padrao: true },
    { chave: 'horas_extras', rotulo: 'Horas extras (h)', tipo: 'horas', padrao: true },
    { chave: 'horas_totais', rotulo: 'Horas totais (h)', tipo: 'horas' },
    { chave: 'custo_hh', rotulo: 'Custo H/H (R$/h)', tipo: 'moeda' },
    { chave: 'custo_normal', rotulo: 'Custo normal (R$)', tipo: 'moeda' },
    { chave: 'custo_he', rotulo: 'Custo H.E. (R$)', tipo: 'moeda' },
    { chave: 'custo_total', rotulo: 'Custo total (R$)', tipo: 'moeda' },
    { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', padrao: true, largura: 50 },
    { chave: 'origem', rotulo: 'Origem', tipo: 'texto' },
    { chave: 'mes', rotulo: 'Mês', tipo: 'data' },
  ],
  tpes: [
    { chave: 'codigo', rotulo: 'TPE', tipo: 'texto', padrao: true },
    { chave: 'os', rotulo: 'O.S.', tipo: 'inteiro', padrao: true, numFmt: '000000' },
    { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto', padrao: true },
    { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
    { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
    { chave: 'nivel', rotulo: 'Nível', tipo: 'texto' },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
    { chave: 'classificacao', rotulo: 'Classificação', tipo: 'texto' },
    { chave: 'principal', rotulo: 'Principal', tipo: 'texto', padrao: true },
    { chave: 'grupo', rotulo: 'Grupo', tipo: 'texto', padrao: true },
    { chave: 'grupo_original', rotulo: 'Grupo (planilha original)', tipo: 'texto' },
    { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', padrao: true, largura: 50 },
    { chave: 'status', rotulo: 'Status', tipo: 'texto', padrao: true },
    { chave: 'responsavel', rotulo: 'Responsável', tipo: 'texto', padrao: true },
    { chave: 'sequencia', rotulo: 'Sequência', tipo: 'inteiro' },
    { chave: 'data_inicio', rotulo: 'Início', tipo: 'data' },
    { chave: 'data_fim', rotulo: 'Finalização', tipo: 'data' },
    { chave: 'prazo', rotulo: 'Prazo', tipo: 'data', padrao: true },
    { chave: 'situacao_prazo', rotulo: 'Situação do prazo', tipo: 'texto', padrao: true },
    { chave: 'horas_normais', rotulo: 'Horas normais (h)', tipo: 'horas' },
    { chave: 'horas_extras', rotulo: 'Horas extras (h)', tipo: 'horas' },
    { chave: 'horas_totais', rotulo: 'Horas totais (h)', tipo: 'horas', padrao: true },
    { chave: 'horas_tarefa', rotulo: 'Horas da TPE com revisões (h)', tipo: 'horas' },
    { chave: 'estimativa_horas', rotulo: 'Horas estimadas (média do grupo)', tipo: 'horas' },
    { chave: 'consumo', rotulo: 'Consumo horas ÷ estimativa', tipo: 'pct' },
    { chave: 'custo_total', rotulo: 'Custo (R$)', tipo: 'moeda' },
    { chave: 'qtd_apontamentos', rotulo: 'Nº de apontamentos', tipo: 'inteiro' },
    { chave: 'primeiro_apontamento', rotulo: '1º apontamento', tipo: 'data' },
    { chave: 'ultimo_apontamento', rotulo: 'Último apontamento', tipo: 'data' },
    { chave: 'arquivada', rotulo: 'Arquivada', tipo: 'texto' },
  ],
  os: [
    { chave: 'os', rotulo: 'O.S.', tipo: 'inteiro', padrao: true, numFmt: '000000' },
    { chave: 'nome', rotulo: 'Cliente', tipo: 'texto', padrao: true },
    { chave: 'uf', rotulo: 'UF', tipo: 'texto', padrao: true },
    { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', padrao: true },
    { chave: 'projeto_engefril', rotulo: 'Projeto Engefril', tipo: 'texto' },
    { chave: 'nivel', rotulo: 'Nível', tipo: 'texto', padrao: true },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'texto', padrao: true },
    { chave: 'classificacao', rotulo: 'Classificação', tipo: 'texto', padrao: true },
    { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
    { chave: 'data_inicio', rotulo: 'Início', tipo: 'data' },
    { chave: 'prazo_final', rotulo: 'Prazo final', tipo: 'data', padrao: true },
    { chave: 'status', rotulo: 'Status', tipo: 'texto', padrao: true },
    { chave: 'qtd_tpes', rotulo: 'TPEs', tipo: 'inteiro', padrao: true },
    { chave: 'tpes_abertas', rotulo: 'TPEs em aberto', tipo: 'inteiro', padrao: true },
    { chave: 'horas', rotulo: 'Horas (h)', tipo: 'horas', padrao: true },
    { chave: 'custo', rotulo: 'Custo (R$)', tipo: 'moeda' },
    { chave: 'arquivada', rotulo: 'Arquivada', tipo: 'texto' },
  ],
}

export const VISOES_PADRAO: Record<Conjunto, { nome: string; colunas: string[]; agrupar?: string }[]> = {
  apontamentos: [
    { nome: 'Geral', colunas: COLUNAS.apontamentos.filter((c) => c.padrao).map((c) => c.chave) },
    { nome: 'Por Projetista', colunas: ['recurso_nome', 'dia', 'tpe_codigo', 'horas_normais', 'horas_extras', 'descricao'], agrupar: 'recurso_nome' },
    { nome: 'Por TPE', colunas: ['tpe_codigo', 'dia', 'recurso_nome', 'horas_totais', 'descricao'], agrupar: 'tpe_codigo' },
    { nome: 'Execução (custos)', colunas: ['dia', 'recurso_nome', 'tpe_codigo', 'tipo_dia', 'horas_normais', 'horas_extras', 'custo_normal', 'custo_he', 'custo_total'] },
    { nome: 'Simplificada', colunas: ['tpe_codigo', 'recurso_nome', 'dia'] },
  ],
  tpes: [
    { nome: 'Geral', colunas: COLUNAS.tpes.filter((c) => c.padrao).map((c) => c.chave) },
    { nome: 'Por Projetista', colunas: ['responsavel', 'sequencia', 'codigo', 'grupo', 'status', 'prazo', 'situacao_prazo'], agrupar: 'responsavel' },
    { nome: 'Prazos', colunas: ['codigo', 'cliente', 'responsavel', 'data_inicio', 'prazo', 'situacao_prazo', 'status'] },
    { nome: 'Execução', colunas: ['codigo', 'principal', 'grupo', 'status', 'horas_totais', 'estimativa_horas', 'consumo', 'custo_total'] },
    { nome: 'Simplificada', colunas: ['codigo', 'descricao', 'status'] },
  ],
  os: [
    { nome: 'Geral', colunas: COLUNAS.os.filter((c) => c.padrao).map((c) => c.chave) },
    { nome: 'Prazos', colunas: ['os', 'nome', 'prazo_final', 'status', 'tpes_abertas'] },
  ],
}

/** Monta as linhas de cada conjunto a partir da base carregada (já filtrada pela RLS). */
export function linhasDe(conj: Conjunto, base: { aps: any[]; tpes: any[]; os: any[]; parametros: any }): Record<string, unknown>[] {
  const osMap = new Map(base.os.map((o) => [o.os, o]))
  if (conj === 'apontamentos') return base.aps.map((a) => ({ ...a, cliente: osMap.get(a.os)?.nome ?? '' }))
  if (conj === 'tpes') {
    // estimativa = média das horas das TPEs com horas do mesmo principal+grupo (regra da coluna T da VER_035),
    // contando cada TPE uma vez só: as horas das revisões (.1, .2…) somam na TPE original.
    const porBase = new Map<string, { h: number; principal: string; grupo: string }>()
    for (const t of base.tpes) {
      const k = tpeBase(t.codigo); const x = porBase.get(k) ?? { h: 0, principal: t.principal, grupo: t.grupo }
      x.h += t.horas_totais; porBase.set(k, x)
    }
    const medias = new Map<string, { s: number; n: number }>()
    const mediasP = new Map<string, { s: number; n: number }>()
    for (const t of porBase.values()) if (t.h > 0) {
      const k = `${t.principal}|${t.grupo}`; const m = medias.get(k) ?? { s: 0, n: 0 }; m.s += t.h; m.n++; medias.set(k, m)
      const mp = mediasP.get(t.principal) ?? { s: 0, n: 0 }; mp.s += t.h; mp.n++; mediasP.set(t.principal, mp)
    }
    return base.tpes.map((t) => {
      const m = medias.get(`${t.principal}|${t.grupo}`) ?? mediasP.get(t.principal)
      const est = m ? m.s / m.n : null
      const hTarefa = porBase.get(tpeBase(t.codigo))?.h ?? t.horas_totais
      return { ...t, horas_tarefa: hTarefa, estimativa_horas: est, consumo: est ? hTarefa / est : null,
        situacao_prazo: situacaoPrazo(t.prazo, t.status), arquivada: t.arquivada ? 'SIM' : '' }
    })
  }
  const lim = Number(base.parametros?.os_interna_limite ?? 1000)
  return base.os.map((o) => {
    const ts = base.tpes.filter((t) => t.os === o.os)
    return { ...o, tipo: o.os < lim ? 'INTERNA' : 'CLIENTE', qtd_tpes: ts.length, tpes_abertas: ts.filter((t) => t.status !== 'FINALIZADA').length,
      horas: ts.reduce((s, t) => s + t.horas_totais, 0), custo: ts.reduce((s, t) => s + (t.custo_total ?? 0), 0), arquivada: o.arquivada ? 'SIM' : '' }
  })
}
