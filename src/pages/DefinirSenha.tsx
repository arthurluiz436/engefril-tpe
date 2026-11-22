import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, mensagemErro } from '../lib/supabase'
import { Aviso, Campo, Cabecalho } from '../components/ui'

/** Tela usada pelo link de convite e de recuperação de senha. */
export default function DefinirSenha() {
  const [s1, setS1] = useState(''); const [s2, setS2] = useState('')
  const [erro, setErro] = useState<string | null>(null); const [ok, setOk] = useState(false)
  const nav = useNavigate()
  const fraca = s1.length > 0 && (s1.length < 10 || !/[A-Za-z]/.test(s1) || !/\d/.test(s1))
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    if (fraca) return setErro('A senha precisa de pelo menos 10 caracteres, com letras e números.')
    if (s1 !== s2) return setErro('As senhas não conferem.')
    const { error } = await supabase.auth.updateUser({ password: s1 })
    if (error) return setErro(mensagemErro(error))
    setOk(true); setTimeout(() => nav('/'), 1500)
  }
  return (
    <div style={{ maxWidth: 440, margin: '60px auto', padding: 16 }}>
      <form className="card stack" onSubmit={enviar}>
        <Cabecalho titulo="Criar senha" texto="Defina a senha que você usará para entrar no sistema." />
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ok && <Aviso tipo="ok">Senha salva. Redirecionando…</Aviso>}
        <Campo rotulo="Nova senha" ajuda="Mínimo de 10 caracteres, com letras e números." erro={fraca ? 'Senha fraca' : null}>
          <input type="password" autoComplete="new-password" value={s1} onChange={(e) => setS1(e.target.value)} aria-invalid={fraca} />
        </Campo>
        <Campo rotulo="Repita a senha"><input type="password" autoComplete="new-password" value={s2} onChange={(e) => setS2(e.target.value)} /></Campo>
        <button className="btn" disabled={!s1 || !s2}>Salvar senha</button>
      </form>
    </div>
  )
}
