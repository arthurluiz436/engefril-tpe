import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ambienteTeste } from '../lib/supabase'
import { Icone } from './ui'
import logoBranco from '../assets/logo-branco.png'

const MENU_PROJETISTA = [
  { to: '/', n: 'inicio', t: 'Início' },
  { to: '/minhas-tarefas', n: 'tarefas', t: 'Minhas tarefas' },
  { to: '/registrar', n: 'relogio', t: 'Registrar atividade' },
  { to: '/meus-apontamentos', n: 'lista', t: 'Meus apontamentos' },
  { to: '/cronograma', n: 'gantt', t: 'Cronograma da equipe' },
  { to: '/calendario', n: 'calendario', t: 'Calendário' },
]
const MENU_MASTER: { grupo: string; itens: { to: string; n: string; t: string }[] }[] = [
  { grupo: 'Acompanhamento', itens: [
    { to: '/master', n: 'painel', t: 'Painel' },
    { to: '/master/indicadores', n: 'grafico', t: 'Indicadores' },
    { to: '/master/os-indicadores', n: 'alvo', t: 'Indicadores por Cliente/O.S.' },
    { to: '/master/dados', n: 'dados', t: 'Central de Dados' },
  ] },
  { grupo: 'Planejamento', itens: [
    { to: '/master/os', n: 'clientes', t: 'Clientes e O.S.' },
    { to: '/master/tpes', n: 'tpe', t: 'TPEs e tarefas' },
    { to: '/master/sequencias', n: 'sequencia', t: 'Sequência por projetista' },
    { to: '/master/cronograma', n: 'gantt', t: 'Cronograma da equipe' },
    { to: '/master/calendario', n: 'calendario', t: 'Calendário' },
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

/** Faixa fixa que deixa claro que o site está ligado ao banco de TESTE. */
export function FaixaTeste() {
  return (
    <div className="faixa-teste" role="note">
      <strong>AMBIENTE DE TESTE</strong> — os dados daqui não são os oficiais. Pode mexer à vontade.
    </div>)
}

const MENU_OBSERVADOR: { grupo: string; itens: { to: string; n: string; t: string }[] }[] = [
  { grupo: 'Acompanhamento', itens: [
    { to: '/master', n: 'painel', t: 'Painel' },
    { to: '/master/indicadores', n: 'grafico', t: 'Indicadores' },
    { to: '/master/os-indicadores', n: 'alvo', t: 'Indicadores por Cliente/O.S.' },
  ] },
  { grupo: 'Planejamento (consulta)', itens: [
    { to: '/master/os', n: 'clientes', t: 'Clientes e O.S.' },
    { to: '/master/tpes', n: 'tpe', t: 'TPEs e tarefas' },
    { to: '/cronograma', n: 'gantt', t: 'Cronograma da equipe' },
    { to: '/calendario', n: 'calendario', t: 'Calendário' },
  ] },
]

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, sair } = useAuth()
  const [aberta, setAberta] = useState(false)
  const loc = useLocation()
  const master = perfil?.papel === 'master'
  const observador = perfil?.papel === 'observador'
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
        <div className="marca"><img src={logoBranco} alt="Engefril" /><span>GESTÃO DE PROJETOS - TPE</span></div>
        <nav>
          {perfil?.recurso_id && !observador && (<><div className="grupo">Meu trabalho</div>{MENU_PROJETISTA.map(link)}</>)}
          {observador && MENU_OBSERVADOR.map((g) => (<div key={g.grupo} style={{ display: 'contents' }}><div className="grupo">{g.grupo}</div>{g.itens.map(link)}</div>))}
          {master && MENU_MASTER.map((g) => (<div key={g.grupo} style={{ display: 'contents' }}><div className="grupo">{g.grupo}</div>{g.itens.map(link)}</div>))}
        </nav>
        <div className="rodape">
          <div style={{ color: '#fff', fontWeight: 600 }}>{perfil?.nome || perfil?.email}</div>
          <div style={{ color: '#9aa3ad', marginBottom: 10 }}>{master ? 'Supervisor' : observador ? 'Observador · somente consulta' : 'Projetista'}{perfil?.recurso_nome ? ` · ${perfil.recurso_nome}` : ''}</div>
          {ambienteTeste && <div className="selo-teste">Teste</div>}
          <button className="btn sec pequeno" onClick={sair}><Icone n="sair" /> Sair</button>
        </div>
      </aside>
      <main className="conteudo" id="conteudo" key={loc.pathname}>
        {ambienteTeste && <FaixaTeste />}
        {children}
      </main>
    </div>
  )
}
