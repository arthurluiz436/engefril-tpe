import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { dataBR, diasEntre, hm, hojeISO, osBR } from '../lib/formato'

/**
 * Cartão de detalhes que segue o mouse (substitui o "quadro preto" do navegador).
 * Uso: const dica = useDica(); <g onMouseMove={(e) => dica.mostrar(e, <CartaoTpe … />)} onMouseLeave={dica.esconder} /> … {dica.elemento}
 */
export function useDica() {
  const [d, setD] = useState<{ x: number; y: number; conteudo: ReactNode } | null>(null)
  return {
    mostrar: (ev: { clientX: number; clientY: number }, conteudo: ReactNode) => setD({ x: ev.clientX, y: ev.clientY, conteudo }),
    esconder: () => setD(null),
    elemento: d ? <Flutuante x={d.x} y={d.y}>{d.conteudo}</Flutuante> : null,
  }
}

function Flutuante({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x + 16, top: y + 14 })
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    let left = x + 16, top = y + 14
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, x - r.width - 16)
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8)
    setPos({ left, top })
  }, [x, y, children])
  return <div ref={ref} className="cartao-dica" style={pos} role="tooltip">{children}</div>
}

export type Situacao = { rot: string; cls: 'ok' | 'antes' | 'atraso' | 'neutro' }
/** Situação do prazo de uma TPE: concluída no prazo / adiantada / atrasada, ou em aberto dentro do prazo / atrasada. */
export function situacaoTpe(t: { status?: string; prazo?: string | null; data_fim?: string | null }): Situacao & { dias: number | null } {
  const pz = t.prazo ? String(t.prazo).slice(0, 10) : null
  if (!pz) return { rot: 'Sem prazo definido', cls: 'neutro', dias: null }
  if (t.status === 'FINALIZADA') {
    const fim = t.data_fim ? String(t.data_fim).slice(0, 10) : null
    if (!fim) return { rot: 'Finalizada (sem data)', cls: 'neutro', dias: null }
    const d = diasEntre(pz, fim)
    if (d > 0) return { rot: `Concluída com ${d} dia(s) de atraso`, cls: 'atraso', dias: d }
    if (d < 0) return { rot: `Concluída ${-d} dia(s) antes do prazo`, cls: 'antes', dias: d }
    return { rot: 'Concluída no prazo', cls: 'ok', dias: 0 }
  }
  const hoje = hojeISO()
  if (pz < hoje) return { rot: `Atrasada há ${diasEntre(pz, hoje)} dia(s)`, cls: 'atraso', dias: diasEntre(pz, hoje) }
  const falta = diasEntre(hoje, pz)
  return { rot: falta === 0 ? 'Vence hoje' : `Dentro do prazo · faltam ${falta} dia(s)`, cls: 'ok', dias: -falta }
}

const STATUS: Record<string, string> = { 'FINALIZADA': 'verde', 'EM ANDAMENTO': 'azul', 'PAUSADA': 'ambar', 'NÃO INICIADA': 'cinza' }

export interface Numero { rot: string; val: ReactNode; sub?: ReactNode }
/** Conteúdo padrão do cartão de uma TPE. */
export function CartaoTpe({ t, cor, projetista, numeros, situacao, extra, dias }: {
  t: any; cor?: string; projetista?: string | null; numeros?: Numero[]; situacao?: Situacao | null; extra?: ReactNode
  dias?: { dia: string; horas: number; extras?: number; texto?: string | null; ativo?: boolean }[]
}) {
  return (
    <>
      <div className="cd-cab" style={{ borderLeftColor: cor ?? 'var(--azul)' }}>
        <div className="cd-cod">{t.codigo ?? t.tpe_codigo}{t.status && <span className={`cd-tag ${STATUS[t.status] ?? 'cinza'}`}>{String(t.status).toLowerCase()}</span>}</div>
        {t.os != null && <div><strong>OS {osBR(t.os)}</strong>{t.cliente ? <span className="muted"> · {t.cliente}</span> : null}</div>}
        {(t.principal || t.grupo) && <div className="muted">{[t.principal, t.grupo].filter(Boolean).join(' › ')}</div>}
      </div>
      <div className="cd-corpo">
        {(t.descricao || projetista) && <div>{t.descricao && <div className="muted">{t.descricao}</div>}{projetista && <div style={{ color: cor, fontWeight: 700 }}>● {projetista}</div>}</div>}
        {situacao && <div className={`cd-situacao ${situacao.cls}`}>{situacao.rot}</div>}
        {numeros && numeros.length > 0 && <div className="cd-grade" style={{ gridTemplateColumns: `repeat(${Math.min(3, numeros.length)}, 1fr)` }}>
          {numeros.map((n) => <div key={n.rot}><span>{n.rot}</span><strong>{n.val}</strong>{n.sub && <em>{n.sub}</em>}</div>)}
        </div>}
        {extra}
        {dias && dias.length > 0 && <div className="cd-dias">
          {dias.slice(0, 8).map((a) => <div key={a.dia + (a.texto ?? '')} className={`cd-dia ${a.ativo ? 'ativo' : ''}`}><strong>{dataBR(a.dia).slice(0, 5)}</strong><span>{hm(a.horas)}</span>
            <span className="muted">{a.texto || '—'}{a.extras && a.extras > 0.0001 ? <b className="ind-he"> · {hm(a.extras)} extra</b> : null}</span></div>)}
          {dias.length > 8 && <div className="muted small">… e mais {dias.length - 8} dia(s)</div>}
        </div>}
      </div>
    </>
  )
}
