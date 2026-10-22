import { useState } from 'react'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import { dataDeHoje } from '../agenda/calendario.js'
import Gaveta from '../components/Gaveta.jsx'
import { formatarCpf } from '../pacientes/formatar.js'
import { mudancas } from './formatos.js'

const dadosDoFormulario = (funcionario) => ({
  nome: funcionario?.nome ?? '',
  cpf: funcionario ? formatarCpf(funcionario.cpf) : '',
  email: funcionario?.email ?? '',
  categoria: funcionario?.categoria ?? 'RECEPCIONISTA',
  cro: funcionario?.cro ?? '',
  dataInicio: funcionario?.dataInicio ?? dataDeHoje(new Date()),
  isAdmin: funcionario?.isAdmin ?? false,
})

// O que vai para a API (docs/api.md): CPF só com dígitos; CRO só para dentista (CRO_OBRIGATORIO é da API, D21).
function corpoDoFormulario(dados) {
  const corpo = { nome: dados.nome.trim(), cpf: somenteDigitos(dados.cpf), email: dados.email.trim(), categoria: dados.categoria, dataInicio: dados.dataInicio, isAdmin: dados.isAdmin }
  if (dados.categoria === 'DENTISTA' && dados.cro.trim()) corpo.cro = dados.cro.trim()
  return corpo
}

// Cadastro e edição de funcionário (D37). Sem senha: a pessoa define a dela em "Esqueci minha senha" (D21.1).
// `aoSalvar(corpo)` recebe o corpo do POST, ou só o que mudou no caso da edição.
export default function GavetaDeFuncionario({ funcionario, aoSalvar, aoFechar }) {
  const editando = Boolean(funcionario)
  const [dados, setDados] = useState(() => dadosDoFormulario(funcionario))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const alterar = (campo) => (evento) => setDados({ ...dados, [campo]: evento.target.type === 'checkbox' ? evento.target.checked : evento.target.value })

  async function salvar(evento) {
    evento.preventDefault()
    setErro('')
    const corpo = corpoDoFormulario(dados)
    const envio = editando ? mudancas(corpoDoFormulario(dadosDoFormulario(funcionario)), corpo) : corpo
    if (editando && Object.keys(envio).length === 0) return aoFechar()
    setEnviando(true)
    try {
      await aoSalvar(envio)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setEnviando(false)
    }
  }

  const campo = (nome, rotulo, input = {}) => (
    <div className="field">
      <label htmlFor={`funcionario-${nome}`}>{rotulo}</label>
      <div className="input-wrap"><input id={`funcionario-${nome}`} value={dados[nome]} onChange={alterar(nome)} {...input} /></div>
    </div>
  )

  return (
    <Gaveta titulo={editando ? 'Editar funcionário' : 'Novo funcionário'} subtitulo={editando ? funcionario.nome : 'A pessoa define a senha depois, em “Esqueci minha senha”.'} aoFechar={aoFechar}>
      <form className="drawer__form" onSubmit={salvar}>
        {campo('nome', 'Nome completo', { required: true, autoComplete: 'off' })}
        <div className="form-grid">
          {campo('cpf', 'CPF', { required: true, inputMode: 'numeric', autoComplete: 'off' })}
          {campo('dataInicio', 'Início na clínica', { type: 'date', required: true })}
        </div>
        {campo('email', 'E-mail', { type: 'email', required: true, autoComplete: 'off' })}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="funcionario-categoria">Categoria</label>
            <select id="funcionario-categoria" value={dados.categoria} onChange={alterar('categoria')}>
              <option value="RECEPCIONISTA">Recepção</option>
              <option value="DENTISTA">Dentista</option>
            </select>
          </div>
          {dados.categoria === 'DENTISTA' && campo('cro', 'CRO', { required: true, placeholder: 'SP-12345' })}
        </div>
        <label className="campo-marcavel">
          <input type="checkbox" checked={dados.isAdmin} onChange={alterar('isAdmin')} />
          <span><strong>Administrador</strong><small>Cadastra funcionários e procedimentos e define a grade dos dentistas.</small></span>
        </label>

        {erro && <p className="form-error" role="alert">{erro}</p>}
        <div className="drawer__footer">
          <button type="button" className="soft-btn" onClick={aoFechar}>Cancelar</button>
          <button className="primary-btn primary-btn--solid" disabled={enviando}>{enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar'}</button>
        </div>
      </form>
    </Gaveta>
  )
}
