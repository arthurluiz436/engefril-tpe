import { useEffect, useMemo, useState } from 'react'
import { useBase } from '../../lib/base'
import { useAuth } from '../../lib/auth'
import { supabase, mensagemErro } from '../../lib/supabase'
import { indicadores } from '../../lib/calculo'
import { paraParametros } from '../../lib/dados'
import { reconciliar, statusItem } from '../../lib/reconciliacao'
import { validarArquivo } from '../../lib/importador'
import { dataHoraBR } from '../../lib/formato'
import { Aviso, Cabecalho, Carregando, useAvisar } from '../../components/ui'

const COR: Record<string, string> = { validado: 'verde', diferenca_explicada: 'ambar', divergente: 'vermelho', pendente: '' }
const ROT: Record<string, string> = { validado: 'Validado', diferenca_explicada: 'Diferença explicada', divergente: 'Divergente', pendente: 'Pendente' }

export default function Integridade() {
  const { base } = useBase()
  const { perfil } = useAuth()
  const avisar = useAvisar()
  const [backups, setBackups] = useState<any[]>([])
  const [rec, setRec] = useState<any[]>([])
  const [ocupado, setOcupado] = useState(false)
  const carregar = () => {
    supabase.from('backups_registro').select('*').order('criado_em', { ascending: false }).limit(20).then(({ data }) => setBackups(data ?? []))
    supabase.from('reconciliacao').select('*').order('executado_em', { ascending: false }).limit(200).then(({ data }) => setRec(data ?? []))
  }
  useEffect(carregar, [])

  const checks = useMemo(() => {
    if (!base) return []
    const somaT = base.tpes.reduce((s: number, t: any) => s + t.horas_totais, 0)
    const somaA = base.aps.reduce((s: number, a: any) => s + a.horas_totais, 0)
    const cT = base.tpes.reduce((s: number, t: any) => s + (t.custo_total ?? 0), 0)
    const cA = base.aps.reduce((s: number, a: any) => s + (a.custo_total ?? 0), 0)
    const cat = new Set<string>()
    const semCusto = base.aps.filter((a: any) => a.custo_hh == null).length
    const sobre = (() => { let n = 0; const m = new Map<string, any[]>(); for (const a of base.aps) { const k = `${a.recurso_id}|${a.dia}`; m.set(k, [...(m.get(k) ?? []), a]) }
      for (const g of m.values()) { const s = [...g].sort((x, y) => x.hora_inicio.localeCompare(y.hora_inicio)); for (let i = 1; i < s.length; i++) if (s[i].hora_inicio < s[i - 1].hora_fim) n++ } return n })()
    void cat
    return [
      { nome: 'Horas por TPE = horas dos apontamentos', ok: Math.abs(somaT - somaA) < 1e-6, det: `${somaT.toFixed(2)} h × ${somaA.toFixed(2)} h` },
      { nome: 'Custo por TPE = custo dos apontamentos', ok: Math.abs(cT - cA) < 0.01, det: `R$ ${cT.toFixed(2)} × R$ ${cA.toFixed(2)}` },
      { nome: 'Apontamentos sem custo H/H vigente', ok: semCusto === 0, det: `${semCusto} lançamentos (cadastre o custo em Parâmetros)` },
      { nome: 'Lançamentos sobrepostos (mesmo projetista e dia)', ok: sobre === 0, det: `${sobre} pares — confira em Apontamentos` },
      { nome: 'TPEs em aberto sem responsável', ok: base.tpes.filter((t: any) => t.status !== 'FINALIZADA' && !t.responsavel_id).length === 0, det: `${base.tpes.filter((t: any) => t.status !== 'FINALIZADA' && !t.responsavel_id).length} TPEs` },
      { nome: 'O.S. sem nome de cliente', ok: base.os.filter((o: any) => !o.nome).length === 0, det: `${base.os.filter((o: any) => !o.nome).length} O.S.` },
    ]
  }, [base])

  async function executarReconciliacao(f: File) {
    const v = validarArquivo(f); if (v) return avisar('erro', v)
    if (!base) return
    setOcupado(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer())
      const k = indicadores(base.aps, base.tpes, base.os, base.recursos.map((r: any) => r.nome), paraParametros(base.parametros), base.feriados, { agruparRevisoes: false })
      const itens = reconciliar(wb, k)
      const execucao = crypto.randomUUID()
      const linhas = itens.map((i) => {
        const st = statusItem(i)
        const dif = typeof i.excel === 'number' && typeof i.web === 'number' ? i.web - i.excel : null
        return { execucao, indicador: i.indicador, referencia: i.referencia, formula: i.formula, valor_excel: String(i.excel ?? ''), valor_web: String(i.web ?? ''),
          diferenca: dif, tolerancia: i.tolerancia, status: st, explicacao: st === 'diferenca_explicada' ? i.explicacao : null, arquivo: f.name, executado_por: perfil?.user_id }
      })
      const { error } = await supabase.from('reconciliacao').insert(linhas)
      if (error) throw error
      avisar('ok', `Reconciliação registrada: ${linhas.filter((l) => l.status === 'validado').length} validados, ${linhas.filter((l) => l.status === 'diferenca_explicada').length} explicados, ${linhas.filter((l) => l.status === 'divergente').length} divergentes.`)
      carregar()
    } catch (e) { avisar('erro', mensagemErro(e)) } finally { setOcupado(false) }
  }
  async function aprovar(execucao: string) {
    const { error } = await supabase.from('reconciliacao').update({ aprovado_por: perfil?.user_id, aprovado_em: new Date().toISOString() }).eq('execucao', execucao).neq('status', 'divergente')
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'Itens validados/explicados aprovados. Divergências continuam pendentes.'); carregar()
  }

  if (!base) return <Carregando />
  const ultima = rec[0]?.execucao
  const atual = rec.filter((r) => r.execucao === ultima)
  const bOk = backups.find((b) => b.restauracao_ok)
  return (
    <div className="stack">
      <Cabecalho titulo="Integridade dos dados e backups" texto="Confira quais indicadores foram validados contra a planilha original, as verificações automáticas da base e a situação dos backups." />
      <div className="grid2">
        <div className="card">
          <h2>Backups</h2>
          {bOk ? <Aviso tipo="ok"><strong>Backup verificado</strong> em {dataHoraBR(bOk.restauracao_em ?? bOk.criado_em)} — restauração de teste concluída. {bOk.evidencia}</Aviso>
            : <Aviso tipo="atencao">Nenhum backup com restauração de teste registrada ainda. Configure o workflow de backup (docs/BACKUP.md). Esta tela só mostra “verificado” com evidência real.</Aviso>}
          <table className="tabela" style={{ marginTop: 10 }}><thead><tr><th>Quando</th><th>Arquivo</th><th>Restauração</th></tr></thead>
            <tbody>{backups.map((b) => <tr key={b.id}><td>{dataHoraBR(b.criado_em)}</td><td className="small">{b.arquivo}<div className="muted">{b.sha256?.slice(0, 16)}</div></td>
              <td>{b.restauracao_ok === true ? <span className="badge verde">OK</span> : b.restauracao_ok === false ? <span className="badge vermelho">falhou</span> : <span className="badge">não testada</span>}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Verificações automáticas</h2>
          <table className="tabela"><tbody>{checks.map((c) => <tr key={c.nome}><td><span className={`badge ${c.ok ? 'verde' : 'ambar'}`}>{c.ok ? 'OK' : 'Atenção'}</span></td><td>{c.nome}<div className="small muted">{c.det}</div></td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><h2>Reconciliação com a planilha original</h2><p className="muted small" style={{ margin: '4px 0 0' }}>Envie a planilha VER_035: o app lê os valores calculados pelo Excel (aba KPI) e compara com o motor web sobre os dados do banco. Nada é importado.</p></div>
          <label className="btn">{ocupado ? 'Processando…' : 'Executar reconciliação'}<input type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => e.target.files?.[0] && executarReconciliacao(e.target.files[0])} /></label>
        </div>
        {atual.length === 0 ? <p className="muted">Nenhuma reconciliação executada.</p> : (<>
          <div className="row small"><span>Execução de {dataHoraBR(atual[0].executado_em)} · arquivo {atual[0].arquivo}</span>
            {['validado', 'diferenca_explicada', 'divergente', 'pendente'].map((s) => <span key={s} className={`badge ${COR[s]}`}>{ROT[s]}: {atual.filter((r) => r.status === s).length}</span>)}
            {atual.some((r) => !r.aprovado_em) && <button className="btn sec pequeno" onClick={() => aprovar(ultima)}>Aprovar validados e explicados</button>}</div>
          {atual.some((r) => r.status === 'divergente') && <Aviso tipo="erro">Há divergências não explicadas: o aceite dos componentes afetados fica bloqueado até a análise.</Aviso>}
          <div className="rolagem" style={{ maxHeight: 460 }}><table className="tabela"><thead><tr><th>Indicador</th><th>Referência</th><th>Fórmula</th><th className="num">Excel</th><th className="num">Web</th><th className="num">Diferença</th><th>Status</th><th>Explicação</th><th>Aprovado</th></tr></thead>
            <tbody>{atual.map((r) => <tr key={r.id}><td>{r.indicador}</td><td className="small">{r.referencia}</td><td className="small muted">{r.formula}</td>
              <td className="num">{fmt(r.valor_excel)}</td><td className="num">{fmt(r.valor_web)}</td><td className="num">{r.diferenca == null ? '—' : Number(r.diferenca).toFixed(6)}</td>
              <td><span className={`badge ${COR[r.status]}`}>{ROT[r.status]}</span></td><td className="small">{r.explicacao}</td><td className="small">{r.aprovado_em ? dataHoraBR(r.aprovado_em) : '—'}</td></tr>)}</tbody></table></div>
        </>)}
      </div>
    </div>
  )
}
const fmt = (s: string) => (s !== '' && !isNaN(Number(s)) ? Number(s).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : s)
