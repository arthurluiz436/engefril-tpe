import { useEffect, useState } from 'react'
import { CAMPOS, lerPlanilha, sha256Hex, validarArquivo, type Leitura, type MapaAba } from '../../lib/importador'
import { supabase, mensagemErro } from '../../lib/supabase'
import { useBase } from '../../lib/base'
import { dataHoraBR, int } from '../../lib/formato'
import { Aviso, Cabecalho, Carregando, Icone, useAvisar, useConfirmar } from '../../components/ui'

const ENT = ['recursos', 'feriados', 'os', 'tpes', 'apontamentos'] as const
const NOME_ENT: Record<string, string> = { recursos: 'Projetistas', feriados: 'Feriados', os: 'O.S. / clientes', tpes: 'TPEs', apontamentos: 'Apontamentos' }

export default function Importar() {
  const avisar = useAvisar()
  const { recarregar } = useBase()
  const { confirmar, elemento } = useConfirmar()
  const [passo, setPasso] = useState(1)
  const [arquivo, setArquivo] = useState<{ nome: string; buf: ArrayBuffer; sha: string; wb: any } | null>(null)
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [previa, setPrevia] = useState<any | null>(null)
  const [atualizar, setAtualizar] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any | null>(null)
  const [lotes, setLotes] = useState<any[]>([])
  const [filtroItens, setFiltroItens] = useState('')

  const carregarLotes = () => supabase.from('import_lotes').select('*').order('importado_em', { ascending: false }).limit(30).then(({ data }) => setLotes(data ?? []))
  useEffect(() => { carregarLotes() }, [])

  async function escolher(f: File) {
    setErro(null); setPrevia(null); setResultado(null)
    const v = validarArquivo(f); if (v) return setErro(v)
    setOcupado('Lendo a planilha no seu computador (o arquivo não é enviado ao servidor)…')
    try {
      const buf = await f.arrayBuffer()
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const sha = await sha256Hex(buf)
      setArquivo({ nome: f.name, buf, sha, wb })
      setLeitura(lerPlanilha(wb as any, f.name, sha))
      setPasso(2)
    } catch (e) { setErro(`Não foi possível ler o arquivo: ${mensagemErro(e)}`) } finally { setOcupado(null) }
  }

  function ajustarMapa(aba: string, mudar: (m: MapaAba) => MapaAba) {
    if (!leitura || !arquivo) return
    const novos = leitura.abas.map((m) => (m.aba === aba ? mudar({ ...m, colunas: { ...m.colunas } }) : m))
    setLeitura(lerPlanilha(arquivo.wb, arquivo.nome, arquivo.sha, novos))
  }

  async function verPrevia() {
    if (!leitura) return
    setOcupado('Validando no servidor (nada será gravado nesta etapa)…'); setErro(null)
    const { data, error } = await supabase.rpc('processar_importacao', { p: leitura.payload, p_confirmar: false, p_atualizar: atualizar })
    setOcupado(null)
    if (error) return setErro(mensagemErro(error))
    setPrevia(data); setPasso(3)
  }

  async function confirmarImportacao() {
    if (!leitura || !previa) return
    const ins = ENT.reduce((s, e) => s + (previa.resumo[e]?.inserido ?? 0), 0)
    const upd = ENT.reduce((s, e) => s + (previa.resumo[e]?.atualizado ?? 0), 0)
    if (!(await confirmar('Confirmar importação', <>Serão gravados <strong>{ins}</strong> registros novos{upd ? <> e <strong>{upd}</strong> atualizados</> : ''}. Apontamentos existentes nunca são substituídos. O lote poderá ser revertido.</>, 'Gravar na base'))) return
    setOcupado('Gravando…')
    const { data, error } = await supabase.rpc('processar_importacao', { p: leitura.payload, p_confirmar: true, p_atualizar: atualizar })
    setOcupado(null)
    if (error) return setErro(mensagemErro(error))
    setResultado(data); setPasso(4); carregarLotes(); recarregar()
    avisar('ok', `Importação concluída (lote ${data.lote_id}).`)
  }

  async function reverter(l: any) {
    if (!(await confirmar('Reverter importação', <>Reverter o lote <strong>{l.id}</strong> ({l.arquivo})? Tudo o que ele inseriu será removido e o que ele atualizou volta ao valor anterior. A operação fica na auditoria.</>, 'Reverter lote', true))) return
    const { data, error } = await supabase.rpc('reverter_lote', { p_lote: l.id })
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `Lote revertido: ${JSON.stringify(data)}`); carregarLotes(); recarregar()
  }

  async function salvarMapa() {
    if (!leitura) return
    const nome = prompt('Nome do mapa de colunas (para reutilizar com arquivos do mesmo modelo):')?.trim(); if (!nome) return
    const { error } = await supabase.from('import_mapas').upsert({ nome, modelo: leitura.modelo, mapa: leitura.abas }, { onConflict: 'nome' })
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'Mapa salvo.')
  }

  const itens: any[] = (previa?.itens ?? []).filter((i: any) => !filtroItens || i.operacao === filtroItens)
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Importar planilha antiga" texto="Envie o arquivo; você poderá conferir o mapeamento e a prévia antes de salvar. A leitura acontece no seu navegador e a gravação só é feita após sua confirmação, numa função protegida do servidor." />
      <ol className="passos">{['Arquivo', 'Mapeamento', 'Prévia e conflitos', 'Resultado'].map((p, i) =>
        <li key={p} className={passo === i + 1 ? 'atual' : passo > i + 1 ? 'feito' : ''}><span className="n">{passo > i + 1 ? '✓' : i + 1}</span>{p}</li>)}</ol>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ocupado && <Carregando texto={ocupado} />}

      {passo === 1 && (
        <div className="card stack">
          <h2>Escolha o arquivo Excel</h2>
          <p className="muted small" style={{ margin: 0 }}>Reconhece automaticamente a planilha TAREF_PROJ_ENGEFRIL (VER_035), o aplicativo Excel 1.0 e planilhas genéricas com cabeçalhos como “TPE”, “Projetista”, “Data”, “Hora início”. Limite de 20 MB, .xlsx ou .xlsm (macros nunca são executadas).</p>
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])} aria-label="Arquivo Excel" />
        </div>
      )}

      {passo === 2 && leitura && (
        <div className="stack">
          <Aviso tipo="info">Modelo reconhecido: <strong>{leitura.modelo === 'VER_035' ? 'TAREF_PROJ_ENGEFRIL (VER_035)' : leitura.modelo === 'APP_1_0' ? 'Aplicativo Excel 1.0' : 'Genérico'}</strong> · arquivo {arquivo?.nome} · SHA-256 {arquivo?.sha.slice(0, 12)}…</Aviso>
          {leitura.avisos.map((a, i) => <Aviso key={i} tipo="atencao">{a}</Aviso>)}
          {leitura.abas.map((m) => (
            <div key={m.aba} className="card stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Aba “{m.aba}”</h3>
                <div className="row">
                  <select value={m.entidade} onChange={(e) => ajustarMapa(m.aba, (x) => ({ ...x, entidade: e.target.value as any }))} aria-label={`Tipo da aba ${m.aba}`}>
                    <option value="ignorar">Ignorar esta aba</option><option value="os">Clientes / O.S.</option><option value="tpes">TPEs / tarefas</option><option value="apontamentos">Apontamentos</option>
                  </select>
                  {leitura.contagem[m.aba] && <span className="small muted">{int(leitura.contagem[m.aba].lidas)} linhas lidas · {leitura.contagem[m.aba].ignoradasVazias} vazias{leitura.contagem[m.aba].comErro ? ` · ${leitura.contagem[m.aba].comErro} com data/hora inválida` : ''}</span>}
                </div>
              </div>
              {m.entidade !== 'ignorar' && (
                <div className="grid4">
                  {CAMPOS[m.entidade].map((d) => (
                    <label key={d.campo} className="campo small"><span>{d.rotulo}{d.obrigatorio ? ' *' : ''}</span>
                      <select value={m.colunas[d.campo] ?? ''} aria-invalid={d.obrigatorio && !m.colunas[d.campo]}
                              onChange={(e) => ajustarMapa(m.aba, (x) => { const c = { ...x.colunas }; if (e.target.value) c[d.campo] = Number(e.target.value); else delete c[d.campo]; return { ...x, colunas: c } })}>
                        <option value="">— não usar —</option>
                        {cabecalhos(arquivo!.wb, m).map(([i, t]) => <option key={i} value={i}>{t}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn sec" onClick={() => setPasso(1)}>Trocar arquivo</button>
            <div className="row">
              <button className="btn sec" onClick={salvarMapa}>Salvar mapa de colunas</button>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} /> Atualizar O.S./TPEs existentes com os valores da planilha</label>
              <button className="btn" onClick={verPrevia} disabled={!!ocupado}>Ver prévia</button>
            </div>
          </div>
        </div>
      )}

      {passo === 3 && previa && (
        <div className="stack">
          {previa.ja_importado && <Aviso tipo="atencao"><strong>Este mesmo arquivo já foi importado antes.</strong> Possíveis duplicidades: compare as informações antes de confirmar.</Aviso>}
          <div className="card">
            <h2>Resumo da prévia (nada foi gravado)</h2>
            <table className="tabela"><thead><tr><th>Entidade</th><th className="num">Novos</th><th className="num">Atualizados</th><th className="num">Diferentes (não atualizados)</th><th className="num">Já existentes</th><th className="num">Duplicados</th><th className="num">Rejeitados</th></tr></thead>
              <tbody>{ENT.map((e) => { const r = previa.resumo[e] ?? {}; const dif = (previa.itens ?? []).filter((i: any) => i.entidade === e && i.operacao === 'diferente').length
                return <tr key={e}><td>{NOME_ENT[e]}</td><td className="num">{r.inserido ?? 0}</td><td className="num">{r.atualizado ?? 0}</td><td className="num">{dif}</td>
                  <td className="num">{(r.sem_alteracao ?? 0) - dif}</td><td className="num">{r.duplicado ?? 0}</td><td className="num" style={{ color: r.rejeitado ? 'var(--vermelho)' : undefined }}>{r.rejeitado ?? 0}</td></tr> })}</tbody></table>
          </div>
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Itens que pedem atenção ({(previa.itens ?? []).length})</h2>
              <select value={filtroItens} onChange={(e) => setFiltroItens(e.target.value)} aria-label="Filtrar itens"><option value="">Todos</option>{['rejeitado', 'duplicado', 'diferente', 'atualizado', 'inserido', 'sem_alteracao'].map((o) => <option key={o}>{o}</option>)}</select></div>
            {itens.length === 0 ? <p className="muted">Nenhum item com observação.</p> : (
              <div className="rolagem" style={{ maxHeight: 380 }}><table className="tabela"><thead><tr><th>Entidade</th><th>Chave</th><th>Aba / linha</th><th>Operação</th><th>Motivo / diferença</th></tr></thead>
                <tbody>{itens.slice(0, 500).map((i, k) => <tr key={k}><td>{NOME_ENT[i.entidade] ?? i.entidade}</td><td>{String(i.chave)}</td><td>{i.aba ?? ''} {i.linha ?? ''}</td>
                  <td><span className={`badge ${i.operacao === 'rejeitado' ? 'vermelho' : i.operacao === 'duplicado' || i.operacao === 'diferente' ? 'ambar' : 'azul'}`}>{i.operacao}</span></td>
                  <td className="small">{i.motivo}{i.antes && i.depois && <div className="muted">{diferencas(i.antes, i.depois)}</div>}</td></tr>)}</tbody></table></div>)}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn sec" onClick={() => setPasso(2)}>Voltar ao mapeamento</button>
            <button className="btn" onClick={confirmarImportacao} disabled={!!ocupado}><Icone n="check" /> Confirmar e gravar</button>
          </div>
        </div>
      )}

      {passo === 4 && resultado && (
        <div className="card stack">
          <Aviso tipo="ok"><strong>Importação gravada.</strong> Lote nº {resultado.lote_id}. Os dados já aparecem para os projetistas e nas telas do Master.</Aviso>
          <table className="tabela"><thead><tr><th>Entidade</th><th className="num">Novos</th><th className="num">Atualizados</th><th className="num">Duplicados</th><th className="num">Rejeitados</th></tr></thead>
            <tbody>{ENT.map((e) => { const r = resultado.resumo[e] ?? {}; return <tr key={e}><td>{NOME_ENT[e]}</td><td className="num">{r.inserido ?? 0}</td><td className="num">{r.atualizado ?? 0}</td><td className="num">{r.duplicado ?? 0}</td><td className="num">{r.rejeitado ?? 0}</td></tr> })}</tbody></table>
          <Aviso tipo="info">Próximos passos: confira em Parâmetros os custos H/H e o início padrão de cada projetista; atribua responsáveis às TPEs em aberto; vincule cada login ao seu projetista em Usuários.</Aviso>
          <button className="btn sec" onClick={() => { setPasso(1); setArquivo(null); setLeitura(null); setPrevia(null) }}>Importar outro arquivo</button>
        </div>
      )}

      <div className="card stack">
        <h2>Histórico de importações</h2>
        {lotes.length === 0 ? <p className="muted">Nenhuma importação ainda.</p> : (
          <div className="rolagem" style={{ maxHeight: 320 }}><table className="tabela"><thead><tr><th>Lote</th><th>Arquivo</th><th>Modelo</th><th>Quando</th><th>Resumo</th><th>Status</th><th></th></tr></thead>
            <tbody>{lotes.map((l) => <tr key={l.id}><td>{l.id}</td><td>{l.arquivo}<div className="small muted">{l.sha256.slice(0, 12)}…</div></td><td>{l.modelo}</td><td>{dataHoraBR(l.importado_em)}</td>
              <td className="small">{ENT.map((e) => l.resumo?.[e]?.inserido ? `${NOME_ENT[e]}: +${l.resumo[e].inserido}` : null).filter(Boolean).join(' · ')}</td>
              <td><span className={`badge ${l.status === 'revertido' ? 'ambar' : 'verde'}`}>{l.status}</span></td>
              <td>{l.status === 'confirmado' && <button className="btn sec pequeno" onClick={() => reverter(l)}>Reverter</button>}</td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  )
}

function cabecalhos(wb: any, m: MapaAba): [number, string][] {
  const ws = wb.worksheets.find((w: any) => w.name === m.aba)
  const v = (ws?.getRow(m.linhaCabecalho).values ?? []) as unknown[]
  return v.map((x, i) => [i, String((x as any)?.result ?? (x as any)?.richText?.map((r: any) => r.text).join('') ?? x ?? '')] as [number, string]).filter(([i, t]) => i > 0 && t)
}

function diferencas(a: any, d: any): string {
  return Object.keys(d).filter((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(d[k] ?? null)).map((k) => `${k}: ${a?.[k] ?? '∅'} → ${d[k] ?? '∅'}`).join('; ')
}
