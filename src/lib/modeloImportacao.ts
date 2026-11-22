// Modelo de planilha para importar O.S./clientes, TPEs, apontamentos e projetistas.
// Os cabeçalhos são os que o importador reconhece (src/lib/importador.ts); o teste
// tests/calc/modelo.test.ts gera o modelo, preenche e confere a leitura.

type Col = { cab: string; largura: number; fmt?: string; lista?: string[]; nota?: string }

const STATUS_TPE = ['NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA']
const STATUS_OS = ['EM ANDAMENTO', 'FINALIZADA']

export const ABAS_MODELO: { nome: string; titulo: string; colunas: Col[] }[] = [
  { nome: 'CLIENTES E OS', titulo: 'Uma linha por O.S. (cliente). As TPEs herdam cliente, local, nível, vendedor e classificação daqui.', colunas: [
    { cab: 'O.S.', largura: 10, fmt: '000000', nota: 'Obrigatório. Número da O.S. (ex.: 61922; aparece como 061922).' },
    { cab: 'CLIENTE', largura: 34 }, { cab: 'UF', largura: 6 }, { cab: 'CIDADE', largura: 20 },
    { cab: 'PROJETO ENGEFRIL', largura: 20 }, { cab: 'NÍVEL', largura: 12 }, { cab: 'VENDEDOR', largura: 16 }, { cab: 'CLASSIFICAÇÃO', largura: 20 },
    { cab: 'DATA INÍCIO', largura: 13, fmt: 'dd/mm/yyyy' }, { cab: 'PRAZO FINAL', largura: 13, fmt: 'dd/mm/yyyy' },
    { cab: 'STATUS', largura: 15, lista: STATUS_OS },
  ] },
  { nome: 'TPES', titulo: 'Uma linha por TPE. A O.S. precisa existir na aba CLIENTES E OS (ou já estar cadastrada no sistema).', colunas: [
    { cab: 'TPE', largura: 12, nota: 'Obrigatório. Formato TPE-001.0 (revisões: TPE-001.1, TPE-001.2…).' },
    { cab: 'O.S.', largura: 10, fmt: '000000', nota: 'Obrigatório.' },
    { cab: 'PRINCIPAL', largura: 16, nota: 'Obrigatório. Ex.: EQUIPAMENTO.' }, { cab: 'GRUPO', largura: 24, nota: 'Obrigatório. Ex.: VASO DE PRESSÃO.' },
    { cab: 'DESCRIÇÃO', largura: 40 }, { cab: 'STATUS', largura: 15, lista: STATUS_TPE },
    { cab: 'DATA INÍCIO', largura: 13, fmt: 'dd/mm/yyyy' }, { cab: 'DATA FINALIZAÇÃO', largura: 16, fmt: 'dd/mm/yyyy', nota: 'Só para TPE finalizada.' },
    { cab: 'RESPONSÁVEL', largura: 18, nota: 'Nome do projetista, igual ao cadastrado (ou à aba PARAMETROS).' },
  ] },
  { nome: 'APONTAMENTOS', titulo: 'Uma linha por período trabalhado. O almoço (12h–13h) é descontado automaticamente quando o período o atravessa.', colunas: [
    { cab: 'TPE', largura: 12, nota: 'Obrigatório.' }, { cab: 'O.S.', largura: 10, fmt: '000000' },
    { cab: 'PROJETISTA', largura: 18, nota: 'Obrigatório.' }, { cab: 'DESCRIÇÃO', largura: 40 },
    { cab: 'DATA', largura: 12, fmt: 'dd/mm/yyyy', nota: 'Obrigatório.' },
    { cab: 'HORA INÍCIO', largura: 12, fmt: 'hh:mm', nota: 'Obrigatório (ex.: 07:00).' }, { cab: 'HORA FIM', largura: 12, fmt: 'hh:mm', nota: 'Obrigatório (ex.: 12:00).' },
  ] },
]

const AZUL = 'FF044AB3', GRAFITE = 'FF2A2E31'

/** Monta o modelo num Workbook do ExcelJS (navegador ou Node). */
export function montarModelo(ExcelJS: any): any {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Engefril · Gestão de Projetos'
  wb.created = new Date()

  // LEIA-ME (ignorada pelo importador: não tem cabeçalhos de dados)
  const ajuda = wb.addWorksheet('LEIA-ME', { properties: { tabColor: { argb: AZUL } } })
  ajuda.columns = [{ width: 4 }, { width: 110 }]
  const linhas: [string, boolean?][] = [
    ['Modelo de importação · Engefril TPE', true],
    [''],
    ['Como usar', true],
    ['1. Preencha as abas CLIENTES E OS, TPES e APONTAMENTOS a partir da linha 2. Não mude os nomes das colunas.'],
    ['2. Pode deixar abas vazias (ex.: só TPES). Não apague a linha de cabeçalho.'],
    ['3. Datas no formato dd/mm/aaaa; horas no formato hh:mm. O.S. só com números (061922 ou 61922).'],
    ['4. Na aba PARAMETROS, informe os projetistas com custo H/H e início padrão da jornada (07:00 ou 08:00) e os feriados.'],
    ['5. No sistema: Entrada e saída › Importar planilha › envie o arquivo › confira o mapeamento e a prévia › confirme.'],
    ['   A prévia não grava nada. Reimportar o mesmo arquivo não duplica registros, e um lote importado pode ser revertido.'],
    [''],
    ['Exemplos de preenchimento', true],
    ['CLIENTES E OS:  61922 | LATICINIOS SANTA MARIA | AL | BATALHA | PROJETO COMPLETO | GRANDE | FERNANDO | ... | 01/11/2026 | 22/12/2026 | EM ANDAMENTO'],
    ['TPES:           TPE-001.0 | 61922 | EQUIPAMENTO | VASO DE PRESSÃO | Elaboração do vaso | EM ANDAMENTO | 03/11/2026 | | Arthur Luiz'],
    ['APONTAMENTOS:   TPE-001.0 | 61922 | Arthur Luiz | Cálculo de espessura | 03/11/2026 | 07:00 | 12:00'],
    [''],
    ['Cuidados', true],
    ['• Revisões de uma TPE usam o mesmo número com .1, .2… (TPE-001.1). As horas das revisões somam na TPE original nas médias.'],
    ['• O nome do projetista precisa ser escrito igual nas abas (maiúsculas/minúsculas não importam).'],
    ['• Não envie dados pessoais além do necessário. O arquivo é lido no seu navegador; só os dados das colunas acima vão para o sistema.'],
  ]
  linhas.forEach(([t, titulo], i) => {
    const c = ajuda.getCell(i + 1, 2); c.value = t
    if (titulo) c.font = { bold: true, size: i === 0 ? 16 : 12, color: { argb: i === 0 ? AZUL : GRAFITE } }
  })

  for (const aba of ABAS_MODELO) {
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: GRAFITE } } })
    ws.columns = aba.colunas.map((c) => ({ header: c.cab, key: c.cab, width: c.largura, style: c.fmt ? { numFmt: c.fmt } : {} }))
    const cab = ws.getRow(1)
    cab.height = 22
    cab.eachCell((cel: any, n: number) => {
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aba.colunas[n - 1].nota?.startsWith('Obrigatório') ? AZUL : GRAFITE } }
      cel.alignment = { vertical: 'middle' }
      const nota = aba.colunas[n - 1].nota
      if (nota) cel.note = nota
    })
    aba.colunas.forEach((c, i) => {
      if (!c.lista) return
      const letra = ws.getColumn(i + 1).letter
      ws.dataValidations.add(`${letra}2:${letra}2000`, { type: 'list', allowBlank: true, formulae: [`"${c.lista.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Valor inválido', error: `Use: ${c.lista.join(', ')}` })
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } }
    ws.getCell(1, 1).note = `${aba.titulo}

${aba.colunas[0].nota ?? ''}`
  }

  // PARAMETROS: projetistas (RECURSO | custo | início padrão) e feriados — formato lido pelo importador
  const par = wb.addWorksheet('PARAMETROS', { properties: { tabColor: { argb: 'FFD59508' } } })
  par.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 16 }, { width: 30 }]
  par.getRow(1).values = ['RECURSO', 'CUSTO H/H', 'INÍCIO PADRÃO', '', 'FERIADO (DATA)', 'DESCRIÇÃO']
  par.getRow(1).eachCell((cel: any) => { if (cel.value) { cel.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } } } })
  par.getColumn(2).numFmt = '"R$" #,##0.00'
  par.getColumn(3).numFmt = 'hh:mm'
  par.getColumn(5).numFmt = 'dd/mm/yyyy'
  par.getCell('A10').value = 'Até 8 projetistas (linhas 2 a 9). Custo em R$ por hora; início padrão 07:00 ou 08:00.'
  par.getCell('A10').font = { italic: true, color: { argb: 'FF6B7079' } }
  return wb
}

/** Gera e baixa o modelo no navegador. */
export async function baixarModelo(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = montarModelo(ExcelJS)
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'MODELO_IMPORTACAO_ENGEFRIL.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
