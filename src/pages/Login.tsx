import { useState, type FormEvent } from 'react'
import { supabase, mensagemErro } from '../lib/supabase'
import { Aviso, Campo } from '../components/ui'
import logoGrafite from '../assets/logo-grafite.png'
import logoBranco from '../assets/logo-branco.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null); setOk(null); setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}${location.pathname}#/definir-senha` })
        if (error) throw error
        setOk('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.')
      }
    } catch (x) { setErro(mensagemErro(x)) } finally { setEnviando(false) }
  }

  return (
    <div className="login">
      <div className="lado">
        <img src={logoBranco} alt="Engefril" style={{ width: 190 }} />
        <div>
          <h1>GESTÃO DE PROJETOS - TAREFAS E APONTAMENTOS</h1>
          <p style={{ maxWidth: 440 }}>Tarefas de projeto, sequência de execução e registro das horas da engenharia em um só lugar, com acesso individual e seguro.</p>
        </div>
        <p className="small">Engefril · Refrigeração industrial e termoisolantes</p>
      </div>
      <div className="form">
        <form className="card stack" onSubmit={enviar} noValidate>
          <img src={logoGrafite} alt="Engefril" style={{ width: 140 }} />
          <div>
            <h2>{modo === 'entrar' ? 'Entrar' : 'Recuperar senha'}</h2>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{modo === 'entrar' ? 'Use o e-mail cadastrado pelo administrador.' : 'Informe seu e-mail para receber o link.'}</p>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {ok && <Aviso tipo="ok">{ok}</Aviso>}
          <Campo rotulo="E-mail"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Campo>
          {modo === 'entrar' && <Campo rotulo="Senha"><input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></Campo>}
          <button className="btn" disabled={enviando || !email || (modo === 'entrar' && !senha)}>{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Enviar link'}</button>
          <button type="button" className="btn fantasma pequeno" onClick={() => { setModo(modo === 'entrar' ? 'recuperar' : 'entrar'); setErro(null); setOk(null) }}>
            {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para entrar'}
          </button>
          <p className="muted small" style={{ margin: 0 }}>Não há cadastro aberto: o acesso é criado por convite do Supervisor.</p>
        </form>
      </div>
    </div>
  )
}
