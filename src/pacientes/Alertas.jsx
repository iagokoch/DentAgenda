import { useEffect, useState } from 'react'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import Icon from '../components/Icon'
import { dataBR } from './formatar.js'

// D18: o autor vem do token. Alerta da clínica leva o nome de quem escreveu; o do paciente, a marca "informado pelo paciente".
const origemDoAlerta = (alerta) =>
  alerta.autor === 'CLINICA'
    ? `Clínica${alerta.funcionario ? ` · ${alerta.funcionario.nome}` : ''} · ${dataBR(alerta.criadoEm)}`
    : `Informado pelo paciente · ${dataBR(alerta.criadoEm)}`

// "Observações Importantes" do perfil: lista, adiciona e remove (a remoção só marca; o histórico fica no banco).
export default function Alertas({ pacienteId }) {
  const [resposta, setResposta] = useState({ pacienteId: null })
  const [erro, setErro] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let atual = true
    api.pedir(`/api/pacientes/${pacienteId}/alertas`).then(
      (alertas) => atual && setResposta({ pacienteId, alertas }),
      (falha) => atual && setResposta({ pacienteId, erro: mensagemDoErro(falha) }),
    )
    return () => {
      atual = false
    }
  }, [pacienteId])

  const estado = resposta.pacienteId !== pacienteId ? 'carregando' : resposta.erro ? 'erro' : 'pronto'
  const alertas = resposta.alertas ?? []
  const setAlertas = (mudar) => setResposta((atual) => ({ ...atual, alertas: mudar(atual.alertas ?? []) }))

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

  const adicionar = (evento) => {
    evento.preventDefault()
    if (!texto.trim()) return
    return executar(async () => {
      const criado = await api.pedir(`/api/pacientes/${pacienteId}/alertas`, { metodo: 'POST', corpo: { texto: texto.trim() } })
      setAlertas((lista) => [...lista, criado])
      setTexto('')
    })
  }

  const remover = (alerta) =>
    executar(async () => {
      await api.pedir(`/api/pacientes/${pacienteId}/alertas/${alerta.id}`, { metodo: 'DELETE' })
      setAlertas((lista) => lista.filter((outro) => outro.id !== alerta.id))
    })

  return (
    <section className="info-card observations">
      <h2>Observações Importantes</h2>
      <p className="form-info">Alertas que o dentista vê antes de atender.</p>
      {estado === 'carregando' && <p className="form-info">Carregando…</p>}
      {estado === 'erro' && <p className="form-error" role="alert">{resposta.erro}</p>}
      {estado === 'pronto' && alertas.length === 0 && <p className="form-info">Nenhum alerta registrado.</p>}
      <ul className="alertas">
        {alertas.map((alerta) => (
          <li key={alerta.id} className={`alerta ${alerta.autor === 'CLINICA' ? 'alerta--clinica' : ''}`}>
            <Icon name="alert" size={18} />
            <div>
              <strong>{alerta.texto}</strong>
              <small>{origemDoAlerta(alerta)}</small>
            </div>
            <button type="button" className="alerta__remover" aria-label={`Remover alerta ${alerta.texto}`} disabled={enviando} onClick={() => remover(alerta)}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="form-error" role="alert">{erro}</p>}
      <form className="alertas__novo" onSubmit={adicionar}>
        <label htmlFor="novo-alerta" className="caps-label">Novo alerta</label>
        <div className="input-wrap"><input id="novo-alerta" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Alergia a látex" maxLength={500} /></div>
        <button className="primary-btn primary-btn--solid" disabled={enviando || !texto.trim() || estado === 'erro'}>Adicionar alerta</button>
      </form>
    </section>
  )
}
