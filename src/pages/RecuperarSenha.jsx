import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import AuthLayout from '../components/AuthLayout'
import Brand from '../components/Brand'
import Icon from '../components/Icon'

const DIGITOS_DO_CODIGO = 6

// D3: paciente recupera pelo CPF (SMS), funcionário pelo e-mail.
function contaDe(identificador) {
  return identificador.includes('@')
    ? { tipo: 'funcionario', corpo: { email: identificador.trim() } }
    : { tipo: 'cliente', corpo: { cpf: somenteDigitos(identificador) } }
}

// D20.7: não há rota que só confere o código; código e senha nova vão juntos no final.
export default function RecuperarSenha() {
  const [identificador, setIdentificador] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [digitos, setDigitos] = useState(Array(DIGITOS_DO_CODIGO).fill(''))
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const caixas = useRef([])

  const senhasDiferentes = confirmacao !== '' && senha !== confirmacao
  const pronto = enviado && digitos.every(Boolean) && senha.length >= 8 && senha === confirmacao

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
      const { tipo, corpo } = contaDe(identificador)
      const resposta = await api.pedir(`/api/auth/${tipo}/recuperacao/codigo`, { metodo: 'POST', corpo })
      setAviso(resposta.mensagem)
      setEnviado(true)
    })

  const redefinir = () =>
    executar(async () => {
      const { tipo, corpo } = contaDe(identificador)
      await api.pedir(`/api/auth/${tipo}/recuperacao/confirmar`, {
        metodo: 'POST',
        corpo: { ...corpo, codigo: digitos.join(''), novaSenha: senha },
      })
      setSucesso(true)
    })

  function alterarDigito(valor, indice) {
    const proximos = [...digitos]
    proximos[indice] = somenteDigitos(valor).slice(-1)
    setDigitos(proximos)
    if (proximos[indice] && indice < DIGITOS_DO_CODIGO - 1) caixas.current[indice + 1]?.focus()
  }

  function colarCodigo(evento) {
    const colado = somenteDigitos(evento.clipboardData.getData('text')).slice(0, DIGITOS_DO_CODIGO)
    if (colado.length !== DIGITOS_DO_CODIGO) return
    evento.preventDefault()
    setDigitos(colado.split(''))
    caixas.current[DIGITOS_DO_CODIGO - 1]?.focus()
  }

  return (
    <AuthLayout mode="center">
      <div className="recovery">
        <Brand />
        <h1>Recuperar Senha</h1>
        <p>Siga as etapas para acessar sua conta</p>
        <div className="recovery-card">
          {sucesso ? (
            <div className="success-state">
              <span><Icon name="check" size={32} /></span>
              <h2>Senha redefinida!</h2>
              <p>Agora você já pode entrar usando a nova senha.</p>
              <Link className="primary-btn primary-btn--full" to="/login">Ir para o Login</Link>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="recuperacao-identificador">CPF ou e-mail cadastrado</label>
                <div className="input-wrap input-wrap--icon">
                  <Icon name="mail" />
                  <input id="recuperacao-identificador" placeholder="CPF (paciente) ou e-mail (clínica)" value={identificador} onChange={(e) => setIdentificador(e.target.value)} readOnly={enviado} />
                </div>
              </div>
              <button className="primary-btn primary-btn--full" onClick={pedirCodigo} disabled={enviando || !identificador.trim()}>
                {enviado ? 'Reenviar código' : 'Enviar código'} <Icon name="arrowRight" />
              </button>
              {aviso && <p className="form-info">{aviso}</p>}
              <div className="divider"><span>Nova senha</span></div>
              <div className="code-row">
                {digitos.map((digito, indice) => (
                  <input
                    key={indice}
                    ref={(elemento) => { caixas.current[indice] = elemento }}
                    value={digito}
                    onChange={(e) => alterarDigito(e.target.value, indice)}
                    onPaste={colarCodigo}
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`Dígito ${indice + 1}`}
                    disabled={!enviado}
                  />
                ))}
              </div>
              <div className="field">
                <label htmlFor="recuperacao-senha">Nova senha</label>
                <div className="input-wrap input-wrap--icon"><Icon name="lock" /><input id="recuperacao-senha" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} disabled={!enviado} /></div>
              </div>
              <div className="field">
                <label htmlFor="recuperacao-confirmacao">Confirmar nova senha</label>
                <div className="input-wrap input-wrap--icon"><Icon name="lock" /><input id="recuperacao-confirmacao" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} disabled={!enviado} /></div>
              </div>
              {senhasDiferentes && <p className="form-error">As senhas não são iguais.</p>}
              {erro && <p className="form-error" role="alert">{erro}</p>}
              <button className="primary-btn primary-btn--full" disabled={!pronto || enviando} onClick={redefinir}>Redefinir Senha</button>
            </>
          )}
        </div>
        <Link className="back-link" to="/login"><Icon name="arrowLeft" /> Voltar para o Login</Link>
        <footer className="auth-footer">© 2026 DentAgenda — Sistema de Gestão Odontológica</footer>
      </div>
    </AuthLayout>
  )
}
