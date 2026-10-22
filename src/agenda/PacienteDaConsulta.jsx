import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import Icon from '../components/Icon'
import { formatarCpf, iniciais, termoDeBusca } from '../pacientes/formatar.js'

const RESULTADOS_POR_BUSCA = 5

// Escolhe quem será atendido: busca por nome ou CPF (GET /api/pacientes?busca=) ou mostra o paciente já escolhido.
export default function PacienteDaConsulta({ paciente, aviso, podeCadastrar, aoEscolher, aoTrocar }) {
  return (
    <section className="schedule-card">
      <h2><Icon name="users" /> Identificação do Paciente</h2>
      {aviso && <p className="form-info agenda-aviso">{aviso}</p>}
      {paciente ? (
        <div className="paciente-escolhido">
          <span className="avatar avatar--small avatar--initials" aria-hidden="true">{iniciais(paciente.nome)}</span>
          <strong>{paciente.nome}</strong>
          {aoTrocar && <button type="button" className="text-button" onClick={aoTrocar}>Trocar paciente</button>}
        </div>
      ) : (
        <BuscaDePaciente podeCadastrar={podeCadastrar} aoEscolher={aoEscolher} />
      )}
    </section>
  )
}

function BuscaDePaciente({ podeCadastrar, aoEscolher }) {
  const [texto, setTexto] = useState('')
  const [termo, setTermo] = useState('')
  const busca = useDadosDaApi(termo ? `/api/pacientes?${new URLSearchParams({ busca: termo, porPagina: String(RESULTADOS_POR_BUSCA) })}` : null)

  function buscar(evento) {
    evento.preventDefault()
    setTermo(termoDeBusca(texto))
  }

  return (
    <>
      <form className="patient-search" onSubmit={buscar}>
        <label className="search-box">
          <Icon name="search" />
          <input aria-label="Buscar paciente por nome ou CPF" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nome ou CPF..." />
        </label>
        <button className="soft-btn">Buscar</button>
        {podeCadastrar && <Link className="soft-btn" to="/pacientes/novo"><Icon name="users" /> Novo Paciente</Link>}
      </form>
      <div aria-live="polite">
        {busca.estado === 'carregando' && <p className="form-info agenda-estado">Buscando…</p>}
        {busca.estado === 'erro' && (
          <div className="agenda-estado">
            <p className="form-error" role="alert">{busca.erro}</p>
            <button type="button" className="soft-btn" onClick={busca.recarregar}>Tentar de novo</button>
          </div>
        )}
        {busca.estado === 'pronto' && busca.dados.itens.length === 0 && (
          <p className="form-info agenda-estado">Nenhum paciente encontrado para “{termo}”.</p>
        )}
        {busca.estado === 'pronto' && busca.dados.itens.length > 0 && (
          <ul className="paciente-resultados">
            {busca.dados.itens.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => aoEscolher({ id: item.id, nome: item.nome })}>
                  <strong>{item.nome}</strong>
                  <span>{formatarCpf(item.cpf)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {busca.estado === 'pronto' && busca.dados.total > busca.dados.itens.length && (
          <p className="form-info agenda-estado">Mostrando {busca.dados.itens.length} de {busca.dados.total}. Refine a busca para ver os outros.</p>
        )}
      </div>
    </>
  )
}
