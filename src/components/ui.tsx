import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// ------------------------------------------------------------------ ícones (SVG próprios, traço 1.8)
const P: Record<string, string> = {
  inicio: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tarefas: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  lista: 'M4 6h16M4 12h16M4 18h10',
  painel: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z',
  tpe: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  sequencia: 'M8 6h12M8 12h12M8 18h12M3 5v3M3 11v3M3 17v3',
  clientes: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  dados: 'M4 5h16v14H4zM4 10h16M10 5v14',
  exportar: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  importar: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  grafico: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  usuarios: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.6V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 9H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v4l3 2',
  sair: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  mais: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  lixo: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cima: 'M12 19V5M5 12l7-7 7 7', baixo: 'M12 5v14M19 12l-7 7-7-7', fechar: 'M6 6l12 12M18 6L6 18',
  arquivo: 'M3 7h18v13H3zM3 7l2-4h14l2 4M10 12h4',
}
export function Icone({ n, t = 18 }: { n: keyof typeof P | string; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n] ?? P.info} />
    </svg>
  )
}

export function Cabecalho({ titulo, texto, acoes }: { titulo: string; texto?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="cabecalho">
      <div><h1>{titulo}</h1>{texto && <p>{texto}</p>}</div>
      {acoes && <div className="row nao-imprimir">{acoes}</div>}
    </header>
  )
}

export function Kpi({ rotulo, valor, sub, titulo }: { rotulo: string; valor: ReactNode; sub?: ReactNode; titulo?: string }) {
  return (
    <div className="card kpi" title={titulo}>
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'ok' | 'erro' | 'atencao'; children: ReactNode }) {
  const ic = tipo === 'ok' ? 'check' : tipo === 'info' ? 'info' : 'alerta'
  return <div className={`aviso ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}><Icone n={ic} /><div>{children}</div></div>
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="row" style={{ padding: 24 }} role="status"><div className="spinner" /> <span className="muted">{texto}</span></div>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>
}

export function Campo({ rotulo, ajuda, erro, children }: { rotulo: string; ajuda?: ReactNode; erro?: string | null; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      {ajuda && <span className="ajuda">{ajuda}</span>}
      {children}
      {erro && <span className="erro-campo">{erro}</span>}
    </label>
  )
}

const COR_STATUS: Record<string, string> = {
  'FINALIZADA': 'verde', 'EM ANDAMENTO': 'azul', 'PAUSADA': 'ambar', 'NÃO INICIADA': '', 'ATRASADA': 'vermelho', 'NO PRAZO': 'verde', 'VENCE EM BREVE': 'ambar',
}
export function Selo({ v }: { v?: string | null }) {
  if (!v) return <span className="muted">—</span>
  return <span className={`badge ${COR_STATUS[v] ?? ''}`}>{v}</span>
}

export function Dialogo({ titulo, aberto, aoFechar, children, largo }: { titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; largo?: boolean }) {
  if (!aberto) return null
  return (
    <div className="dialogo-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()} onKeyDown={(e) => e.key === 'Escape' && aoFechar()}>
      <div className={`dialogo ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h2>{titulo}</h2>
          <button className="btn fantasma pequeno" onClick={aoFechar} aria-label="Fechar"><Icone n="fechar" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ notificações
type Toast = { id: number; tipo: 'ok' | 'erro' | 'info' | 'atencao'; texto: string }
const ToastCtx = createContext<(tipo: Toast['tipo'], texto: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const avisar = useCallback((tipo: Toast['tipo'], texto: string) => {
    const id = Date.now() + Math.random()
    setLista((l) => [...l, { id, tipo, texto }])
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 9000 : 5000)
  }, [])
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toast" aria-live="polite">{lista.map((t) => <Aviso key={t.id} tipo={t.tipo}>{t.texto}</Aviso>)}</div>
    </ToastCtx.Provider>
  )
}
export const useAvisar = () => useContext(ToastCtx)

/** Confirmação explícita para operações sensíveis. */
export function useConfirmar() {
  const [estado, setEstado] = useState<{ titulo: string; texto: ReactNode; ok: string; resolve: (v: boolean) => void; perigo?: boolean } | null>(null)
  const confirmar = (titulo: string, texto: ReactNode, ok = 'Confirmar', perigo = false) =>
    new Promise<boolean>((resolve) => setEstado({ titulo, texto, ok, resolve, perigo }))
  const elemento = estado && (
    <Dialogo titulo={estado.titulo} aberto aoFechar={() => { estado.resolve(false); setEstado(null) }}>
      <div className="stack">
        <div>{estado.texto}</div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sec" onClick={() => { estado.resolve(false); setEstado(null) }}>Cancelar</button>
          <button className={`btn ${estado.perigo ? 'perigo' : ''}`} onClick={() => { estado.resolve(true); setEstado(null) }}>{estado.ok}</button>
        </div>
      </div>
    </Dialogo>
  )
  return { confirmar, elemento }
}
