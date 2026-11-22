import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { BaseProvider } from './lib/base'
import { configurado } from './lib/supabase'
import { Layout } from './components/Layout'
import { Aviso, Carregando, ToastProvider } from './components/ui'
import Login from './pages/Login'
import DefinirSenha from './pages/DefinirSenha'
import Inicio from './pages/projetista/Inicio'
import MinhasTarefas from './pages/projetista/MinhasTarefas'
import RegistrarAtividade from './pages/projetista/RegistrarAtividade'
import MeusApontamentos from './pages/projetista/MeusApontamentos'

// telas do Master carregadas sob demanda (o projetista não baixa esse código)
const Painel = lazy(() => import('./pages/master/Painel'))
const Indicadores = lazy(() => import('./pages/master/Indicadores'))
const CentralDados = lazy(() => import('./pages/master/CentralDados'))
const Tpes = lazy(() => import('./pages/master/Tpes'))
const Sequencias = lazy(() => import('./pages/master/Sequencias'))
const OrdensServico = lazy(() => import('./pages/master/OrdensServico'))
const ApontamentosMaster = lazy(() => import('./pages/master/ApontamentosMaster'))
const Importar = lazy(() => import('./pages/master/Importar'))
const Exportar = lazy(() => import('./pages/master/Exportar'))
const Integridade = lazy(() => import('./pages/master/Integridade'))
const Usuarios = lazy(() => import('./pages/master/Usuarios'))
const Parametros = lazy(() => import('./pages/master/Parametros'))
const Auditoria = lazy(() => import('./pages/master/Auditoria'))

/** Guarda de rota: só melhora a navegação. A proteção real está nas políticas RLS do banco. */
function SoMaster({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  if (perfil?.papel !== 'master') return <Aviso tipo="erro">Acesso restrito ao Supervisor.</Aviso>
  return <BaseProvider>{children}</BaseProvider>
}

function Rotas() {
  const { sessao, perfil, carregando } = useAuth()
  if (carregando) return <Carregando texto="Verificando acesso…" />
  if (!sessao) return <Routes><Route path="/definir-senha" element={<DefinirSenha />} /><Route path="*" element={<Login />} /></Routes>
  if (!perfil) return <div style={{ padding: 24 }}><Aviso tipo="atencao">Seu login não tem perfil no sistema. Peça ao Supervisor para concluir seu cadastro.</Aviso></div>
  if (!perfil.ativo) return <div style={{ padding: 24 }}><Aviso tipo="erro">Seu acesso está desativado. Fale com o Supervisor.</Aviso></div>
  const inicial = perfil.papel === 'master' && !perfil.recurso_id ? <Navigate to="/master" replace /> : <Inicio />
  return (
    <Layout>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={inicial} />
          <Route path="/definir-senha" element={<DefinirSenha />} />
          <Route path="/minhas-tarefas" element={<MinhasTarefas />} />
          <Route path="/registrar" element={<RegistrarAtividade />} />
          <Route path="/meus-apontamentos" element={<MeusApontamentos />} />
          <Route path="/master/*" element={<SoMaster><Routes>
            <Route index element={<Painel />} />
            <Route path="indicadores" element={<Indicadores />} />
            <Route path="dados" element={<CentralDados />} />
            <Route path="tpes" element={<Tpes />} />
            <Route path="sequencias" element={<Sequencias />} />
            <Route path="os" element={<OrdensServico />} />
            <Route path="apontamentos" element={<ApontamentosMaster />} />
            <Route path="importar" element={<Importar />} />
            <Route path="exportar" element={<Exportar />} />
            <Route path="integridade" element={<Integridade />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="parametros" element={<Parametros />} />
            <Route path="auditoria" element={<Auditoria />} />
          </Routes></SoMaster>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default function App() {
  if (!configurado) return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: 16 }}>
      <Aviso tipo="atencao"><strong>Aplicativo não configurado.</strong> Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja docs/PUBLICACAO.md).</Aviso>
    </div>
  )
  return <ToastProvider><AuthProvider><HashRouter><Rotas /></HashRouter></AuthProvider></ToastProvider>
}
