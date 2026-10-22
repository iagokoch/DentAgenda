import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import AppShell from '../components/AppShell'
import CampoDeEndereco from '../pacientes/CampoDeEndereco.jsx'
import { ENDERECO_VAZIO, enderecoParaEnviar } from '../pacientes/endereco.js'

const DADOS_VAZIOS = { nome: '', cpf: '', telefone: '', email: '', nascimento: '', convenio: '', pacienteDesde: '' }

// D4: cadastro feito pela recepção; cria só o Cliente, sem Login. A API também confere o papel (R).
export default function NovoPaciente() {
  const navigate = useNavigate()
  const [dados, setDados] = useState(DADOS_VAZIOS)
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO)
  const [erro, setErro] = useState('')
  const [cpfRepetido, setCpfRepetido] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const alterar = (campo) => (evento) => setDados({ ...dados, [campo]: evento.target.value })

  // Para o aviso de CPF repetido apontar o perfil que já existe (a API devolve só o 409).
  async function acharPorCpf(cpf) {
    try {
      const { itens } = await api.pedir(`/api/pacientes?busca=${cpf}`)
      return itens[0]?.id ?? null
    } catch {
      return null
    }
  }

  async function enviar(evento) {
    evento.preventDefault()
    setErro('')
    setCpfRepetido(null)
    const { corpo: enderecoCorpo, erro: erroDoEndereco } = enderecoParaEnviar(endereco)
    if (erroDoEndereco) return setErro(erroDoEndereco)

    const cpf = somenteDigitos(dados.cpf)
    const corpo = {
      nome: dados.nome.trim(),
      cpf,
      telefone: somenteDigitos(dados.telefone),
      ...(dados.email.trim() && { email: dados.email.trim() }),
      ...(dados.nascimento && { nascimento: dados.nascimento }),
      ...(dados.convenio.trim() && { convenio: dados.convenio.trim() }),
      ...(dados.pacienteDesde && { pacienteDesde: dados.pacienteDesde }),
      ...(enderecoCorpo && { endereco: enderecoCorpo }),
    }
    setEnviando(true)
    try {
      const criado = await api.pedir('/api/pacientes', { metodo: 'POST', corpo })
      navigate(`/pacientes/${criado.id}`)
    } catch (falha) {
      if (falha.codigo === 'CPF_JA_CADASTRADO') setCpfRepetido({ id: await acharPorCpf(cpf), mensagem: falha.mensagem })
      else setErro(mensagemDoErro(falha))
      setEnviando(false)
    }
  }

  const campo = (nome, rotulo, input = {}, dica) => (
    <div className="field">
      <label htmlFor={`novo-${nome}`}>{rotulo}</label>
      <div className="input-wrap"><input id={`novo-${nome}`} value={dados[nome]} onChange={alterar(nome)} {...input} /></div>
      {dica && <small className="field__hint">{dica}</small>}
    </div>
  )

  return (
    <AppShell title="DentAgenda" wide>
      <nav className="breadcrumb" aria-label="Caminho"><Link to="/pacientes">Pacientes</Link> / Novo paciente</nav>
      <div className="page-heading"><div><h1>Novo paciente</h1><p>Cadastro feito pela recepção, por exemplo quando o paciente liga. Os campos com * são obrigatórios.</p></div></div>

      <div className="form-page">
        <form className="form-page__main" onSubmit={enviar}>
          <section className="panel">
            <h2>Dados do paciente</h2>
            <p className="form-info">O CPF não pode ser alterado depois do cadastro.</p>
            <div className="form-grid">
              <div className="form-grid__full">{campo('nome', 'Nome completo *', { required: true, autoComplete: 'off' })}</div>
              <div className={`field ${cpfRepetido ? 'field--erro' : ''}`}>
                <label htmlFor="novo-cpf">CPF *</label>
                <div className="input-wrap"><input id="novo-cpf" inputMode="numeric" required value={dados.cpf} onChange={alterar('cpf')} placeholder="000.000.000-00" aria-invalid={Boolean(cpfRepetido)} aria-describedby={cpfRepetido ? 'novo-cpf-erro' : undefined} /></div>
                {cpfRepetido && (
                  <small className="field__hint" id="novo-cpf-erro" role="alert">
                    {cpfRepetido.mensagem} {cpfRepetido.id && <Link to={`/pacientes/${cpfRepetido.id}`}>Abrir perfil</Link>}
                  </small>
                )}
              </div>
              {campo('telefone', 'Telefone com DDD *', { required: true, type: 'tel', placeholder: '(11) 98765-4321' }, 'Só números. Usado para o código de acesso por SMS.')}
              {campo('email', 'E-mail', { type: 'email', autoComplete: 'off' })}
              {campo('nascimento', 'Data de nascimento', { type: 'date' })}
              {campo('convenio', 'Convênio', { placeholder: 'Particular' }, 'Em branco = particular.')}
              {campo('pacienteDesde', 'Paciente desde', { type: 'date' }, 'Em branco = hoje.')}
            </div>
          </section>

          <section className="panel">
            <h2>Endereço <span className="optional">(opcional)</span></h2>
            <p className="form-info">Se preencher, todos os campos são obrigatórios, menos o complemento.</p>
            <CampoDeEndereco valor={endereco} aoMudar={setEndereco} prefixo="novo-end" />
          </section>

          {erro && <p className="form-error" role="alert">{erro}</p>}
          <div className="form-actions">
            <Link className="soft-btn" to="/pacientes">Cancelar</Link>
            <button className="primary-btn primary-btn--solid" disabled={enviando}>{enviando ? 'Cadastrando…' : 'Cadastrar paciente'}</button>
          </div>
        </form>

        <aside className="panel panel--soft form-page__side">
          <h2>Depois do cadastro</h2>
          <ul>
            <li>O perfil do paciente abre na mesma hora.</li>
            <li>Ele ainda não tem acesso ao sistema. Para entrar, ele cria a senha pelo cadastro com código por SMS, usando o mesmo CPF.</li>
            <li>Alertas clínicos, como alergias, podem ser adicionados no perfil.</li>
          </ul>
        </aside>
      </div>
    </AppShell>
  )
}
