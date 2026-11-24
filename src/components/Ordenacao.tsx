import { useState, type ReactNode } from 'react'

/**
 * Ordenação de tabela por coluna: 1º clique ordena do menor para o maior (A→Z), o 2º inverte.
 * Textos em ordem alfabética (pt-BR), números e datas pelo valor; vazios sempre no fim.
 */
export type Ordem = { k: string; dir: 1 | -1 }
export function compararValores(va: any, vb: any, dir: 1 | -1): number {
  const vazio = (v: any) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))
  if (vazio(va) || vazio(vb)) return vazio(va) && vazio(vb) ? 0 : vazio(va) ? 1 : -1
  const r = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) : va - vb
  return r * dir
}
export function useOrdem(padrao: Ordem) {
  const [ord, setOrd] = useState<Ordem>(padrao)
  const ordenar = <T,>(xs: T[], valor: (x: T, k: string) => any) => [...xs].sort((a, b) => compararValores(valor(a, ord.k), valor(b, ord.k), ord.dir))
  const Th = ({ k, children, num, title }: { k: string; children: ReactNode; num?: boolean; title?: string }) => {
    const ativo = ord.k === k
    return (
      <th className={num ? 'num' : ''} title={title} aria-sort={ativo ? (ord.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`th-ordem ${ativo ? 'ativo' : ''}`} onClick={() => setOrd({ k, dir: ativo ? (ord.dir === 1 ? -1 : 1) : 1 })}>
          {children}<span className="seta-ordem" aria-hidden="true">{ativo ? (ord.dir === 1 ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>)
  }
  return { ord, ordenar, Th }
}
