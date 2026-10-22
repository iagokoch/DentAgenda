import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import DialogoDeCancelamento from '../agenda/DialogoDeCancelamento.jsx'
import ObservacaoDaConsulta from '../agenda/ObservacaoDaConsulta.jsx'
import { dataEHoraLegiveis, horaDoInstante } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'

// Cancelar, remarcar, realizar e observação de uma consulta (docs/api.md, "Consultas").
export default function DetalhesDaConsulta() {
  const { consultaId } = useParams()
  const leitura = useDadosDaApi(`/api/consultas/${consultaId}`)
  // A consulta devolvida por uma ação vale mais que a lida ao abrir a tela, sem recarregar tudo.
  const [aposAcao, setAposAcao] = useState(null)
  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [mensagem, setMensagem] = useState({ tipo: null, texto: '' })
  const [realizando, setRealizando] = useState(false)
  // Instante da abertura da tela: só habilita o botão; quem decide se já começou é a API (CONSULTA_NAO_INICIADA).
  const [abertaEm] = useState(() => Date.now())
  const fecharDialogo = useCallback(() => setDialogoAberto(false), [])

  const consulta = aposAcao?.id === consultaId ? aposAcao : leitura.dados

  if (!consulta) {
    return (
      <AppShell title="Detalhes da Consulta" wide>
        <section className="tab-placeholder">
          {leitura.estado !== 'erro' && <p className="form-info">Carregando…</p>}
          {leitura.estado === 'erro' && <><p className="form-error" role="alert">{leitura.erro}</p><button className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button></>}
          <Link className="text-button" to="/inicio">Voltar para o Início</Link>
        </section>
      </AppShell>
    )
  }

  const status = STATUS_DA_CONSULTA[consulta.status]
  const confirmada = consulta.status === 'CONFIRMADA'
  const jaComecou = Date.parse(consulta.inicio) <= abertaEm

  async function cancelar(justificativa) {
    const cancelada = await api.pedir(`/api/consultas/${consulta.id}/cancelamento`, { metodo: 'POST', corpo: { justificativa } })
    setAposAcao(cancelada)
    setDialogoAberto(false)
    setMensagem({ tipo: 'sucesso', texto: 'Consulta cancelada. O paciente foi avisado.' })
  }

  async function realizar() {
    setMensagem({ tipo: null, texto: '' })
    setRealizando(true)
    try {
      setAposAcao(await api.pedir(`/api/consultas/${consulta.id}/realizacao`, { metodo: 'POST' }))
      setMensagem({ tipo: 'sucesso', texto: 'Consulta marcada como realizada.' })
    } catch (falha) {
      setMensagem({ tipo: 'erro', texto: mensagemDoErro(falha) })
    }
    setRealizando(false)
  }

  return (
    <AppShell title="Detalhes da Consulta" wide>
      <nav className="breadcrumb" aria-label="Caminho"><Link to="/inicio">Início</Link> / <Link to={`/pacientes/${consulta.paciente.id}`}>{consulta.paciente.nome}</Link> / Consulta</nav>
      <section className="patient-hero">
        <div className="patient-hero__name">
          <h1>{consulta.procedimento.nome}</h1>
          <p>{dataEHoraLegiveis(consulta.inicio)} até {horaDoInstante(consulta.fim)}</p>
        </div>
        <span className={`status ${status.cor}`}>{status.texto}</span>
      </section>

      <div className="patient-grid">
        <div className="patient-main">
          <section className="info-card">
            <div className="section-heading"><h2>Informações da consulta</h2></div>
            <div className="info-grid">
              <Dado icone="users" rotulo="PACIENTE" valor={<Link to={`/pacientes/${consulta.paciente.id}`}>{consulta.paciente.nome}</Link>} />
              <Dado icone="user" rotulo="DENTISTA" valor={consulta.dentista.nome} />
              <Dado icone="clipboard" rotulo="PROCEDIMENTO" valor={consulta.procedimento.nome} />
              <Dado icone="clock" rotulo="HORÁRIO" valor={`${dataEHoraLegiveis(consulta.inicio)} – ${horaDoInstante(consulta.fim)}`} />
              {consulta.status === 'CANCELADA' && (
                <Dado icone="alert" rotulo="CANCELAMENTO" valor={`${dataEHoraLegiveis(consulta.canceladoEm)} · por ${consulta.canceladoPor === 'PACIENTE' ? 'o paciente' : 'a clínica'}${consulta.justificativa ? ` — ${consulta.justificativa}` : ''}`} />
              )}
            </div>
          </section>
          <ObservacaoDaConsulta consulta={consulta} aoSalvar={setAposAcao} />
        </div>
        <aside className="patient-side">
          <section className="info-card acoes-da-consulta">
            <h2>Ações</h2>
            <div aria-live="polite">
              {mensagem.tipo === 'sucesso' && <p className="form-info form-sucesso">{mensagem.texto}</p>}
              {mensagem.tipo === 'erro' && <p className="form-error" role="alert">{mensagem.texto}</p>}
            </div>
            {confirmada ? (
              <>
                <button type="button" className="primary-btn primary-btn--solid" disabled={!jaComecou || realizando} onClick={realizar}>
                  <Icon name="check" /> {realizando ? 'Registrando…' : 'Marcar como realizada'}
                </button>
                {!jaComecou && <small className="form-info">Disponível a partir do horário da consulta.</small>}
                <Link className="soft-btn" to={`/agenda?remarcar=${consulta.id}`}><Icon name="calendar" /> Remarcar</Link>
                <button type="button" className="soft-btn soft-btn--perigo" onClick={() => setDialogoAberto(true)}><Icon name="close" /> Cancelar consulta</button>
              </>
            ) : (
              <p className="form-info">Esta consulta está {status.texto.toLowerCase()}; não há ações disponíveis.</p>
            )}
          </section>
        </aside>
      </div>

      {dialogoAberto && <DialogoDeCancelamento aoCancelar={cancelar} aoFechar={fecharDialogo} />}
    </AppShell>
  )
}

function Dado({ icone, rotulo, valor }) {
  return (
    <div className="info-item">
      <span><Icon name={icone} /></span>
      <div><small>{rotulo}</small><strong>{valor}</strong></div>
    </div>
  )
}
