import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import AuthLayout from '../components/AuthLayout'
import Icon from '../components/Icon'
import { useSessao } from '../sessao/sessao-contexto.js'

// D15/D19: CPF e telefone pedem o código; a confirmação cria a conta e já entra logado.
// Paciente que a clínica já cadastrou recebe o código no telefone que ela tem.
export default function Cadastro() {
  const { entrar } = useSessao()
  const [etapa, setEtapa] = useState('pedido')
  const [dados, setDados] = useState({ cpf: '', telefone: '', codigo: '', nome: '', email: '', nascimento: '', senha: '' })
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const alterar = (campo) => (evento) => setDados({ ...dados, [campo]: evento.target.value })

  async function executar(acao) {
    setErro('')
    setEnviando(true)
    try {
      await acao()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  const pedirCodigo = () =>
    executar(async () => {
      const corpo = { cpf: somenteDigitos(dados.cpf), telefone: somenteDigitos(dados.telefone) }
      const resposta = await api.pedir('/api/auth/cliente/cadastro/codigo', { metodo: 'POST', corpo })
      setAviso(resposta.mensagem)
      setEtapa('confirmacao')
    })

  const confirmar = () =>
    executar(async () => {
      const corpo = {
        cpf: somenteDigitos(dados.cpf),
        telefone: somenteDigitos(dados.telefone),
        codigo: dados.codigo,
        nome: dados.nome,
        senha: dados.senha,
        ...(dados.email && { email: dados.email }),
        ...(dados.nascimento && { nascimento: dados.nascimento }),
      }
      entrar(await api.pedir('/api/auth/cliente/cadastro/confirmar', { metodo: 'POST', corpo }))
    })

  function enviar(evento) {
    evento.preventDefault()
    if (etapa === 'pedido') pedirCodigo()
    else confirmar()
  }

  const naConfirmacao = etapa === 'confirmacao'
  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={enviar}>
        <div className="field">
          <label htmlFor="cadastro-cpf"><Icon name="id" size={15} /> CPF</label>
          <div className="input-wrap">
            <input id="cadastro-cpf" inputMode="numeric" placeholder="000.000.000-00" value={dados.cpf} onChange={alterar('cpf')} readOnly={naConfirmacao} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cadastro-telefone"><Icon name="phone" size={15} /> Celular com DDD</label>
          <div className="input-wrap">
            <input id="cadastro-telefone" type="tel" placeholder="(47) 99999-0000" value={dados.telefone} onChange={alterar('telefone')} readOnly={naConfirmacao} required />
          </div>
        </div>

        {naConfirmacao && (
          <>
            <p className="form-info">{aviso} <button type="button" className="text-button" onClick={() => setEtapa('pedido')}>Alterar dados</button></p>
            <div className="field">
              <label htmlFor="cadastro-codigo"><Icon name="check" size={15} /> Código recebido por SMS</label>
              <div className="input-wrap">
                <input id="cadastro-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={dados.codigo} onChange={(e) => setDados({ ...dados, codigo: somenteDigitos(e.target.value) })} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cadastro-nome"><Icon name="user" size={15} /> Nome completo</label>
              <div className="input-wrap"><input id="cadastro-nome" autoComplete="name" value={dados.nome} onChange={alterar('nome')} required /></div>
            </div>
            <div className="field">
              <label htmlFor="cadastro-email"><Icon name="mail" size={15} /> E-mail (opcional)</label>
              <div className="input-wrap"><input id="cadastro-email" type="email" autoComplete="email" placeholder="seu@email.com" value={dados.email} onChange={alterar('email')} /></div>
            </div>
            <div className="field">
              <label htmlFor="cadastro-nascimento"><Icon name="calendar" size={15} /> Nascimento (opcional)</label>
              <div className="input-wrap"><input id="cadastro-nascimento" type="date" value={dados.nascimento} onChange={alterar('nascimento')} /></div>
            </div>
            <div className="field">
              <label htmlFor="cadastro-senha"><Icon name="lock" size={15} /> Senha</label>
              <div className="input-wrap">
                <input id="cadastro-senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="Mínimo de 8 caracteres" value={dados.senha} onChange={alterar('senha')} required />
                <button type="button" className="input-action" onClick={() => setMostrarSenha(!mostrarSenha)} aria-label="Mostrar senha"><Icon name="eye" /></button>
              </div>
            </div>
          </>
        )}

        {erro && <p className="form-error" role="alert">{erro}</p>}
        <button className="primary-btn primary-btn--full" disabled={enviando}>
          {naConfirmacao ? 'Cadastrar' : 'Enviar código por SMS'}
        </button>
        {naConfirmacao && <button type="button" className="text-button" onClick={pedirCodigo} disabled={enviando}>Reenviar código</button>}
        <p className="auth-switch">Tem cadastro? <Link to="/login">Login</Link></p>
      </form>
    </AuthLayout>
  )
}
