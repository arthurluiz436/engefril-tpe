import { Fragment, useMemo, useRef, useState } from 'react'
import type { Col } from '../lib/conjuntos'
import { dataBR, h1, hhmm, int, pct, reais } from '../lib/formato'
import { Icone } from './ui'

export interface GridConfig {
  visiveis: string[]                         // ordem = ordem das colunas na tela
  larguras: Record<string, number>
  ordenacao: { chave: string; dir: 1 | -1 }[]
  filtros: Record<string, string>
  busca: string
  agrupar: string | null
  recolhidos: string[]
}
export const configInicial = (cols: Col[], visiveis?: string[]): GridConfig => ({
  visiveis: visiveis ?? cols.filter((c) => c.padrao).map((c) => c.chave), larguras: {}, ordenacao: [], filtros: {}, busca: '', agrupar: null, recolhidos: [],
})

export function formatar(v: unknown, c: Col): string {
  if (v === null || v === undefined || v === '') return ''
  switch (c.tipo) {
    case 'data': return dataBR(String(v))
    case 'hora': return hhmm(String(v))
    case 'horas': case 'numero': return h1(Number(v))
    case 'moeda': return reais(Number(v))
    case 'inteiro': return String(v)
    case 'pct': return pct(Number(v))
    default: return String(v)
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Aplica busca, filtros por coluna e ordenação (mesma lógica usada na exportação da visualização atual). */
export function aplicar(linhas: Record<string, unknown>[], cols: Col[], cfg: GridConfig) {
  const visiveis = cfg.visiveis.map((k) => cols.find((c) => c.chave === k)!).filter(Boolean)
  const b = norm(cfg.busca.trim())
  let out = linhas.filter((l) => !b || visiveis.some((c) => norm(formatar(l[c.chave], c)).includes(b)))
  for (const [k, f] of Object.entries(cfg.filtros)) {
    if (!f) continue
    const c = cols.find((x) => x.chave === k); if (!c) continue
    const fn = norm(f.trim())
    const m = fn.match(/^(>=|<=|>|<|=)\s*(.+)$/)
    if (m && ['horas', 'numero', 'moeda', 'inteiro', 'pct'].includes(c.tipo)) {
      const alvo = Number(m[2].replace(',', '.'))
      out = out.filter((l) => { const v = Number(l[k]); return m[1] === '>=' ? v >= alvo : m[1] === '<=' ? v <= alvo : m[1] === '>' ? v > alvo : m[1] === '<' ? v < alvo : v === alvo })
    } else out = out.filter((l) => norm(formatar(l[k], c)).includes(fn))
  }
  if (cfg.ordenacao.length) {
    out = [...out].sort((a, z) => {
      for (const o of cfg.ordenacao) {
        const x = a[o.chave] as any, y = z[o.chave] as any
        if (x === y) continue
        if (x === null || x === undefined || x === '') return 1
        if (y === null || y === undefined || y === '') return -1
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * o.dir
      }
      return 0
    })
  }
  return { linhas: out, visiveis }
}

export function DataGrid({ colunas, linhas, cfg, setCfg, acoesLinha }: {
  colunas: Col[]; linhas: Record<string, unknown>[]; cfg: GridConfig; setCfg: (c: GridConfig) => void
  acoesLinha?: (l: Record<string, unknown>) => React.ReactNode
}) {
  const [limite, setLimite] = useState(300)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const redim = useRef<{ chave: string; x: number; w: number } | null>(null)
  const { linhas: filtradas, visiveis } = useMemo(() => aplicar(linhas, colunas, cfg), [linhas, colunas, cfg])

  const grupos = useMemo(() => {
    if (!cfg.agrupar) return null
    const c = colunas.find((x) => x.chave === cfg.agrupar)!
    const m = new Map<string, Record<string, unknown>[]>()
    for (const l of filtradas) { const k = formatar(l[cfg.agrupar], c) || '(vazio)'; m.set(k, [...(m.get(k) ?? []), l]) }
    return [...m.entries()]
  }, [filtradas, cfg.agrupar, colunas])

  const ordenar = (chave: string, multi: boolean) => {
    const atual = cfg.ordenacao.find((o) => o.chave === chave)
    const prox: GridConfig['ordenacao'] = atual ? (atual.dir === 1 ? [{ chave, dir: -1 }] : []) : [{ chave, dir: 1 }]
    setCfg({ ...cfg, ordenacao: multi ? [...cfg.ordenacao.filter((o) => o.chave !== chave), ...prox] : prox })
  }
  const somaNum = (ls: Record<string, unknown>[], c: Col) => ['horas', 'moeda'].includes(c.tipo) ? ls.reduce((s, l) => s + (Number(l[c.chave]) || 0), 0) : null

  const iniciarRedim = (e: React.MouseEvent, chave: string) => {
    e.preventDefault(); e.stopPropagation()
    const th = (e.target as HTMLElement).parentElement!
    redim.current = { chave, x: e.clientX, w: th.offsetWidth }
    const mover = (ev: MouseEvent) => { const r = redim.current!; setCfg({ ...cfg, larguras: { ...cfg.larguras, [r.chave]: Math.max(60, r.w + ev.clientX - r.x) } }) }
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); redim.current = null }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
  }
  const soltarCabecalho = (alvo: string) => {
    if (!arrastando || arrastando === alvo) return
    const v = cfg.visiveis.filter((k) => k !== arrastando)
    v.splice(v.indexOf(alvo), 0, arrastando)
    setCfg({ ...cfg, visiveis: v }); setArrastando(null)
  }

  const linha = (l: Record<string, unknown>, i: number) => (
    <tr key={(l.id as any) ?? (l.codigo as any) ?? (l.os as any) ?? i}>
      {visiveis.map((c) => <td key={c.chave} className={['horas', 'moeda', 'numero', 'inteiro', 'pct'].includes(c.tipo) ? 'num' : (c.largura ?? 0) >= 40 ? 'quebra' : ''}>{formatar(l[c.chave], c)}</td>)}
      {acoesLinha && <td className="nao-imprimir">{acoesLinha(l)}</td>}
    </tr>
  )

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row small muted" aria-live="polite">
        <strong style={{ color: 'var(--grafite-900)' }}>{int(filtradas.length)}</strong> de {int(linhas.length)} registros
        {Object.entries(cfg.filtros).filter(([, v]) => v).map(([k, v]) => (
          <span key={k} className="chip">{colunas.find((c) => c.chave === k)?.rotulo}: {v}
            <button aria-label="Remover filtro" onClick={() => setCfg({ ...cfg, filtros: { ...cfg.filtros, [k]: '' } })}>×</button></span>
        ))}
      </div>
      <div className="rolagem">
        <table className="tabela grade" style={{ tableLayout: Object.keys(cfg.larguras).length ? 'fixed' : 'auto' }}>
          <thead>
            <tr>
              {visiveis.map((c) => {
                const o = cfg.ordenacao.find((x) => x.chave === c.chave)
                return (
                  <th key={c.chave} className={`ordenavel ${['horas', 'moeda', 'numero', 'inteiro', 'pct'].includes(c.tipo) ? 'num' : ''}`}
                      style={{ width: cfg.larguras[c.chave] }} draggable onDragStart={() => setArrastando(c.chave)} onDragOver={(e) => e.preventDefault()}
                      onDrop={() => soltarCabecalho(c.chave)} onClick={(e) => ordenar(c.chave, e.shiftKey)}
                      title="Clique para ordenar (Shift = várias colunas). Arraste para reordenar. Puxe a borda para redimensionar."
                      aria-sort={o ? (o.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    {c.rotulo}{o ? (o.dir === 1 ? ' ▲' : ' ▼') : ''}
                    <span className="th-redim" onMouseDown={(e) => iniciarRedim(e, c.chave)} onClick={(e) => e.stopPropagation()} />
                  </th>
                )
              })}
              {acoesLinha && <th className="nao-imprimir"></th>}
            </tr>
            <tr className="nao-imprimir">
              {visiveis.map((c) => (
                <th key={c.chave} style={{ background: 'var(--cinza-100)', padding: 4, top: 37 }}>
                  <input aria-label={`Filtrar ${c.rotulo}`} placeholder={['horas', 'moeda', 'inteiro'].includes(c.tipo) ? '>= 10' : 'filtrar…'} value={cfg.filtros[c.chave] ?? ''}
                         onChange={(e) => setCfg({ ...cfg, filtros: { ...cfg.filtros, [c.chave]: e.target.value } })} style={{ minHeight: 28, padding: '3px 6px', fontSize: '.8rem' }} />
                </th>
              ))}
              {acoesLinha && <th style={{ background: 'var(--cinza-100)' }} />}
            </tr>
          </thead>
          <tbody>
            {grupos ? grupos.map(([g, ls]) => {
              const fechado = cfg.recolhidos.includes(g)
              return (
                <Fragment key={g}>
                  <tr className="linha-grupo" onClick={() => setCfg({ ...cfg, recolhidos: fechado ? cfg.recolhidos.filter((x) => x !== g) : [...cfg.recolhidos, g] })}>
                    <td colSpan={visiveis.length + (acoesLinha ? 1 : 0)}>
                      {fechado ? '▸' : '▾'} {g} <span className="muted">({ls.length})</span>
                      {visiveis.map((c) => { const s = somaNum(ls, c); return s == null ? null : <span key={c.chave} className="muted" style={{ marginLeft: 14 }}>{c.rotulo}: {formatar(s, c)}</span> })}
                    </td>
                  </tr>
                  {!fechado && ls.slice(0, limite).map(linha)}
                </Fragment>
              )
            }) : filtradas.slice(0, limite).map(linha)}
          </tbody>
          <tfoot>
            <tr>{visiveis.map((c) => { const s = somaNum(filtradas, c); return <td key={c.chave} className="num" style={{ fontWeight: 700 }}>{s == null ? '' : formatar(s, c)}</td> })}{acoesLinha && <td />}</tr>
          </tfoot>
        </table>
      </div>
      {filtradas.length > limite && <button className="btn sec pequeno" onClick={() => setLimite(limite + 500)}><Icone n="mais" /> Mostrar mais ({int(filtradas.length - limite)} restantes)</button>}
    </div>
  )
}

/** Painel lateral “Exibir colunas” (ocultar NÃO apaga dados). */
export function PainelColunas({ colunas, cfg, setCfg, padrao }: { colunas: Col[]; cfg: GridConfig; setCfg: (c: GridConfig) => void; padrao: string[] }) {
  const [arr, setArr] = useState<string | null>(null)
  const ordem = [...cfg.visiveis, ...colunas.map((c) => c.chave).filter((k) => !cfg.visiveis.includes(k))]
  return (
    <div className="card painel-colunas">
      <h3>Exibir colunas</h3>
      <p className="muted small" style={{ margin: '4px 0 8px' }}>Ocultar não apaga os registros. Arraste para mudar a ordem.</p>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <button className="btn sec pequeno" onClick={() => setCfg({ ...cfg, visiveis: colunas.map((c) => c.chave) })}>Selecionar todas</button>
        <button className="btn sec pequeno" onClick={() => setCfg({ ...cfg, visiveis: padrao, larguras: {}, ordenacao: [], filtros: {}, agrupar: null, recolhidos: [], busca: '' })}>Restaurar</button>
      </div>
      {ordem.map((k) => {
        const c = colunas.find((x) => x.chave === k)!
        const marcado = cfg.visiveis.includes(k)
        return (
          <label key={k} draggable onDragStart={() => setArr(k)} onDragOver={(e) => e.preventDefault()}
                 onDrop={() => { if (!arr || arr === k || !marcado || !cfg.visiveis.includes(arr)) return; const v = cfg.visiveis.filter((x) => x !== arr); v.splice(v.indexOf(k), 0, arr); setCfg({ ...cfg, visiveis: v }) }}>
            <input type="checkbox" checked={marcado} onChange={() => setCfg({ ...cfg, visiveis: marcado ? cfg.visiveis.filter((x) => x !== k) : [...cfg.visiveis, k] })} />
            {c.rotulo}
          </label>
        )
      })}
    </div>
  )
}
