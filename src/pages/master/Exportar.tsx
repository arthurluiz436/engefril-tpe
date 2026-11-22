import { useMemo, useState } from 'react'
import { useBase } from '../../lib/base'
import { useAuth } from '../../lib/auth'
import { COLUNAS, linhasDe, type Conjunto } from '../../lib/conjuntos'
import { formatar } from '../../components/DataGrid'
import { exportarCSV, exportarXLSX, carimbo, type ColunaExport } from '../../lib/exportar'
import { Aviso, Cabecalho, Campo, Carregando, Icone, useAvisar } from '../../components/ui'

const NOMES: Record<Conjunto, string> = { apontamentos: 'Apontamentos', tpes: 'TPEs e tarefas', os: 'Clientes e O.S.' }
const CAMPO_DATA: Record<Conjunto, string> = { apontamentos: 'dia', tpes: 'data_inicio', os: 'data_inicio' }

export default function Exportar() {
  const { base } = useBase()
  const { perfil } = useAuth()
  const avisar = useAvisar()
  const [passo, setPasso] = useState(1)
  const [conj, setConj] = useState<Conjunto>('apontamentos')
  const [modo, setModo] = useState<'personalizada' | 'completa'>('personalizada')
  const [cols, setCols] = useState<string[]>(COLUNAS.apontamentos.filter((c) => c.padrao).map((c) => c.chave))
  const [de, setDe] = useState(''); const [ate, setAte] = useState('')
  const [projetistas, setProjetistas] = useState<string[]>([])
  const [tpes, setTpes] = useState('')
  const [status, setStatus] = useState<string[]>([])
  const [ordem, setOrdem] = useState<{ chave: string; dir: 1 | -1 }>({ chave: 'dia', dir: 1 })
  const [formato, setFormato] = useState<'xlsx' | 'relatorio' | 'csv'>('xlsx')

  const todas = COLUNAS[conj]
  const escolhidas: ColunaExport[] = (modo === 'completa' ? todas.map((c) => c.chave) : cols).map((k) => todas.find((c) => c.chave === k)!).filter(Boolean)
  const nomesProj = useMemo(() => (base?.recursos ?? []).map((r: any) => r.nome as string), [base])

  const resultado = useMemo(() => {
    if (!base) return []
    let ls = linhasDe(conj, base)
    const cd = CAMPO_DATA[conj]
    if (de) ls = ls.filter((l) => l[cd] && String(l[cd]) >= de)
    if (ate) ls = ls.filter((l) => l[cd] && String(l[cd]) <= ate)
    const campoProj = conj === 'apontamentos' ? 'recurso_nome' : conj === 'tpes' ? 'responsavel' : null
    if (campoProj && projetistas.length) ls = ls.filter((l) => projetistas.includes(String(l[campoProj] ?? '')))
    const lista = tpes.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)
    const campoTpe = conj === 'apontamentos' ? 'tpe_codigo' : conj === 'tpes' ? 'codigo' : null
    if (campoTpe && lista.length) ls = ls.filter((l) => lista.some((t) => String(l[campoTpe]).toUpperCase().startsWith(t)))
    if (conj !== 'apontamentos' && status.length) ls = ls.filter((l) => status.includes(String(l.status)))
    return [...ls].sort((a, b) => String(a[ordem.chave] ?? '').localeCompare(String(b[ordem.chave] ?? ''), 'pt-BR', { numeric: true }) * ordem.dir)
  }, [base, conj, de, ate, projetistas, tpes, status, ordem])

  async function gerar() {
    const nome = `Engefril_${conj}_${carimbo()}.${formato === 'csv' ? 'csv' : 'xlsx'}`
    const params: [string, string][] = [
      ['Conjunto', NOMES[conj]], ['Tipo', modo === 'completa' ? 'Exportação completa (todos os campos autorizados)' : 'Exportação personalizada'],
      ['Período', `${de || 'início'} a ${ate || 'hoje'} (campo ${CAMPO_DATA[conj]})`], ['Projetistas', projetistas.join(', ') || 'todos'],
      ['TPEs', tpes || 'todas'], ['Status', status.join(', ') || 'todos'], ['Ordenação', `${ordem.chave} ${ordem.dir === 1 ? 'crescente' : 'decrescente'}`],
      ['Linhas', String(resultado.length)], ['Gerado por', perfil?.email ?? ''], ['Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
      ['Regras de cálculo', 'Horas normais/extras e custos conforme regra da VER_035 (ver docs/VALIDACAO.md).'],
    ]
    if (formato === 'csv') exportarCSV(nome, escolhidas, resultado)
    else {
      const abas = [{ nome: NOMES[conj], colunas: escolhidas, linhas: resultado }]
      if (formato === 'relatorio' && conj === 'apontamentos') {
        const resumo = (campo: string, rotulo: string) => {
          const m = new Map<string, { h: number; he: number; c: number; n: number }>()
          for (const l of resultado) { const k = String(l[campo] ?? ''); const x = m.get(k) ?? { h: 0, he: 0, c: 0, n: 0 }; x.h += Number(l.horas_totais) || 0; x.he += Number(l.horas_extras) || 0; x.c += Number(l.custo_total) || 0; x.n++; m.set(k, x) }
          return { nome: `Resumo por ${rotulo}`, colunas: [{ chave: 'k', rotulo, tipo: 'texto' as const, largura: 30 }, { chave: 'n', rotulo: 'Apontamentos', tipo: 'inteiro' as const },
            { chave: 'h', rotulo: 'Horas totais (h)', tipo: 'horas' as const }, { chave: 'he', rotulo: 'Horas extras (h)', tipo: 'horas' as const }, { chave: 'c', rotulo: 'Custo (R$)', tipo: 'moeda' as const }],
            linhas: [...m.entries()].sort((a, b) => b[1].h - a[1].h).map(([k, x]) => ({ k, ...x })) }
        }
        abas.unshift(resumo('tpe_codigo', 'TPE') as any, resumo('recurso_nome', 'projetista') as any)
      }
      await exportarXLSX(nome, abas, params)
    }
    avisar('ok', `Arquivo gerado com ${resultado.length} linhas e ${escolhidas.length} colunas.`)
  }

  if (!base) return <Carregando />
  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      <Cabecalho titulo="Exportar dados" texto="Selecione campos, período e filtros antes de gerar o Excel. O arquivo contém exatamente o que você escolher. Para exportar o que está na tela, use a Central de Dados." />
      <ol className="passos">{['O quê', 'Colunas', 'Filtros e ordem', 'Prévia e formato'].map((p, i) =>
        <li key={p} className={passo === i + 1 ? 'atual' : passo > i + 1 ? 'feito' : ''}><span className="n">{passo > i + 1 ? '✓' : i + 1}</span>{p}</li>)}</ol>
      <div className="card stack">
        {passo === 1 && (<>
          <h2>O que você quer exportar?</h2>
          <div className="row">{(Object.keys(NOMES) as Conjunto[]).map((c) => (
            <button key={c} className={`btn ${conj === c ? '' : 'sec'}`} onClick={() => { setConj(c); setCols(COLUNAS[c].filter((x) => x.padrao).map((x) => x.chave)); setOrdem({ chave: COLUNAS[c][0].chave, dir: 1 }); setStatus([]) }}>{NOMES[c]}</button>))}</div>
          <div className="row">
            <label className="row" style={{ gap: 6 }}><input type="radio" style={{ width: 16, minHeight: 0 }} checked={modo === 'personalizada'} onChange={() => setModo('personalizada')} /> Personalizada (escolho as colunas)</label>
            <label className="row" style={{ gap: 6 }}><input type="radio" style={{ width: 16, minHeight: 0 }} checked={modo === 'completa'} onChange={() => setModo('completa')} /> Completa (todos os campos autorizados)</label>
          </div>
        </>)}
        {passo === 2 && (<>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>Colunas ({escolhidas.length})</h2>
            {modo === 'personalizada' && <div className="row"><button className="btn sec pequeno" onClick={() => setCols(todas.map((c) => c.chave))}>Selecionar todas</button><button className="btn sec pequeno" onClick={() => setCols([])}>Limpar</button></div>}</div>
          {modo === 'completa' ? <Aviso tipo="info">Exportação completa inclui todas as {todas.length} colunas.</Aviso> : (
            <div className="grid4">{todas.map((c) => (
              <label key={c.chave} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={cols.includes(c.chave)} onChange={() => setCols(cols.includes(c.chave) ? cols.filter((k) => k !== c.chave) : [...cols, c.chave])} /> {c.rotulo}
              </label>))}</div>)}
        </>)}
        {passo === 3 && (<>
          <h2>Filtros e ordenação</h2>
          <div className="grid4">
            <Campo rotulo={`Data inicial (${CAMPO_DATA[conj]})`}><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
            <Campo rotulo="Data final"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
            {conj !== 'os' && <Campo rotulo="TPEs" ajuda="Ex.: TPE-012, TPE-103 (vazio = todas)"><input value={tpes} onChange={(e) => setTpes(e.target.value)} /></Campo>}
            <Campo rotulo="Ordenar por"><select value={ordem.chave} onChange={(e) => setOrdem({ ...ordem, chave: e.target.value })}>{todas.map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}</select></Campo>
            <Campo rotulo="Direção"><select value={ordem.dir} onChange={(e) => setOrdem({ ...ordem, dir: Number(e.target.value) as 1 | -1 })}><option value={1}>Crescente</option><option value={-1}>Decrescente</option></select></Campo>
          </div>
          {conj !== 'os' && <div><div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Projetistas (nenhum marcado = todos)</div>
            <div className="row">{nomesProj.map((n: string) => <label key={n} className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={projetistas.includes(n)} onChange={() => setProjetistas(projetistas.includes(n) ? projetistas.filter((x) => x !== n) : [...projetistas, n])} />{n}</label>)}</div></div>}
          {conj !== 'apontamentos' && <div><div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Status (nenhum = todos)</div>
            <div className="row">{(conj === 'tpes' ? ['NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA'] : ['EM ANDAMENTO', 'FINALIZADA']).map((s) =>
              <label key={s} className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={status.includes(s)} onChange={() => setStatus(status.includes(s) ? status.filter((x) => x !== s) : [...status, s])} />{s}</label>)}</div></div>}
        </>)}
        {passo === 4 && (<>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2>Prévia: {resultado.length} linhas × {escolhidas.length} colunas</h2>
            <div className="row">
              <Campo rotulo="Formato"><select value={formato} onChange={(e) => setFormato(e.target.value as any)}>
                <option value="xlsx">Excel .xlsx — base tabular</option>
                {conj === 'apontamentos' && <option value="relatorio">Excel .xlsx — relatório (resumos por TPE e projetista + base)</option>}
                <option value="csv">CSV (; e vírgula decimal)</option>
              </select></Campo>
            </div></div>
          {escolhidas.length === 0 ? <Aviso tipo="atencao">Escolha ao menos uma coluna.</Aviso> : (
            <div className="rolagem" style={{ maxHeight: 360 }}><table className="tabela"><thead><tr>{escolhidas.map((c) => <th key={c.chave}>{c.rotulo}</th>)}</tr></thead>
              <tbody>{resultado.slice(0, 50).map((l, i) => <tr key={i}>{escolhidas.map((c) => <td key={c.chave}>{formatar(l[c.chave], c as any)}</td>)}</tr>)}</tbody></table></div>)}
          {resultado.length > 50 && <p className="muted small">Mostrando 50 de {resultado.length} linhas. O arquivo terá todas.</p>}
          <p className="muted small">Datas, números e horas saem com tipo e formato do Excel. Textos começados por =, +, - ou @ são protegidos contra execução de fórmulas.</p>
        </>)}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn sec" disabled={passo === 1} onClick={() => setPasso(passo - 1)}>Voltar</button>
          {passo < 4 ? <button className="btn" onClick={() => setPasso(passo + 1)} disabled={passo === 2 && escolhidas.length === 0}>Continuar</button>
            : <button className="btn" onClick={gerar} disabled={!escolhidas.length || !resultado.length}><Icone n="exportar" /> Gerar arquivo</button>}
        </div>
      </div>
    </div>
  )
}
