import { useEffect, useMemo, useState } from 'react'
import { useBase } from '../../lib/base'
import { COLUNAS, VISOES_PADRAO, linhasDe, type Conjunto } from '../../lib/conjuntos'
import { DataGrid, PainelColunas, aplicar, configInicial, type GridConfig } from '../../components/DataGrid'
import { supabase, mensagemErro } from '../../lib/supabase'
import { exportarCSV, exportarXLSX, carimbo } from '../../lib/exportar'
import { useAuth } from '../../lib/auth'
import { Aviso, Cabecalho, Campo, Carregando, Icone, useAvisar, useConfirmar } from '../../components/ui'

const NOMES: Record<Conjunto, string> = { apontamentos: 'Apontamentos', tpes: 'TPEs e tarefas', os: 'Clientes e O.S.' }

export default function CentralDados() {
  const { base, erro, carregando, recarregar, atualizadoEm } = useBase()
  const { perfil } = useAuth()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [conj, setConj] = useState<Conjunto>('apontamentos')
  const [cfgs, setCfgs] = useState<Record<Conjunto, GridConfig>>({
    apontamentos: configInicial(COLUNAS.apontamentos), tpes: configInicial(COLUNAS.tpes), os: configInicial(COLUNAS.os),
  })
  const [arquivados, setArquivados] = useState(false)
  const [salvas, setSalvas] = useState<any[]>([])
  const cfg = cfgs[conj]
  const setCfg = (c: GridConfig) => setCfgs({ ...cfgs, [conj]: c })
  const cols = COLUNAS[conj]

  const carregarSalvas = () => supabase.from('visualizacoes').select('*').order('nome').then(({ data }) => setSalvas(data ?? []))
  useEffect(() => { carregarSalvas() }, [])

  const linhas = useMemo(() => {
    if (!base) return []
    const ls = linhasDe(conj, base)
    return arquivados || conj === 'apontamentos' ? ls : ls.filter((l) => l.arquivada !== 'SIM')
  }, [base, conj, arquivados])

  async function salvarVisao() {
    const nome = prompt('Nome da visualização (ex.: Prazos da semana):')?.trim()
    if (!nome) return
    const { error } = await supabase.from('visualizacoes').upsert({ dono: perfil!.user_id, conjunto: conj, nome, config: cfg }, { onConflict: 'dono,conjunto,nome' })
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `Visualização “${nome}” salva. Ela guarda colunas, filtros e ordem — não copia dados.`); carregarSalvas()
  }
  async function excluirVisao(v: any) {
    if (!(await confirmar('Excluir visualização', <>Excluir a visualização <strong>{v.nome}</strong>? Os dados não são afetados.</>, 'Excluir', true))) return
    await supabase.from('visualizacoes').delete().eq('id', v.id); carregarSalvas()
  }
  async function exportarAtual(fmt: 'xlsx' | 'csv') {
    const { linhas: fl, visiveis } = aplicar(linhas, cols, cfg)
    const nome = `Engefril_${conj}_visualizacao_${carimbo()}.${fmt}`
    if (fmt === 'csv') exportarCSV(nome, visiveis, fl)
    else await exportarXLSX(nome, [{ nome: NOMES[conj], colunas: visiveis, linhas: fl }], [
      ['Conjunto', NOMES[conj]], ['Linhas exportadas', String(fl.length)], ['Total disponível', String(linhas.length)],
      ['Busca', cfg.busca || '—'], ['Filtros', Object.entries(cfg.filtros).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; ') || '—'],
      ['Ordenação', cfg.ordenacao.map((o) => `${o.chave} ${o.dir === 1 ? '↑' : '↓'}`).join(', ') || '—'],
      ['Gerado por', perfil?.email ?? ''], ['Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    ])
    avisar('ok', `Exportadas ${fl.length} linhas e ${visiveis.length} colunas — exatamente o que está na tela.`)
  }

  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Central de Dados" texto="Explore a base como numa planilha inteligente. Ocultar e filtrar mudam só a tela; arquivar tira o item das listas do dia a dia; excluir é feito apenas nas telas de cadastro, com confirmação e auditoria."
        acoes={<><span className="small muted">Atualizado {atualizadoEm?.toLocaleTimeString('pt-BR') ?? '—'}</span><button className="btn sec" onClick={recarregar} disabled={carregando}>Atualizar dados</button></>} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="row" role="tablist">
        {(Object.keys(NOMES) as Conjunto[]).map((c) => <button key={c} role="tab" aria-selected={conj === c} className={`btn ${conj === c ? '' : 'sec'}`} onClick={() => setConj(c)}>{NOMES[c]}</button>)}
      </div>
      {!base ? <Carregando /> : (
        <div className="cd">
          <PainelColunas colunas={cols} cfg={cfg} setCfg={setCfg} padrao={cols.filter((c) => c.padrao).map((c) => c.chave)} />
          <div className="stack" style={{ gap: 12, minWidth: 0 }}>
            <div className="card row" style={{ padding: 12 }}>
              <input type="search" placeholder="Buscar TPE, projetista, atividade…" value={cfg.busca} onChange={(e) => setCfg({ ...cfg, busca: e.target.value })} style={{ flex: '1 1 260px' }} aria-label="Buscar" />
              <Campo rotulo="Agrupar por">
                <select value={cfg.agrupar ?? ''} onChange={(e) => setCfg({ ...cfg, agrupar: e.target.value || null, recolhidos: [] })}>
                  <option value="">Sem agrupamento</option>
                  {cols.filter((c) => ['texto', 'inteiro', 'data'].includes(c.tipo)).map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Visualização">
                <select value="" onChange={(e) => {
                  const v = e.target.value; if (!v) return
                  if (v.startsWith('p:')) { const p = VISOES_PADRAO[conj].find((x) => x.nome === v.slice(2))!; setCfg({ ...configInicial(cols, p.colunas), agrupar: p.agrupar ?? null }) }
                  else { const s = salvas.find((x) => String(x.id) === v.slice(2)); if (s) setCfg({ ...configInicial(cols), ...s.config }) }
                }}>
                  <option value="">Escolher…</option>
                  <optgroup label="Visões de referência">{VISOES_PADRAO[conj].map((p) => <option key={p.nome} value={`p:${p.nome}`}>{p.nome}</option>)}</optgroup>
                  <optgroup label="Salvas">{salvas.filter((s) => s.conjunto === conj).map((s) => <option key={s.id} value={`s:${s.id}`}>{s.nome}{s.compartilhada ? ' (compartilhada)' : ''}</option>)}</optgroup>
                </select>
              </Campo>
              {conj !== 'apontamentos' && <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Incluir arquivados</label>}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sec pequeno" onClick={salvarVisao}>Salvar visualização</button>
                <button className="btn pequeno" onClick={() => exportarAtual('xlsx')}><Icone n="exportar" /> Exportar seleção (.xlsx)</button>
                <button className="btn sec pequeno" onClick={() => exportarAtual('csv')}>CSV</button>
                <button className="btn sec pequeno" onClick={() => window.print()}>Imprimir / PDF</button>
              </div>
            </div>
            {salvas.filter((s) => s.conjunto === conj).length > 0 && (
              <div className="row small">{salvas.filter((s) => s.conjunto === conj).map((s) => (
                <span key={s.id} className="chip"><a href="#" onClick={(e) => { e.preventDefault(); setCfg({ ...configInicial(cols), ...s.config }) }}>{s.nome}</a>
                  <button aria-label={`Excluir ${s.nome}`} onClick={() => excluirVisao(s)}>×</button></span>))}</div>
            )}
            <DataGrid colunas={cols} linhas={linhas} cfg={cfg} setCfg={setCfg} />
          </div>
        </div>
      )}
    </div>
  )
}
