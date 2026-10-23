import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { formatarCpf, formatarTelefone, iniciais, termoDeBusca } from '../pacientes/formatar.js'
import { useSessao } from '../sessao/sessao-contexto.js'

const POR_PAGINA = 20

// Busca por nome (sem acento) ou CPF exato, paginada de 20 em 20 (docs/api.md).
export default function Pacientes() {
  const [parametros] = useSearchParams()
  const busca = parametros.get('busca') ?? ''
  // key: o campo de texto recomeça do valor da URL quando a busca muda (inclusive pelo campo do topo).
  return <ListaDePacientes key={busca} busca={busca} />
}

function ListaDePacientes({ busca }) {
  const { usuario } = useSessao()
  const [parametros, setParametros] = useSearchParams()
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1)
  const [texto, setTexto] = useState(busca)
  const [tentativa, setTentativa] = useState(0)
  const [resposta, setResposta] = useState({ chave: null })
  const podeCadastrar = usuario.categoria === 'RECEPCIONISTA'

  // A resposta guarda a que pedido pertence; enquanto não for a do pedido atual, a tela está carregando.
  const chave = `${busca}|${pagina}|${tentativa}`
  useEffect(() => {
    let atual = true
    const consulta = new URLSearchParams({ busca, pagina: String(pagina), porPagina: String(POR_PAGINA) })
    api.pedir(`/api/pacientes?${consulta}`).then(
      (corpo) => atual && setResposta({ chave: `${busca}|${pagina}|${tentativa}`, corpo }),
      (falha) => atual && setResposta({ chave: `${busca}|${pagina}|${tentativa}`, erro: mensagemDoErro(falha) }),
    )
    return () => {
      atual = false
    }
  }, [busca, pagina, tentativa])

  const estado = resposta.chave !== chave ? 'carregando' : resposta.erro ? 'erro' : 'pronto'
  const resultado = resposta.corpo ?? { itens: [], total: 0 }
  const erro = resposta.erro ?? ''

  function buscar(evento) {
    evento.preventDefault()
    setParametros(termoDeBusca(texto) ? { busca: termoDeBusca(texto) } : {})
  }

  const irParaPagina = (nova) => setParametros({ ...(busca && { busca }), pagina: String(nova) })
  const primeiro = (pagina - 1) * POR_PAGINA + 1
  const ultimo = Math.min(pagina * POR_PAGINA, resultado.total)

  return (
    <AppShell title="DentAgenda" wide>
      <div className="page-heading">
        <div>
          <h1>Pacientes</h1>
          <p>Busque por nome ou CPF para abrir o perfil ou marcar uma consulta.</p>
        </div>
        {podeCadastrar && (
          <Link className="primary-btn primary-btn--solid" to="/pacientes/novo"><Icon name="plus" /> Novo paciente</Link>
        )}
      </div>

      <form className="panel patient-lookup" onSubmit={buscar}>
        <label htmlFor="busca-pacientes" className="caps-label">Buscar paciente</label>
        <div className="patient-lookup__row">
          <div className="input-wrap input-wrap--icon">
            <Icon name="search" />
            <input id="busca-pacientes" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nome ou CPF" />
          </div>
          <button type="submit" className="primary-btn primary-btn--solid">Buscar</button>
        </div>
        <p className="form-info">A busca ignora acentos e maiúsculas: “jose” encontra “José”. Para buscar pelo CPF, digite os 11 números.</p>
      </form>

      <section className="panel patient-table" aria-busy={estado === 'carregando'}>
        <div className="patient-row patient-row--head" aria-hidden="true"><span>Paciente</span><span>CPF</span><span>Telefone</span><span /></div>
        {estado === 'erro' && (
          <div className="patient-state">
            <p className="form-error" role="alert">{erro}</p>
            <button className="soft-btn" onClick={() => setTentativa(tentativa + 1)}>Tentar de novo</button>
          </div>
        )}
        {estado === 'carregando' && <p className="patient-state form-info">Carregando…</p>}
        {estado === 'pronto' && resultado.itens.length === 0 && (
          <p className="patient-state form-info">
            {busca ? `Nenhum paciente encontrado para “${busca}”.` : 'Nenhum paciente cadastrado ainda.'}
          </p>
        )}
        {estado === 'pronto' && resultado.itens.map((paciente) => (
          <div className="patient-row" key={paciente.id}>
            <div className="patient-row__nome"><span className="avatar avatar--small avatar--initials">{iniciais(paciente.nome)}</span><strong>{paciente.nome}</strong></div>
            <span>{formatarCpf(paciente.cpf)}</span>
            <span>{formatarTelefone(paciente.telefone)}</span>
            <Link className="soft-btn patient-row__abrir" to={`/pacientes/${paciente.id}`}>Abrir perfil</Link>
          </div>
        ))}
        {estado === 'pronto' && resultado.total > 0 && (
          <div className="patient-table__footer">
            <span>Mostrando {primeiro}–{ultimo} de {resultado.total} {resultado.total === 1 ? 'paciente' : 'pacientes'}</span>
            <div>
              <button className="soft-btn" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>Anterior</button>
              <button className="soft-btn" disabled={ultimo >= resultado.total} onClick={() => irParaPagina(pagina + 1)}>Próxima</button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  )
}
