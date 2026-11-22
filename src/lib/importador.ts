// Leitura e interpretação de planilhas legadas (VER_035, App 1.0 e modelos genéricos).
// Roda no navegador do Master: o arquivo NÃO é enviado ao servidor; só as linhas
// normalizadas seguem para a função protegida processar_importacao (que revalida tudo).
import { dataISO, horaHHMM, inteiro, normCab, normalizaTPE, numero, texto } from './normaliza'

export type Entidade = 'os' | 'tpes' | 'apontamentos'

export interface PlanilhaMinima {
  worksheets: { name: string; rowCount: number; getRow(n: number): { values: unknown } }[]
}

export const CAMPOS: Record<Entidade, { campo: string; rotulo: string; obrigatorio?: boolean; sinonimos: string[] }[]> = {
  os: [
    { campo: 'os', rotulo: 'O.S.', obrigatorio: true, sinonimos: ['O.S.', 'OS', 'O.S', 'ORDEM DE SERVICO', 'NUMERO OS', 'N OS'] },
    { campo: 'nome', rotulo: 'Cliente', sinonimos: ['NOME', 'CLIENTE', 'NOME DO CLIENTE', 'RAZAO SOCIAL'] },
    { campo: 'uf', rotulo: 'UF', sinonimos: ['ESTADO', 'UF'] },
    { campo: 'cidade', rotulo: 'Cidade', sinonimos: ['CIDADE', 'MUNICIPIO'] },
    { campo: 'projeto_engefril', rotulo: 'Projeto Engefril', sinonimos: ['PROJETO ENGEFRIL'] },
    { campo: 'nivel', rotulo: 'Nível', sinonimos: ['NIVEL'] },
    { campo: 'vendedor', rotulo: 'Vendedor', sinonimos: ['VENDEDOR'] },
    { campo: 'classificacao', rotulo: 'Classificação', sinonimos: ['CLASSIFICACAO'] },
    { campo: 'data_inicio', rotulo: 'Data início', sinonimos: ['DATA INICIO', 'DATA INCIO', 'INICIO'] },
    { campo: 'prazo_final', rotulo: 'Prazo final', sinonimos: ['PRAZO FINAL', 'PRAZO'] },
    { campo: 'status', rotulo: 'Status', sinonimos: ['STATUS', 'SITUACAO'] },
  ],
  tpes: [
    { campo: 'codigo', rotulo: 'TPE', obrigatorio: true, sinonimos: ['TPE', 'NUMERO DO TPE', 'CODIGO TPE', 'N TPE'] },
    { campo: 'os', rotulo: 'O.S.', obrigatorio: true, sinonimos: ['O.S.', 'OS', 'O.S', 'ORDEM DE SERVICO'] },
    { campo: 'principal', rotulo: 'Principal', obrigatorio: true, sinonimos: ['PRINCIPAL', 'DISCIPLINA'] },
    { campo: 'grupo', rotulo: 'Grupo', obrigatorio: true, sinonimos: ['GRUPO', 'ATIVIDADE'] },
    { campo: 'descricao', rotulo: 'Descrição', sinonimos: ['DESCRICAO', 'DESCRICAO DA TAREFA'] },
    { campo: 'finalizada', rotulo: 'Finalizada (SIM)', sinonimos: ['FINALIZADA', 'CONCLUIDA'] },
    { campo: 'status', rotulo: 'Status', sinonimos: ['STATUS'] },
    { campo: 'data_inicio', rotulo: 'Data início', sinonimos: ['DATA INICIO', 'DATA INCIO', 'INICIO'] },
    { campo: 'data_fim', rotulo: 'Data finalização', sinonimos: ['DATA FINALIZACAO', 'DATA FIM', 'DATA DE CONCLUSAO'] },
    { campo: 'responsavel', rotulo: 'Responsável', sinonimos: ['RECURSO', 'RESPONSAVEL', 'PROJETISTA'] },
  ],
  apontamentos: [
    { campo: 'seq', rotulo: 'Sequência', sinonimos: ['SEQ', 'SEQUENCIA', 'ID'] },
    { campo: 'tpe', rotulo: 'TPE', obrigatorio: true, sinonimos: ['TPE', 'NUMERO DO TPE'] },
    { campo: 'os', rotulo: 'O.S.', sinonimos: ['O.S.', 'OS', 'O.S'] },
    { campo: 'recurso', rotulo: 'Projetista', obrigatorio: true, sinonimos: ['RECURSO', 'PROJETISTA', 'COLABORADOR', 'RESPONSAVEL'] },
    { campo: 'descricao', rotulo: 'Descrição', sinonimos: ['DESCRICAO', 'ATIVIDADE REALIZADA', 'OBSERVACAO'] },
    { campo: 'dia', rotulo: 'Dia', obrigatorio: true, sinonimos: ['DIA', 'DATA', 'DATA EXECUTADA', 'DATA DO APONTAMENTO'] },
    { campo: 'hora_inicio', rotulo: 'Hora início', obrigatorio: true, sinonimos: ['HORA INICIO', 'INICIO', 'HORA INICIAL'] },
    { campo: 'hora_fim', rotulo: 'Hora fim', obrigatorio: true, sinonimos: ['HORA FIM', 'FIM', 'HORA FINAL', 'TERMINO'] },
  ],
}

export interface MapaAba {
  aba: string
  entidade: Entidade | 'ignorar'
  linhaCabecalho: number
  colunas: Record<string, number> // campo -> índice da coluna (1-based)
  naoReconhecidas: string[]
}

export interface Leitura {
  modelo: 'VER_035' | 'APP_1_0' | 'GENERICO'
  abas: MapaAba[]
  payload: PayloadImportacao
  avisos: string[]
  contagem: Record<string, { lidas: number; ignoradasVazias: number; comErro: number }>
}

export interface PayloadImportacao {
  arquivo: string
  sha256: string
  modelo: string
  mapa: unknown
  recursos: { nome: string; custo?: number | null; inicio_padrao?: string | null; aba?: string; linha?: number }[]
  feriados: { data: string; descricao: string }[]
  os: Record<string, unknown>[]
  tpes: Record<string, unknown>[]
  apontamentos: Record<string, unknown>[]
}

function linhaValores(ws: PlanilhaMinima['worksheets'][number], r: number): unknown[] {
  const v = ws.getRow(r).values
  return Array.isArray(v) ? v : []
}

/** Encontra a linha de cabeçalho e associa colunas a campos por sinônimos. */
export function detectarAba(ws: PlanilhaMinima['worksheets'][number]): MapaAba {
  let melhor: MapaAba = { aba: ws.name, entidade: 'ignorar', linhaCabecalho: 1, colunas: {}, naoReconhecidas: [] }
  let melhorPontos = 0
  for (let r = 1; r <= Math.min(6, ws.rowCount); r++) {
    const cab = linhaValores(ws, r).map(normCab)
    for (const ent of Object.keys(CAMPOS) as Entidade[]) {
      const colunas: Record<string, number> = {}
      for (const def of CAMPOS[ent]) {
        const idx = cab.findIndex((c, i) => i > 0 && def.sinonimos.includes(c) && !Object.values(colunas).includes(i))
        if (idx > 0) colunas[def.campo] = idx
      }
      const obrig = CAMPOS[ent].filter((d) => d.obrigatorio)
      const temObrig = obrig.every((d) => colunas[d.campo])
      let pontos = Object.keys(colunas).length + (temObrig ? 10 : 0)
      // desempate: aba de apontamentos tem horários; aba de TPE tem principal/grupo
      const temHora = cab.some((c) => c === 'HORA INICIO' || c === 'HORA FIM')
      const temPrincipal = cab.includes('PRINCIPAL') || cab.includes('GRUPO')
      if (ent === 'apontamentos' && colunas.hora_inicio && colunas.hora_fim) pontos += 5
      if (ent === 'tpes' && temPrincipal && !temHora) pontos += 5
      if (ent === 'os' && (temPrincipal || temHora)) pontos -= 5
      if (temObrig && pontos > melhorPontos) {
        melhorPontos = pontos
        const usados = new Set(Object.values(colunas))
        melhor = {
          aba: ws.name, entidade: ent, linhaCabecalho: r, colunas,
          naoReconhecidas: cab.map((c, i) => (i > 0 && c && !usados.has(i) ? c : '')).filter(Boolean),
        }
      }
    }
  }
  return melhor
}

/** Lê a planilha inteira e monta o payload. `ajustes` permite ao Master corrigir o mapeamento. */
export function lerPlanilha(wb: PlanilhaMinima, arquivo: string, sha256: string, ajustes?: MapaAba[]): Leitura {
  const nomes = wb.worksheets.map((w) => w.name.trim().toUpperCase())
  const modelo: Leitura['modelo'] =
    nomes.includes('CRM_ANALITICO') && nomes.includes('TPE') ? 'VER_035'
      : nomes.includes('BD_APONTAMENTOS') && nomes.includes('BD_TPE') ? 'APP_1_0' : 'GENERICO'
  const avisos: string[] = []
  const abas: MapaAba[] = wb.worksheets.map((ws) => ajustes?.find((a) => a.aba === ws.name) ?? detectarAba(ws))
  // nas planilhas conhecidas, abas derivadas (KPI, INDICADORES…) não são fontes de dados
  for (const a of abas) {
    if (/^(KPI|INDICADORES|PAINEL|CONSULTA_OS|CONFERENCIA|MOTOR|CAPA|INICIO|F_.*)$/i.test(a.aba.trim())) a.entidade = 'ignorar'
  }
  const payload: PayloadImportacao = { arquivo, sha256, modelo, mapa: abas, recursos: [], feriados: [], os: [], tpes: [], apontamentos: [] }
  const contagem: Leitura['contagem'] = {}

  for (const m of abas) {
    if (m.entidade === 'ignorar') continue
    const ws = wb.worksheets.find((w) => w.name === m.aba)!
    const cont = (contagem[m.aba] = { lidas: 0, ignoradasVazias: 0, comErro: 0 })
    for (let r = m.linhaCabecalho + 1; r <= ws.rowCount; r++) {
      const vals = linhaValores(ws, r)
      const get = (campo: string) => (m.colunas[campo] ? vals[m.colunas[campo]] : null)
      const chave = m.entidade === 'os' ? get('os') : m.entidade === 'tpes' ? get('codigo') : get('tpe')
      if (texto(chave) === '') { cont.ignoradasVazias++; continue }
      cont.lidas++
      const base = { aba: m.aba, linha: r }
      if (m.entidade === 'os') {
        payload.os.push({ ...base, os: inteiro(get('os')), nome: texto(get('nome')), uf: texto(get('uf')), cidade: texto(get('cidade')),
          projeto_engefril: texto(get('projeto_engefril')), nivel: texto(get('nivel')), vendedor: texto(get('vendedor')),
          classificacao: texto(get('classificacao')), data_inicio: dataISO(get('data_inicio')), prazo_final: dataISO(get('prazo_final')),
          status: texto(get('status')) })
      } else if (m.entidade === 'tpes') {
        const st = texto(get('status')).toUpperCase()
        payload.tpes.push({ ...base, codigo: texto(get('codigo')), os: inteiro(get('os')), principal: texto(get('principal')),
          grupo: texto(get('grupo')), descricao: texto(get('descricao')), finalizada: texto(get('finalizada')).toUpperCase(),
          status: ['NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA'].includes(st) ? st : '',
          data_inicio: dataISO(get('data_inicio')), data_fim: dataISO(get('data_fim')), responsavel: texto(get('responsavel')) || null })
      } else {
        const ini = horaHHMM(get('hora_inicio')); const fim = horaHHMM(get('hora_fim')); const dia = dataISO(get('dia'))
        if (!ini || !fim || !dia) cont.comErro++
        payload.apontamentos.push({ ...base, seq: inteiro(get('seq')), tpe: texto(get('tpe')), os: inteiro(get('os')),
          recurso: texto(get('recurso')), descricao: texto(get('descricao')), dia, hora_inicio: ini, hora_fim: fim })
      }
    }
  }

  // TPEs com apontamentos na própria planilha (usado só para sinalizar status inferido)
  const comAp = new Set(payload.apontamentos.map((a) => normalizaTPE(a.tpe)))
  for (const t of payload.tpes) t.tem_apontamentos = comAp.has(normalizaTPE(t.codigo))

  // Recursos, custos e feriados das abas de parâmetros conhecidas
  const ref = wb.worksheets.find((w) => normCab(w.name) === 'REF' || normCab(w.name) === 'PARAMETROS')
  if (ref) {
    for (let r = 1; r <= Math.min(ref.rowCount, 80); r++) {
      const v = linhaValores(ref, r)
      for (let c = 1; c < v.length; c++) {
        const cab = normCab(v[c])
        if (cab === 'RECURSO') {
          for (let k = r + 1; k <= r + 8; k++) {
            const lv = linhaValores(ref, k); const nome = texto(lv[c]); const custo = numero(lv[c + 1])
            if (nome && custo !== null && /^[A-Za-zÀ-ú .'-]{2,60}$/.test(nome)) {
              const ini = horaHHMM(lv[c + 2])
              payload.recursos.push({ nome, custo, inicio_padrao: ini, aba: ref.name, linha: k })
            }
          }
        }
        if (cab === 'FERIADO (DATA)' || (cab === 'DATA' && normCab(v[c + 1]) === 'DESCRICAO')) {
          for (let k = r + 1; k <= r + 40; k++) {
            const lv = linhaValores(ref, k); const d = dataISO(lv[c])
            if (d) payload.feriados.push({ data: d, descricao: texto(lv[c + 1]) || 'Feriado' })
          }
        }
      }
    }
  }
  // Notas de jornada da VER_035 (ex.: "Fulano 08–18 (sex 08–17)") definem o início padrão
  if (ref) {
    for (let r = 1; r <= Math.min(ref.rowCount, 80); r++) {
      for (const cel of linhaValores(ref, r)) {
        const t = texto(cel)
        for (const m of t.matchAll(/([A-ZÀ-Ú][a-zà-ú]+)\s+0?8\s*[–-]\s*18/g)) {
          const rec = payload.recursos.find((x) => x.nome.toLowerCase() === m[1].toLowerCase())
          if (rec && !rec.inicio_padrao) {
            rec.inicio_padrao = '08:00'
            avisos.push(`Início padrão de ${rec.nome} = 08:00, conforme a nota de jornada da aba ${ref.name}.`)
          }
        }
      }
    }
  }
  // Projetistas citados nos apontamentos sem cadastro de custo
  const nomes2 = new Set(payload.recursos.map((x) => x.nome.toLowerCase()))
  for (const a of payload.apontamentos) {
    const n = String(a.recurso || '').trim()
    if (n && !nomes2.has(n.toLowerCase())) {
      nomes2.add(n.toLowerCase()); payload.recursos.push({ nome: n, custo: null })
      avisos.push(`Projetista "${n}" aparece nos apontamentos sem custo H/H na planilha — cadastre o custo em Parâmetros.`)
    }
  }
  if (modelo === 'VER_035') {
    avisos.push('Modelo VER_035 reconhecido: cliente/local/nível da aba TPE são cópias; o cadastro de O.S. (CLIENTES) é a fonte usada.')
  }
  for (const m of abas) if (m.entidade !== 'ignorar' && m.naoReconhecidas.length)
    avisos.push(`Aba ${m.aba}: colunas não usadas (calculadas ou desconhecidas): ${m.naoReconhecidas.slice(0, 12).join(', ')}${m.naoReconhecidas.length > 12 ? '…' : ''}`)
  return { modelo, abas, payload, avisos, contagem }
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const LIMITE_ARQUIVO_MB = 20
export function validarArquivo(f: { name: string; size: number }): string | null {
  if (!/\.(xlsx|xlsm)$/i.test(f.name)) return 'Envie um arquivo Excel .xlsx ou .xlsm.'
  if (f.size > LIMITE_ARQUIVO_MB * 1024 * 1024) return `Arquivo maior que ${LIMITE_ARQUIVO_MB} MB.`
  if (f.size < 100) return 'Arquivo vazio ou corrompido.'
  return null
}
