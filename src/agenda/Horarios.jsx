import { horaDoInstante } from './calendario.js'

// Horários do dia escolhido (GET /api/horarios-livres). Com "qualquer dentista" o mesmo horário pode vir de mais
// de um dentista: a tela mostra cada horário uma vez e usa o primeiro dentista livre.
export default function Horarios({ horarios, horarioEscolhido, aviso, aoEscolher }) {
  const unicos = [...new Map((horarios.dados?.horarios ?? []).map((horario) => [horario.inicio, horario])).values()]

  return (
    <section className="schedule-card" aria-busy={horarios.estado === 'carregando'}>
      <h2>Horários Disponíveis</h2>
      <div aria-live="polite">
        {aviso && <p className="form-error agenda-estado" role="alert">{aviso}</p>}
        {horarios.estado === 'ocioso' && <p className="form-info agenda-estado">Escolha o procedimento e o dia para ver os horários.</p>}
        {horarios.estado === 'carregando' && <p className="form-info agenda-estado">Carregando horários…</p>}
        {horarios.estado === 'erro' && (
          <div className="agenda-estado">
            <p className="form-error" role="alert">{horarios.erro}</p>
            <button type="button" className="soft-btn" onClick={horarios.recarregar}>Tentar de novo</button>
          </div>
        )}
        {horarios.estado === 'pronto' && unicos.length === 0 && <p className="form-info agenda-estado">Nenhum horário livre neste dia. Escolha outro dia.</p>}
      </div>
      {horarios.estado === 'pronto' && unicos.length > 0 && (
        <div className="time-grid">
          {unicos.map((horario) => (
            <button
              type="button"
              key={horario.inicio}
              aria-pressed={horarioEscolhido?.inicio === horario.inicio}
              className={horarioEscolhido?.inicio === horario.inicio ? 'active' : ''}
              onClick={() => aoEscolher(horario)}
            >
              {horaDoInstante(horario.inicio)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
