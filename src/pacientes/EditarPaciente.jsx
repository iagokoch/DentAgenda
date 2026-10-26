import { useEffect, useRef, useState } from 'react'
import { api } from '../api/api.js'
import { mensagemDoErro, somenteDigitos } from '../api/mensagens.js'
import Icon from '../components/Icon'
import { useFocoPreso } from '../components/useFocoPreso.js'
import CampoDeEndereco from './CampoDeEndereco.jsx'
import { ENDERECO_VAZIO, enderecoParaEnviar, enderecoParaFormulario } from './endereco.js'
import { formatarCpf } from './formatar.js'

const dadosDoPaciente = (paciente) => ({
  nome: paciente.nome,
  telefone: paciente.telefone,
  email: paciente.email ?? '',
  nascimento: paciente.nascimento ?? '',
  convenio: paciente.convenio ?? '',
  pacienteDesde: paciente.pacienteDesde,
})

// Só vai para a API o que mudou (docs/api.md). Vazio em e-mail, nascimento e convênio limpa o campo (null).
function mudancasDe(paciente, dados) {
  const antes = dadosDoPaciente(paciente)
  const mudancas = {}
  if (dados.nome.trim() !== antes.nome) mudancas.nome = dados.nome.trim()
  if (somenteDigitos(dados.telefone) !== antes.telefone) mudancas.telefone = somenteDigitos(dados.telefone)
  if (dados.email.trim() !== antes.email) mudancas.email = dados.email.trim() || null
  if (dados.nascimento !== antes.nascimento) mudancas.nascimento = dados.nascimento || null
  if (dados.convenio.trim() !== antes.convenio) mudancas.convenio = dados.convenio.trim() || null
  if (dados.pacienteDesde && dados.pacienteDesde !== antes.pacienteDesde) mudancas.pacienteDesde = dados.pacienteDesde
  return mudancas
}

// Painel lateral "Editar dados" (recepção). O CPF aparece, mas não muda (D21, D25.7).
export default function EditarPaciente({ paciente, aoFechar, aoAtualizar }) {
  const [dados, setDados] = useState(() => dadosDoPaciente(paciente))
  const [endereco, setEndereco] = useState(() => enderecoParaFormulario(paciente.endereco))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const primeiroCampo = useRef(null)
  const painel = useRef(null)
  useFocoPreso(painel)

  useEffect(() => {
    const anterior = document.activeElement
    primeiroCampo.current?.focus()
    const fecharComEsc = (evento) => evento.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', fecharComEsc)
    return () => {
      document.removeEventListener('keydown', fecharComEsc)
      anterior?.focus?.()
    }
  }, [aoFechar])

  const alterar = (campo) => (evento) => setDados({ ...dados, [campo]: evento.target.value })

  async function salvar(evento) {
    evento.preventDefault()
    setErro('')
    const { corpo: enderecoCorpo, erro: erroDoEndereco } = enderecoParaEnviar(endereco)
    if (erroDoEndereco) return setErro(erroDoEndereco)

    const mudancas = mudancasDe(paciente, dados)
    const enderecoMudou = JSON.stringify(endereco) !== JSON.stringify(enderecoParaFormulario(paciente.endereco))
    if (Object.keys(mudancas).length === 0 && !enderecoMudou) return aoFechar()

    setEnviando(true)
    try {
      const base = `/api/pacientes/${paciente.id}`
      if (Object.keys(mudancas).length > 0) await api.pedir(base, { metodo: 'PATCH', corpo: mudancas })
      if (enderecoMudou && enderecoCorpo) await api.pedir(`${base}/endereco`, { metodo: 'PUT', corpo: enderecoCorpo })
      if (enderecoMudou && !enderecoCorpo) await api.pedir(`${base}/endereco`, { metodo: 'DELETE' })
      await aoAtualizar()
      aoFechar()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      // Se o PATCH passou e o endereço falhou, o perfil por trás já mostra o que foi salvo.
      await aoAtualizar().catch(() => {})
      setEnviando(false)
    }
  }

  const campo = (nome, rotulo, input = {}, dica) => (
    <div className="field">
      <label htmlFor={`editar-${nome}`}>{rotulo}</label>
      <div className="input-wrap"><input id={`editar-${nome}`} value={dados[nome]} onChange={alterar(nome)} {...input} /></div>
      {dica && <small className="field__hint">{dica}</small>}
    </div>
  )

  return (
    <div className="drawer-backdrop" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="editar-titulo" ref={painel}>
        <header className="drawer__header">
          <div><h2 id="editar-titulo">Editar dados</h2><p>{paciente.nome}</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={aoFechar}><Icon name="close" /></button>
        </header>
        <form className="drawer__form" onSubmit={salvar}>
          <h3>Dados pessoais</h3>
          <div className="field">
            <label htmlFor="editar-nome">Nome completo</label>
            <div className="input-wrap"><input id="editar-nome" ref={primeiroCampo} value={dados.nome} onChange={alterar('nome')} required /></div>
          </div>
          <div className="field">
            <label htmlFor="editar-cpf">CPF</label>
            <div className="input-wrap"><input id="editar-cpf" value={formatarCpf(paciente.cpf)} disabled aria-describedby="editar-cpf-dica" /></div>
            <small className="field__hint" id="editar-cpf-dica">O CPF não pode ser alterado.</small>
          </div>
          {campo('telefone', 'Telefone com DDD', { type: 'tel', required: true })}
          {campo('email', 'E-mail', { type: 'email', autoComplete: 'off' })}
          <div className="form-grid">
            {campo('nascimento', 'Nascimento', { type: 'date' })}
            {campo('pacienteDesde', 'Paciente desde', { type: 'date' })}
          </div>
          {campo('convenio', 'Convênio', {}, 'Em branco = particular.')}

          <h3 className="drawer__section">
            Endereço
            {paciente.endereco && (
              <button type="button" className="text-button text-button--perigo" onClick={() => setEndereco({ ...ENDERECO_VAZIO })}>Remover endereço</button>
            )}
          </h3>
          <CampoDeEndereco valor={endereco} aoMudar={setEndereco} prefixo="editar-end" />

          {erro && <p className="form-error" role="alert">{erro}</p>}
          <div className="drawer__footer">
            <button type="button" className="soft-btn" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="primary-btn primary-btn--solid" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        </form>
      </aside>
    </div>
  )
}
