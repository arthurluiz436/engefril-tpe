import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Icone } from './ui'
import logoBranco from '../assets/logo-branco.png'

const MENU_PROJETISTA = [
  { to: '/', n: 'inicio', t: 'Início' },
  { to: '/minhas-tarefas', n: 'tarefas', t: 'Minhas tarefas' },
  { to: '/registrar', n: 'relogio', t: 'Registrar atividade' },
  { to: '/meus-apontamentos', n: 'lista', t: 'Meus apontamentos' },
]
const MENU_MASTER: { grupo: string; itens: { to: string; n: string; t: string }[] }[] = [
  { grupo: 'Acompanhamento', itens: [
    { to: '/master', n: 'painel', t: 'Painel' },
    { to: '/master/indicadores', n: 'grafico', t: 'Indicadores' },
    { to: '/master/dados', n: 'dados', t: 'Central de Dados' },
  ] },
  { grupo: 'Planejamento', itens: [
    { to: '/master/tpes', n: 'tpe', t: 'TPEs e tarefas' },
    { to: '/master/sequencias', n: 'sequencia', t: 'Sequência por projetista' },
    { to: '/master/os', n: 'clientes', t: 'Clientes e O.S.' },
    { to: '/master/apontamentos', n: 'relogio', t: 'Apontamentos' },
  ] },
  { grupo: 'Entrada e saída', itens: [
    { to: '/master/importar', n: 'importar', t: 'Importar planilha' },
    { to: '/master/exportar', n: 'exportar', t: 'Exportar dados' },
  ] },
  { grupo: 'Administração', itens: [
    { to: '/master/integridade', n: 'escudo', t: 'Integridade e backups' },
    { to: '/master/usuarios', n: 'usuarios', t: 'Usuários' },
    { to: '/master/parametros', n: 'config', t: 'Parâmetros' },
    { to: '/master/auditoria', n: 'historico', t: 'Auditoria' },
  ] },
]

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, sair } = useAuth()
  const [aberta, setAberta] = useState(false)
  const loc = useLocation()
  const master = perfil?.papel === 'master'
  const link = (i: { to: string; n: string; t: string }) => (
    <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/master'} className={({ isActive }) => (isActive ? 'ativo' : '')} onClick={() => setAberta(false)}>
      <Icone n={i.n} /> {i.t}
    </NavLink>
  )
  return (
    <div className="app">
      <div className="topo">
        <button className="btn fantasma pequeno" style={{ color: '#fff' }} onClick={() => setAberta(true)} aria-label="Abrir menu"><Icone n="menu" t={22} /></button>
        <img src={logoBranco} alt="Engefril" />
      </div>
      <aside className={`sidebar ${aberta ? 'aberta' : ''}`} aria-label="Menu principal">
        <div className="marca"><img src={logoBranco} alt="Engefril" /><span>Gestão de TPEs</span></div>
        <nav>
          {perfil?.recurso_id && (<><div className="grupo">Meu trabalho</div>{MENU_PROJETISTA.map(link)}</>)}
          {master && MENU_MASTER.map((g) => (<div key={g.grupo} style={{ display: 'contents' }}><div className="grupo">{g.grupo}</div>{g.itens.map(link)}</div>))}
        </nav>
        <div className="rodape">
          <div style={{ color: '#fff', fontWeight: 600 }}>{perfil?.nome || perfil?.email}</div>
          <div style={{ color: '#9aa3ad', marginBottom: 10 }}>{master ? 'Administrador Master' : 'Projetista'}{perfil?.recurso_nome ? ` · ${perfil.recurso_nome}` : ''}</div>
          <button className="btn sec pequeno" onClick={sair}><Icone n="sair" /> Sair</button>
        </div>
      </aside>
      <main className="conteudo" id="conteudo" key={loc.pathname}>{children}</main>
    </div>
  )
}
