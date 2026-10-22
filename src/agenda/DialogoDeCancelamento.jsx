import { useEffect, useRef, useState } from 'react'
import { mensagemDoErro } from '../api/mensagens.js'

// A justificativa é opcional para a clínica; se a API devolver JUSTIFICATIVA_OBRIGATORIA (paciente com menos de
// 24 h, docs/api.md), o campo passa a ser exigido e o popup continua aberto.
export default function DialogoDeCancelamento({ aoCancelar, aoFechar }) {
  const [justificativa, setJustificativa] = useState('')
  const [obrigatoria, setObrigatoria] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    const anterior = document.activeElement
    campo.current?.focus()
    const fecharComEsc = (evento) => evento.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', fecharComEsc)
    return () => {
      document.removeEventListener('keydown', fecharComEsc)
      anterior?.focus?.()
    }
  }, [aoFechar])

  async function confirmar(evento) {
    evento.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await aoCancelar(justificativa.trim() || undefined)
    } catch (falha) {
      if (falha.codigo === 'JUSTIFICATIVA_OBRIGATORIA') setObrigatoria(true)
      setErro(mensagemDoErro(falha))
      setEnviando(false)
    }
  }

  return (
    <div className="dialogo-fundo" onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}>
      <form className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-cancelamento" onSubmit={confirmar}>
        <h2 id="titulo-cancelamento">Cancelar consulta</h2>
        <p className="form-info">O paciente é avisado por SMS. Esta ação não pode ser desfeita; para trocar o horário, use “Remarcar”.</p>
        <div className="field">
          <label htmlFor="justificativa">Justificativa {obrigatoria ? '' : <span className="optional">(opcional)</span>}</label>
          <textarea id="justificativa" ref={campo} required={obrigatoria} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
        </div>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <div className="dialogo__acoes">
          <button type="button" className="soft-btn" onClick={aoFechar}>Voltar</button>
          <button className="primary-btn primary-btn--perigo" disabled={enviando}>{enviando ? 'Cancelando…' : 'Cancelar consulta'}</button>
        </div>
      </form>
    </div>
  )
}
