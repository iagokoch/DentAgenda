import { useState } from 'react'
import { mensagemDoErro } from '../api/mensagens.js'
import Gaveta from '../components/Gaveta.jsx'
import { centavosDoTexto, mudancas, textoDosCentavos } from './formatos.js'

const dadosDoFormulario = (procedimento) => ({
  nome: procedimento?.nome ?? '',
  duracaoMinutos: procedimento ? String(procedimento.duracaoMinutos) : '',
  preco: procedimento ? textoDosCentavos(procedimento.precoCentavos) : '',
})

// Duração inteira > 0 e preço em centavos ≥ 0 (docs/api.md); o preço é digitado em reais (D37).
function corpoDoFormulario(dados) {
  const duracaoMinutos = Number(dados.duracaoMinutos)
  if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return { erro: 'Duração em minutos, maior que zero.' }
  const precoCentavos = centavosDoTexto(dados.preco)
  if (precoCentavos === null) return { erro: 'Preço em reais, como 180,00.' }
  return { corpo: { nome: dados.nome.trim(), duracaoMinutos, precoCentavos } }
}

// Cadastro e edição de procedimento (D37). Mudar a duração não altera consultas já marcadas (D13).
export default function GavetaDeProcedimento({ procedimento, aoSalvar, aoFechar }) {
  const editando = Boolean(procedimento)
  const [dados, setDados] = useState(() => dadosDoFormulario(procedimento))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const alterar = (campo) => (evento) => setDados({ ...dados, [campo]: evento.target.value })

  async function salvar(evento) {
    evento.preventDefault()
    setErro('')
    const { corpo, erro: erroDoFormulario } = corpoDoFormulario(dados)
    if (erroDoFormulario) return setErro(erroDoFormulario)
    const envio = editando ? mudancas(corpoDoFormulario(dadosDoFormulario(procedimento)).corpo, corpo) : corpo
    if (editando && Object.keys(envio).length === 0) return aoFechar()
    setEnviando(true)
    try {
      await aoSalvar(envio)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
      setEnviando(false)
    }
  }

  return (
    <Gaveta titulo={editando ? 'Editar procedimento' : 'Novo procedimento'} subtitulo={editando ? 'Consultas já marcadas mantêm a duração de quando foram marcadas.' : null} aoFechar={aoFechar}>
      <form className="drawer__form" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="procedimento-nome">Nome</label>
          <div className="input-wrap"><input id="procedimento-nome" value={dados.nome} onChange={alterar('nome')} required autoComplete="off" /></div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="procedimento-duracao">Duração (minutos)</label>
            <div className="input-wrap"><input id="procedimento-duracao" type="number" min="1" step="1" value={dados.duracaoMinutos} onChange={alterar('duracaoMinutos')} required /></div>
          </div>
          <div className="field">
            <label htmlFor="procedimento-preco">Preço (R$)</label>
            <div className="input-wrap"><input id="procedimento-preco" inputMode="decimal" value={dados.preco} onChange={alterar('preco')} placeholder="180,00" required /></div>
          </div>
        </div>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <div className="drawer__footer">
          <button type="button" className="soft-btn" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="primary-btn primary-btn--solid" disabled={enviando}>{enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar'}</button>
        </div>
      </form>
    </Gaveta>
  )
}
