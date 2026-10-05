import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import AuthLayout from '../components/AuthLayout'
import Icon from '../components/Icon'
import { useSessao } from '../sessao/sessao-contexto.js'

// D1.1/D3: paciente entra com CPF, funcionário com e-mail; o "@" decide a rota.
function pedidoDeLogin(identificador, senha) {
  if (identificador.includes('@')) {
    return { caminho: '/api/auth/funcionario/login', corpo: { email: identificador.trim(), senha } }
  }
  return { caminho: '/api/auth/cliente/login', corpo: { cpf: somenteDigitos(identificador), senha } }
}

export default function Login() {
  const { entrar } = useSessao()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const { caminho, corpo } = pedidoDeLogin(identificador, senha)
      entrar(await api.pedir(caminho, { metodo: 'POST', corpo }))
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setEnviando(false)
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={enviar}>
        <div className="field">
          <label htmlFor="login-identificador"><Icon name="mail" size={15} /> CPF ou e-mail</label>
          <div className="input-wrap">
            <input
              id="login-identificador"
              autoComplete="username"
              placeholder="CPF (paciente) ou e-mail (clínica)"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="login-senha"><Icon name="lock" size={15} /> Senha</label>
          <div className="input-wrap">
            <input
              id="login-senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <button type="button" className="input-action" onClick={() => setMostrarSenha(!mostrarSenha)} aria-label="Mostrar senha"><Icon name="eye" /></button>
          </div>
        </div>
        <div className="auth-card__helper"><Link to="/recuperar-senha">Esqueci minha senha</Link></div>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <button className="primary-btn primary-btn--full" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="auth-switch">Primeiro acesso? <Link to="/cadastro">Cadastre-se</Link></p>
      </form>
    </AuthLayout>
  )
}
