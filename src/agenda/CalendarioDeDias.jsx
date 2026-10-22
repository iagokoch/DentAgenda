import { dataDoDia, deslocarMes, diaDoMes, nomeDoMes, posicaoDoPrimeiroDia, quantidadeDeDias } from './calendario.js'

const DIAS_DA_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

// Marca os dias do mês com vaga (GET /api/dias-disponiveis); os outros ficam desativados.
export default function Calendario({ mes, mesMinimo, dias, diaEscolhido, aoMudarMes, aoEscolher }) {
  const comVaga = new Set((dias.dados?.dias ?? []).map(diaDoMes))
  const espacosAntes = Array.from({ length: posicaoDoPrimeiroDia(mes) }, (_, indice) => indice)
  const doMes = Array.from({ length: quantidadeDeDias(mes) }, (_, indice) => indice + 1)

  return (
    <section className="schedule-card calendar-card" aria-busy={dias.estado === 'carregando'}>
      <div className="section-heading">
        <h2>Data</h2>
        <div>
          <button type="button" aria-label="Mês anterior" disabled={mes <= mesMinimo} onClick={() => aoMudarMes(deslocarMes(mes, -1))}>‹</button>
          <button type="button" aria-label="Próximo mês" onClick={() => aoMudarMes(deslocarMes(mes, 1))}>›</button>
        </div>
      </div>
      <strong className="month">{nomeDoMes(mes)}</strong>
      <div className="weekdays">{DIAS_DA_SEMANA.map((nome) => <span key={nome}>{nome}</span>)}</div>
      <div className="days">
        {espacosAntes.map((indice) => <span key={`espaco-${indice}`} />)}
        {doMes.map((dia) => (
          <button
            type="button"
            key={dia}
            disabled={!comVaga.has(dia)}
            aria-pressed={dataDoDia(mes, dia) === diaEscolhido}
            className={dataDoDia(mes, dia) === diaEscolhido ? 'active' : ''}
            onClick={() => aoEscolher(dataDoDia(mes, dia))}
          >
            {dia}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {dias.estado === 'ocioso' && <p className="form-info agenda-estado">Escolha o procedimento para ver os dias com vaga.</p>}
        {dias.estado === 'carregando' && <p className="form-info agenda-estado">Carregando dias…</p>}
        {dias.estado === 'erro' && (
          <div className="agenda-estado">
            <p className="form-error" role="alert">{dias.erro}</p>
            <button type="button" className="soft-btn" onClick={dias.recarregar}>Tentar de novo</button>
          </div>
        )}
        {dias.estado === 'pronto' && comVaga.size === 0 && <p className="form-info agenda-estado">Sem vagas em {nomeDoMes(mes)}. Tente o próximo mês.</p>}
      </div>
    </section>
  )
}
