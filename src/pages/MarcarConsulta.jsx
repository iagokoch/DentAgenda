import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, mensagemDoHorario } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import CalendarioDeDias from '../agenda/CalendarioDeDias.jsx'
import Horarios from '../agenda/Horarios.jsx'
import { dataEHoraLegiveis, horaDoInstante, precoEmReais } from '../agenda/calendario.js'
import { useEscolhaDeHorario } from '../agenda/useEscolhaDeHorario.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { dataBR } from '../pacientes/formatar.js'

// Marcação pelo paciente (D35): a API devolve a ele só procedimentos ativos e horários no passo (D12), e o paciente
// da consulta vem do token. "Marcar outra" recomeça a tela trocando a key.
export default function MarcarConsulta() {
  const [rodada, setRodada] = useState(0)
  return <Marcacao key={rodada} aoMarcarOutra={() => setRodada(rodada + 1)} />
}

function Marcacao({ aoMarcarOutra }) {
  const [procedimentoId, setProcedimentoId] = useState('')
  const [dentistaId, setDentistaId] = useState('')
  const [envio, setEnvio] = useState({ estado: 'parado' })
  const procedimentos = useDadosDaApi('/api/procedimentos')
  const dentistas = useDadosDaApi('/api/dentistas')
  const escolha = useEscolhaDeHorario({ procedimentoId, dentistaId })
  const { horario } = escolha

  const procedimento = procedimentos.dados?.find((item) => item.id === procedimentoId)
  const dentistaDoHorario = dentistas.dados?.find((item) => item.id === horario?.dentistaId)
  const podeConfirmar = Boolean(procedimento && horario) && envio.estado !== 'enviando'

  // Toda mudança antes do horário invalida o que já foi escolhido e a mensagem de erro anterior.
  const aoMudar = (acao) => (...argumentos) => {
    acao(...argumentos)
    setEnvio({ estado: 'parado' })
  }
  const mudarProcedimento = aoMudar((id) => { setProcedimentoId(id); escolha.limpar() })
  const mudarDentista = aoMudar((id) => { setDentistaId(id); escolha.limpar() })

  async function confirmar() {
    setEnvio({ estado: 'enviando' })
    try {
      const consulta = await api.pedir('/api/consultas', { metodo: 'POST', corpo: { dentistaId: horario.dentistaId, procedimentoId, inicio: horario.inicio } })
      setEnvio({ estado: 'sucesso', consulta })
    } catch (falha) {
      const mensagemDeHorario = mensagemDoHorario(falha)
      if (mensagemDeHorario) escolha.recarregarVagas()
      setEnvio({ estado: 'erro', mensagem: mensagemDeHorario ?? mensagemDoErro(falha) })
    }
  }

  if (envio.estado === 'sucesso') return <ConsultaMarcada consulta={envio.consulta} aoMarcarOutra={aoMarcarOutra} />

  const avisoDoHorario = envio.estado === 'erro' && horario === null ? envio.mensagem : ''

  return (
    <AppShell title="Marcar consulta" wide>
      <h1 className="sr-only">Marcar consulta</h1>
      <div className="schedule-grid">
        <div className="schedule-main">
          <section className="schedule-card">
            <h2><Icon name="clipboard" /> O que você precisa?</h2>
            {(procedimentos.estado === 'erro' || dentistas.estado === 'erro') && (
              <div className="agenda-estado">
                <p className="form-error" role="alert">{procedimentos.erro || dentistas.erro}</p>
                <button type="button" className="soft-btn" onClick={() => { procedimentos.recarregar(); dentistas.recarregar() }}>Tentar de novo</button>
              </div>
            )}
            {procedimentos.estado === 'pronto' && procedimentos.dados.length === 0 && <p className="form-info agenda-estado">Nenhum procedimento disponível para marcar. Fale com a clínica.</p>}
            <div className="procedure-grid">
              <div className="field">
                <label htmlFor="procedimento">Procedimento</label>
                <select id="procedimento" value={procedimentoId} disabled={procedimentos.estado !== 'pronto'} onChange={(e) => mudarProcedimento(e.target.value)}>
                  <option value="">{procedimentos.estado === 'carregando' ? 'Carregando…' : 'Escolha o procedimento'}</option>
                  {(procedimentos.dados ?? []).map((item) => <option key={item.id} value={item.id}>{item.nome} ({item.duracaoMinutos} min)</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="valor">Valor Estimado (R$)</label>
                <output id="valor" className="money-input"><span>R$</span>{procedimento ? precoEmReais(procedimento.precoCentavos) : '—'}</output>
              </div>
            </div>
            <div className="field">
              <label htmlFor="dentista">Dentista</label>
              <select id="dentista" value={dentistaId} disabled={dentistas.estado !== 'pronto'} onChange={(e) => mudarDentista(e.target.value)}>
                <option value="">{dentistas.estado === 'carregando' ? 'Carregando…' : 'Qualquer dentista'}</option>
                {(dentistas.dados ?? []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </div>
          </section>
        </div>
        <aside className="schedule-side">
          <CalendarioDeDias mes={escolha.mes} mesMinimo={escolha.mesMinimo} dias={escolha.dias} diaEscolhido={escolha.dia} aoMudarMes={aoMudar(escolha.mudarMes)} aoEscolher={aoMudar(escolha.escolherDia)} />
          <Horarios horarios={escolha.horarios} horarioEscolhido={horario} aviso={avisoDoHorario} aoEscolher={aoMudar(escolha.escolherHorario)} />
        </aside>
      </div>
      <footer className="selection-bar">
        <div aria-live="polite">
          <small>Resumo da Seleção</small>
          <strong>{horario ? `${dataBR(horario.inicio)} às ${horaDoInstante(horario.inicio)} • ${procedimento.nome}${dentistaDoHorario ? ` • ${dentistaDoHorario.nome}` : ''}` : 'Escolha procedimento, dia e horário.'}</strong>
          {envio.estado === 'erro' && horario !== null && <p className="form-error agenda-estado" role="alert">{envio.mensagem}</p>}
        </div>
        <Link className="text-button" to="/minha-conta">Voltar</Link>
        <div className="selection-bar__confirmar">
          <button type="button" className="primary-btn" disabled={!podeConfirmar} onClick={confirmar}>
            {envio.estado === 'enviando' ? 'Marcando…' : 'Confirmar'}
          </button>
        </div>
      </footer>
    </AppShell>
  )
}

function ConsultaMarcada({ consulta, aoMarcarOutra }) {
  return (
    <AppShell title="Marcar consulta" wide>
      <section className="schedule-card consulta-marcada" role="status">
        <h2><Icon name="calendar" /> Consulta marcada</h2>
        <p><strong>{consulta.procedimento.nome}</strong> com {consulta.dentista.nome}</p>
        <p>{dataEHoraLegiveis(consulta.inicio)}</p>
        <div className="consulta-marcada__acoes">
          <Link className="primary-btn primary-btn--solid" to="/minha-conta">Ver minhas consultas</Link>
          <button type="button" className="soft-btn" onClick={aoMarcarOutra}>Marcar outra consulta</button>
        </div>
      </section>
    </AppShell>
  )
}
