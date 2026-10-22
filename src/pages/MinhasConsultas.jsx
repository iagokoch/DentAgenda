import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import DialogoDeCancelamento from '../agenda/DialogoDeCancelamento.jsx'
import { dataDeHoje, dataEHoraLegiveis } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { faltamMenosDe24Horas, historicoDoPaciente, jaComecou, proximasDoPaciente } from '../minha-conta/consultas-do-paciente.js'
import { useSessao } from '../sessao/sessao-contexto.js'

const POR_PAGINA = '100'
const AVISO_DO_PACIENTE = 'A clínica vê o cancelamento na agenda. Esta ação não pode ser desfeita; para outro horário, marque uma nova consulta.'
const AVISO_DE_MENOS_DE_24_HORAS = 'Faltam menos de 24 h para a consulta: conte à clínica o motivo do cancelamento.'

// Área do paciente (D35): as próximas consultas, com cancelamento, e o histórico. Só o paciente logado (C) chega aqui.
export default function MinhasConsultas() {
  const { usuario } = useSessao()
  const [abertaEm] = useState(() => new Date())
  const proximas = useDadosDaApi(`/api/consultas?${new URLSearchParams({ status: 'CONFIRMADA', de: dataDeHoje(abertaEm), porPagina: POR_PAGINA })}`)
  const todas = useDadosDaApi(`/api/consultas?${new URLSearchParams({ porPagina: POR_PAGINA })}`)
  const [cancelando, setCancelando] = useState(null)
  const [aviso, setAviso] = useState('')

  async function cancelar(justificativa) {
    await api.pedir(`/api/consultas/${cancelando.consulta.id}/cancelamento`, { metodo: 'POST', corpo: justificativa ? { justificativa } : {} })
    setCancelando(null)
    setAviso('Consulta cancelada.')
    proximas.recarregar()
    todas.recarregar()
  }

  function abrirCancelamento(consulta) {
    setAviso('')
    setCancelando({ consulta, justificativaObrigatoria: faltamMenosDe24Horas(consulta, new Date()) })
  }

  return (
    <AppShell title="Minhas consultas">
      <header className="page-heading">
        <div>
          <h1>Olá, {usuario.nome.split(' ')[0]}</h1>
          <p>Suas consultas na Colzani Odontologia.</p>
        </div>
        <Link className="primary-btn primary-btn--solid" to="/minha-conta/agendar"><Icon name="plus" /> Marcar consulta</Link>
      </header>
      <div aria-live="polite">{aviso && <p className="form-info form-sucesso">{aviso}</p>}</div>

      <div className="minha-conta">
        <ListaDeConsultas titulo="Próximas consultas" leitura={proximas} vazio="Você não tem consultas marcadas." filtrar={(itens) => proximasDoPaciente(itens, abertaEm)} aoCancelar={abrirCancelamento} />
        <ListaDeConsultas titulo="Histórico" leitura={todas} vazio="Nenhuma consulta anterior." filtrar={(itens) => historicoDoPaciente(itens, abertaEm)} />
      </div>

      {cancelando && (
        <DialogoDeCancelamento
          aviso={cancelando.justificativaObrigatoria ? AVISO_DE_MENOS_DE_24_HORAS : AVISO_DO_PACIENTE}
          justificativaObrigatoria={cancelando.justificativaObrigatoria}
          aoCancelar={cancelar}
          aoFechar={() => setCancelando(null)}
        />
      )}
    </AppShell>
  )
}

const textoDoStatus = (consulta) => {
  if (consulta.status !== 'CANCELADA') return STATUS_DA_CONSULTA[consulta.status].texto
  return consulta.canceladoPor === 'PACIENTE' ? 'Cancelada por você' : 'Cancelada pela clínica'
}

function ListaDeConsultas({ titulo, leitura, vazio, filtrar, aoCancelar }) {
  const idDoTitulo = `titulo-${titulo.toLowerCase().replace(/\s+/g, '-')}`
  const consultas = leitura.estado === 'pronto' ? filtrar(leitura.dados.itens) : []

  return (
    <section className="panel" aria-labelledby={idDoTitulo} aria-busy={leitura.estado === 'carregando'}>
      <h2 id={idDoTitulo}>{titulo}</h2>
      {leitura.estado === 'carregando' && <p className="form-info agenda-estado">Carregando consultas…</p>}
      {leitura.estado === 'erro' && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{leitura.erro}</p>
          <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
        </div>
      )}
      {leitura.estado === 'pronto' && consultas.length === 0 && <p className="form-info agenda-estado">{vazio}</p>}
      {consultas.length > 0 && (
        <ul className="appointment-list consultas-do-paciente">
          {consultas.map((consulta) => (
            <li key={consulta.id} className="appointment">
              <time dateTime={consulta.inicio}>{dataEHoraLegiveis(consulta.inicio)}</time>
              <span className="appointment__line" />
              <span className="appointment__info">
                <strong>{consulta.procedimento.nome}</strong>
                <small>{consulta.dentista.nome}</small>
              </span>
              <span className={`status ${STATUS_DA_CONSULTA[consulta.status].cor}`}>{textoDoStatus(consulta)}</span>
              {aoCancelar && !jaComecou(consulta, new Date()) && (
                <button type="button" className="soft-btn soft-btn--perigo" aria-label={`Cancelar consulta de ${dataEHoraLegiveis(consulta.inicio)}`} onClick={() => aoCancelar(consulta)}>
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {leitura.estado === 'pronto' && leitura.dados.total > leitura.dados.itens.length && (
        <p className="form-info agenda-estado">Mostrando {leitura.dados.itens.length} de {leitura.dados.total} consultas.</p>
      )}
    </section>
  )
}
