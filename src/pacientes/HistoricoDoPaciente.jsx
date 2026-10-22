import { Link } from 'react-router-dom'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { dataEHoraLegiveis } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'

const POR_PAGINA = 50

// Consultas do paciente, da mais antiga para a mais nova (GET /api/consultas?pacienteId=).
export default function HistoricoDoPaciente({ pacienteId }) {
  const leitura = useDadosDaApi(`/api/consultas?${new URLSearchParams({ pacienteId, porPagina: String(POR_PAGINA) })}`)

  if (leitura.estado === 'carregando') return <p className="tab-placeholder form-info">Carregando histórico…</p>
  if (leitura.estado === 'erro') {
    return (
      <section className="tab-placeholder">
        <p className="form-error" role="alert">{leitura.erro}</p>
        <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
      </section>
    )
  }
  const { itens, total } = leitura.dados
  if (itens.length === 0) return <section className="tab-placeholder"><h2>Histórico</h2><p>Este paciente ainda não tem consultas.</p></section>
  return (
    <section className="panel">
      <div className="appointment-list">
        {itens.map((consulta) => {
          const status = STATUS_DA_CONSULTA[consulta.status]
          return (
            <Link key={consulta.id} className="appointment" to={`/consultas/${consulta.id}`}>
              <time>{dataEHoraLegiveis(consulta.inicio)}</time>
              <span className="appointment__line" />
              <span className="appointment__info">
                <strong>{consulta.procedimento.nome}</strong>
                <small>{consulta.dentista.nome}</small>
              </span>
              <span className={`status ${status.cor}`}>{status.texto}</span>
            </Link>
          )
        })}
      </div>
      {total > itens.length && <p className="form-info agenda-estado">Mostrando {itens.length} de {total} consultas.</p>}
    </section>
  )
}
