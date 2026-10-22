import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro, mensagemDoHorario } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import CalendarioDeDias from '../agenda/CalendarioDeDias.jsx'
import Horarios from '../agenda/Horarios.jsx'
import PacienteDaConsulta from '../agenda/PacienteDaConsulta.jsx'
import { dataEHoraLegiveis, horaDoInstante, mesDaData, precoEmReais } from '../agenda/calendario.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { dataBR } from '../pacientes/formatar.js'
import { useSessao } from '../sessao/sessao-contexto.js'

// "Marcar outra" recomeça a tela do zero trocando a key. Com ?remarcar=<id>, a tela remarca aquela consulta
// (POST /api/consultas/{id}/remarcacao): paciente, procedimento e dentista começam os da consulta original.
export default function Agenda() {
  const [rodada, setRodada] = useState(0)
  const [parametros] = useSearchParams()
  const idRemarcado = parametros.get('remarcar')
  const original = useDadosDaApi(idRemarcado ? `/api/consultas/${idRemarcado}` : null)

  if (idRemarcado && original.estado !== 'pronto') {
    return (
      <AppShell title="Remarcar Consulta" wide>
        <section className="tab-placeholder">
          {original.estado === 'erro' ? <><p className="form-error" role="alert">{original.erro}</p><button className="soft-btn" onClick={original.recarregar}>Tentar de novo</button></> : <p className="form-info">Carregando consulta…</p>}
        </section>
      </AppShell>
    )
  }
  return <NovoAgendamento key={rodada} original={original.dados} aoMarcarOutra={() => setRodada(rodada + 1)} />
}

const consultaDaApi = (caminho, parametros) => `${caminho}?${new URLSearchParams(parametros)}`

function NovoAgendamento({ original, aoMarcarOutra }) {
  const { usuario } = useSessao()
  const [parametros] = useSearchParams()
  const ehDentista = usuario.categoria === 'DENTISTA'
  const remarcando = Boolean(original)
  const pacienteDoLink = useDadosDaApi(!remarcando && parametros.get('pacienteId') ? `/api/pacientes/${parametros.get('pacienteId')}` : null)
  // undefined = ainda não mexeu (vale o paciente do link); null = pediu para trocar.
  const [pacienteEscolhido, setPacienteEscolhido] = useState(original?.paciente)
  const [procedimentoId, setProcedimentoId] = useState(original?.procedimento.id ?? '')
  const [dentistaId, setDentistaId] = useState(ehDentista ? usuario.id : (original?.dentista.id ?? ''))
  const [mes, setMes] = useState(mesDaData(new Date()))
  const [dia, setDia] = useState(null)
  const [horario, setHorario] = useState(null)
  const [observacao, setObservacao] = useState('')
  const [envio, setEnvio] = useState({ estado: 'parado' })

  const procedimentos = useDadosDaApi('/api/procedimentos')
  const dentistas = useDadosDaApi('/api/dentistas')
  const filtroDeDentista = dentistaId ? { dentistaId } : {}
  const dias = useDadosDaApi(procedimentoId ? consultaDaApi('/api/dias-disponiveis', { procedimentoId, mes, ...filtroDeDentista }) : null)
  const horarios = useDadosDaApi(procedimentoId && dia ? consultaDaApi('/api/horarios-livres', { procedimentoId, data: dia, ...filtroDeDentista }) : null)

  const paciente = pacienteEscolhido !== undefined ? pacienteEscolhido : pacienteDoLink.dados ? { id: pacienteDoLink.dados.id, nome: pacienteDoLink.dados.nome } : null
  const procedimento = procedimentos.dados?.find((item) => item.id === procedimentoId)
  const dentistaDoHorario = dentistas.dados?.find((item) => item.id === horario?.dentistaId)
  const podeConfirmar = Boolean(paciente && procedimento && horario) && envio.estado !== 'enviando'

  function mudarProcedimento(id) {
    setProcedimentoId(id)
    limparDiaEHorario()
  }

  function mudarDentista(id) {
    setDentistaId(id)
    limparDiaEHorario()
  }

  function mudarMes(novoMes) {
    setMes(novoMes)
    limparDiaEHorario()
  }

  function limparDiaEHorario() {
    setDia(null)
    setHorario(null)
    setEnvio({ estado: 'parado' })
  }

  function escolherDia(data) {
    setDia(data)
    setHorario(null)
    setEnvio({ estado: 'parado' })
  }

  async function marcar() {
    const corpo = { pacienteId: paciente.id, dentistaId: horario.dentistaId, procedimentoId, inicio: horario.inicio }
    if (observacao.trim()) corpo.observacao = observacao.trim()
    return api.pedir('/api/consultas', { metodo: 'POST', corpo })
  }

  // A resposta traz a original cancelada e a nova; a tela mostra a nova.
  async function remarcar() {
    const corpo = { inicio: horario.inicio, dentistaId: horario.dentistaId, procedimentoId }
    if (observacao.trim()) corpo.justificativa = observacao.trim()
    const { nova } = await api.pedir(`/api/consultas/${original.id}/remarcacao`, { metodo: 'POST', corpo })
    return nova
  }

  async function confirmar() {
    setEnvio({ estado: 'enviando' })
    try {
      const consulta = remarcando ? await remarcar() : await marcar()
      setEnvio({ estado: 'sucesso', consulta })
    } catch (falha) {
      const mensagemDeHorario = mensagemDoHorario(falha)
      if (mensagemDeHorario) {
        // O horário escolhido não vale mais: recarrega as vagas para a pessoa escolher outro.
        setHorario(null)
        dias.recarregar()
        horarios.recarregar()
      }
      setEnvio({ estado: 'erro', mensagem: mensagemDeHorario ?? mensagemDoErro(falha) })
    }
  }

  if (envio.estado === 'sucesso') return <ConsultaMarcada consulta={envio.consulta} remarcada={remarcando} aoMarcarOutra={aoMarcarOutra} />

  const avisoDoPaciente = pacienteDoLink.estado === 'erro' ? 'Não foi possível abrir o paciente do link. Busque por nome ou CPF.' : pacienteDoLink.estado === 'carregando' ? 'Carregando paciente…' : ''
  const avisoDoHorario = envio.estado === 'erro' && horario === null ? envio.mensagem : ''

  return (
    <AppShell title={remarcando ? 'Remarcar Consulta' : 'Novo Agendamento'} wide>
      {remarcando && <p className="form-info agenda-aviso">Remarcando a consulta de {dataEHoraLegiveis(original.inicio)}. Ela só é cancelada quando o novo horário for confirmado.</p>}
      <div className="schedule-grid">
        <div className="schedule-main">
          <PacienteDaConsulta
            paciente={paciente}
            aviso={avisoDoPaciente}
            podeCadastrar={usuario.categoria === 'RECEPCIONISTA'}
            aoEscolher={setPacienteEscolhido}
            aoTrocar={remarcando ? undefined : () => setPacienteEscolhido(null)}
          />
          <DetalhesDoProcedimento
            procedimentos={procedimentos}
            dentistas={dentistas}
            procedimentoId={procedimentoId}
            procedimento={procedimento}
            dentistaId={dentistaId}
            dentistaTravado={ehDentista}
            remarcando={remarcando}
            observacao={observacao}
            aoMudarProcedimento={mudarProcedimento}
            aoMudarDentista={mudarDentista}
            aoMudarObservacao={setObservacao}
          />
        </div>
        <aside className="schedule-side">
          <CalendarioDeDias mes={mes} mesMinimo={mesDaData(new Date())} dias={dias} diaEscolhido={dia} aoMudarMes={mudarMes} aoEscolher={escolherDia} />
          <Horarios horarios={horarios} horarioEscolhido={horario} aviso={avisoDoHorario} aoEscolher={(escolhido) => { setHorario(escolhido); setEnvio({ estado: 'parado' }) }} />
        </aside>
      </div>
      <footer className="selection-bar">
        <div aria-live="polite">
          <small>Resumo da Seleção</small>
          <strong>{horario ? `${dataBR(horario.inicio)} às ${horaDoInstante(horario.inicio)} • ${procedimento.nome}${dentistaDoHorario ? ` • ${dentistaDoHorario.nome}` : ''}` : 'Escolha paciente, procedimento, dia e horário.'}</strong>
          {envio.estado === 'erro' && horario !== null && <p className="form-error agenda-estado" role="alert">{envio.mensagem}</p>}
        </div>
        <Link className="text-button" to={remarcando ? `/consultas/${original.id}` : '/inicio'}>Cancelar</Link>
        <div className="selection-bar__confirmar">
          <button type="button" className="primary-btn" disabled={!podeConfirmar} onClick={confirmar}>
            {envio.estado === 'enviando' ? 'Agendando…' : remarcando ? 'Confirmar Remarcação' : 'Confirmar Agendamento'}
          </button>
        </div>
      </footer>
    </AppShell>
  )
}

function DetalhesDoProcedimento({ procedimentos, dentistas, procedimentoId, procedimento, dentistaId, dentistaTravado, remarcando, observacao, aoMudarProcedimento, aoMudarDentista, aoMudarObservacao }) {
  const ativos = (procedimentos.dados ?? []).filter((item) => item.ativo || item.id === procedimentoId)
  return (
    <section className="schedule-card">
      <h2><Icon name="clipboard" /> Detalhes do Procedimento</h2>
      {(procedimentos.estado === 'erro' || dentistas.estado === 'erro') && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{procedimentos.erro || dentistas.erro}</p>
          <button type="button" className="soft-btn" onClick={() => { procedimentos.recarregar(); dentistas.recarregar() }}>Tentar de novo</button>
        </div>
      )}
      {procedimentos.estado === 'pronto' && ativos.length === 0 && <p className="form-info agenda-estado">Nenhum procedimento ativo. Peça a um administrador para cadastrar.</p>}
      <div className="procedure-grid">
        <div className="field">
          <label htmlFor="procedimento">Procedimento</label>
          <select id="procedimento" value={procedimentoId} disabled={procedimentos.estado !== 'pronto'} onChange={(e) => aoMudarProcedimento(e.target.value)}>
            <option value="">{procedimentos.estado === 'carregando' ? 'Carregando…' : 'Escolha o procedimento'}</option>
            {ativos.map((item) => <option key={item.id} value={item.id}>{item.nome} ({item.duracaoMinutos} min)</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="valor">Valor Estimado (R$)</label>
          <output id="valor" className="money-input"><span>R$</span>{procedimento ? precoEmReais(procedimento.precoCentavos) : '—'}</output>
        </div>
      </div>
      <div className="field">
        <label htmlFor="dentista">Dentista</label>
        <select id="dentista" value={dentistaId} disabled={dentistaTravado || dentistas.estado !== 'pronto'} onChange={(e) => aoMudarDentista(e.target.value)}>
          <option value="">{dentistas.estado === 'carregando' ? 'Carregando…' : 'Qualquer dentista'}</option>
          {(dentistas.dados ?? []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="observacoes">{remarcando ? 'Motivo da remarcação (opcional)' : 'Observações Clínicas'}</label>
        <textarea id="observacoes" value={observacao} onChange={(e) => aoMudarObservacao(e.target.value)} placeholder={remarcando ? 'Por que a consulta está sendo remarcada?' : 'Adicione notas sobre o histórico ou preparo necessário...'} />
      </div>
    </section>
  )
}

function ConsultaMarcada({ consulta, remarcada, aoMarcarOutra }) {
  return (
    <AppShell title={remarcada ? 'Remarcar Consulta' : 'Novo Agendamento'} wide>
      <section className="schedule-card consulta-marcada" role="status">
        <h2><Icon name="calendar" /> {remarcada ? 'Consulta remarcada' : 'Consulta marcada'}</h2>
        <p><strong>{consulta.paciente.nome}</strong> — {consulta.procedimento.nome} com {consulta.dentista.nome}</p>
        <p>{dataEHoraLegiveis(consulta.inicio)}</p>
        <div className="consulta-marcada__acoes">
          <Link className="primary-btn primary-btn--solid" to={`/consultas/${consulta.id}`}>Ver consulta</Link>
          <Link className="soft-btn" to={`/pacientes/${consulta.paciente.id}`}>Ver paciente</Link>
          {!remarcada && <button type="button" className="soft-btn" onClick={aoMarcarOutra}>Marcar outra consulta</button>}
        </div>
      </section>
    </AppShell>
  )
}
