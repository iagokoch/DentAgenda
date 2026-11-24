import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import DialogoDeCancelamento from '../agenda/DialogoDeCancelamento.jsx'
import { dataDeHoje, horaDoInstante } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { aguardaRegistro, colunasPorDentista, deslocarDia, diaPorExtenso, filtrarPorPaciente } from '../consultas/visao.js'
import { jaComecou } from '../minha-conta/consultas-do-paciente.js'
import { useAgoraAtualizado } from '../agenda/useAgoraAtualizado.js'
import { useSessao } from '../sessao/sessao-contexto.js'

const DIAS_DA_LISTA = 30

// Consultas da clínica (docs/api.md, GET /api/consultas): recepção e administração veem todos os dentistas; o dentista
// recebe da API só a própria agenda (D10). As ações são as mesmas dos Detalhes da consulta.
export default function Consultas() {
  const { usuario } = useSessao()
  const agora = useAgoraAtualizado()
  const hoje = dataDeHoje(agora)
  const ehDentista = usuario.categoria === 'DENTISTA'

  const [visao, setVisao] = useState('dia')
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const dia = diaSelecionado ?? hoje
  const [periodoSelecionado, setPeriodoSelecionado] = useState(null)
  const { de, ate } = periodoSelecionado ?? { de: hoje, ate: deslocarDia(hoje, DIAS_DA_LISTA) }
  const setDe = (valor) => setPeriodoSelecionado({ de: valor, ate })
  const setAte = (valor) => setPeriodoSelecionado({ de, ate: valor })
  const [dentistaId, setDentistaId] = useState('')
  const [status, setStatus] = useState('')
  const [nome, setNome] = useState('')
  const [cancelando, setCancelando] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: null, texto: '' })
  const [registrando, setRegistrando] = useState(null)

  const dentistas = useDadosDaApi(ehDentista ? null : '/api/dentistas')
  const periodo = visao === 'dia' ? { de: dia, ate: dia } : { de, ate }
  const filtros = new URLSearchParams({ ...periodo, porPagina: '100' })
  if (visao === 'lista' && dentistaId) filtros.set('dentistaId', dentistaId)
  if (visao === 'lista' && status) filtros.set('status', status)
  const consultas = useDadosDaApi(`/api/consultas?${filtros}`)

  const itens = consultas.dados?.itens ?? []
  const visiveis = visao === 'lista' ? filtrarPorPaciente(itens, nome) : itens
  const aguardando = itens.filter((consulta) => aguardaRegistro(consulta, agora)).length

  async function cancelar(justificativa) {
    await api.pedir(`/api/consultas/${cancelando.id}/cancelamento`, { metodo: 'POST', corpo: justificativa ? { justificativa } : {} })
    setCancelando(null)
    setMensagem({ tipo: 'sucesso', texto: 'Consulta cancelada.' })
    consultas.recarregar()
  }

  async function realizar(consulta) {
    setMensagem({ tipo: null, texto: '' })
    setRegistrando(consulta.id)
    try {
      await api.pedir(`/api/consultas/${consulta.id}/realizacao`, { metodo: 'POST' })
      setMensagem({ tipo: 'sucesso', texto: 'Consulta marcada como realizada.' })
      consultas.recarregar()
    } catch (falha) {
      setMensagem({ tipo: 'erro', texto: mensagemDoErro(falha) })
    }
    setRegistrando(null)
  }

  function trocarVisao(nova) {
    setVisao(nova)
  }

  const acoes = { agora, registrando, aoCancelar: setCancelando, aoRealizar: realizar }
  const titulo = ehDentista ? 'Minhas consultas' : 'Consultas'

  return (
    <AppShell title={titulo} wide>
      <header className="page-heading">
        <div>
          <h1>{titulo}</h1>
          <p>{ehDentista ? 'Somente a sua agenda. Consultas de outros dentistas não aparecem.' : 'Todas as consultas da clínica, de todos os dentistas.'}</p>
        </div>
        <div className="consultas-visao" role="group" aria-label="Visão">
          {[['dia', 'Dia'], ['lista', 'Lista']].map(([valor, texto]) => (
            <button key={valor} type="button" className={visao === valor ? 'is-active' : ''} aria-pressed={visao === valor} onClick={() => trocarVisao(valor)}>{texto}</button>
          ))}
        </div>
      </header>

      <div aria-live="polite">
        {mensagem.tipo === 'sucesso' && <p className="form-info form-sucesso">{mensagem.texto}</p>}
        {mensagem.tipo === 'erro' && <p className="form-error" role="alert">{mensagem.texto}</p>}
      </div>

      {visao === 'dia' ? (
        <div className="consultas-navegacao">
          <h2>{diaPorExtenso(dia)}</h2>
          <button type="button" className="icon-button" aria-label="Dia anterior" onClick={() => setDiaSelecionado(deslocarDia(dia, -1))}><Icon name="arrowLeft" /></button>
          <button type="button" className="soft-btn" onClick={() => setDiaSelecionado(null)}>Hoje</button>
          <button type="button" className="icon-button" aria-label="Próximo dia" onClick={() => setDiaSelecionado(deslocarDia(dia, 1))}><span className="consultas-seta-direita"><Icon name="arrowLeft" /></span></button>
        </div>
      ) : (
        <FiltrosDaLista {...{ de, setDe, ate, setAte, status, setStatus, nome, setNome, dentistaId, setDentistaId, dentistas: dentistas.dados ?? [], ehDentista }} />
      )}

      {aguardando > 0 && <p className="consultas-aviso">{aguardando === 1 ? '1 consulta já passou e aguarda registro.' : `${aguardando} consultas já passaram e aguardam registro.`}</p>}

      {consultas.estado === 'carregando' && <p className="form-info agenda-estado">Carregando consultas…</p>}
      {consultas.estado === 'erro' && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{consultas.erro}</p>
          <button type="button" className="soft-btn" onClick={consultas.recarregar}>Tentar de novo</button>
        </div>
      )}
      {consultas.estado === 'pronto' && visao === 'lista' && <ListaDeConsultas consultas={visiveis} {...acoes} />}
      {consultas.estado === 'pronto' && visao === 'dia' && (
        <DiaPorDentista colunas={colunasPorDentista(ehDentista ? [] : dentistas.dados ?? [], itens)} {...acoes} />
      )}

      {cancelando && <DialogoDeCancelamento aoCancelar={cancelar} aoFechar={() => setCancelando(null)} />}
    </AppShell>
  )
}

function FiltrosDaLista({ de, setDe, ate, setAte, status, setStatus, nome, setNome, dentistaId, setDentistaId, dentistas, ehDentista }) {
  const id = useId()
  return (
    <form className="consultas-filtros" role="search" aria-label="Filtros" onSubmit={(evento) => evento.preventDefault()}>
      <div className="field"><label htmlFor={`${id}-de`}>De</label><input id={`${id}-de`} type="date" value={de} onChange={(evento) => setDe(evento.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-ate`}>Até</label><input id={`${id}-ate`} type="date" value={ate} onChange={(evento) => setAte(evento.target.value)} /></div>
      {!ehDentista && (
        <div className="field">
          <label htmlFor={`${id}-dentista`}>Dentista</label>
          <select id={`${id}-dentista`} value={dentistaId} onChange={(evento) => setDentistaId(evento.target.value)}>
            <option value="">Todos os dentistas</option>
            {dentistas.map((dentista) => <option key={dentista.id} value={dentista.id}>{dentista.nome}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-status`}>Status</label>
        <select id={`${id}-status`} value={status} onChange={(evento) => setStatus(evento.target.value)}>
          <option value="">Todos</option>
          {Object.entries(STATUS_DA_CONSULTA).map(([valor, { texto }]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
      </div>
      <div className="field consultas-filtros__paciente"><label htmlFor={`${id}-paciente`}>Paciente</label><input id={`${id}-paciente`} type="search" placeholder="Buscar pelo nome" value={nome} onChange={(evento) => setNome(evento.target.value)} /></div>
    </form>
  )
}

function ListaDeConsultas({ consultas, ...acoes }) {
  if (consultas.length === 0) return <p className="form-info agenda-estado">Nenhuma consulta neste período.</p>
  return (
    <ul className="consultas-lista">
      {consultas.map((consulta) => (
        <li key={consulta.id} className="consultas-lista__item">
          <time dateTime={consulta.inicio}>{consulta.inicio.slice(8, 10)}/{consulta.inicio.slice(5, 7)} · {horaDoInstante(consulta.inicio)}–{horaDoInstante(consulta.fim)}</time>
          <span className="appointment__info"><strong>{consulta.paciente.nome}</strong><small>{consulta.procedimento.nome} · {consulta.dentista.nome}</small></span>
          <Etiqueta consulta={consulta} agora={acoes.agora} />
          <Acoes consulta={consulta} {...acoes} />
        </li>
      ))}
    </ul>
  )
}

function DiaPorDentista({ colunas, ...acoes }) {
  if (colunas.length === 0 || colunas.every((coluna) => coluna.consultas.length === 0 && colunas.length === 1)) {
    return <p className="form-info agenda-estado">Nenhuma consulta neste dia.</p>
  }
  return (
    <div className="consultas-dia" style={{ '--colunas': colunas.length }}>
      {colunas.map((coluna) => (
        <section key={coluna.id} className="panel consultas-dia__coluna" aria-label={`Agenda de ${coluna.nome}`}>
          <h3>{coluna.nome}<small>{coluna.consultas.length === 0 ? 'Sem consultas' : coluna.consultas.length === 1 ? '1 consulta' : `${coluna.consultas.length} consultas`}</small></h3>
          <ul>
            {coluna.consultas.map((consulta) => (
              <li key={consulta.id} className={`consultas-dia__consulta${aguardaRegistro(consulta, acoes.agora) ? ' is-pendente' : ''}`}>
                <time dateTime={consulta.inicio}>{horaDoInstante(consulta.inicio)}–{horaDoInstante(consulta.fim)}</time>
                <strong>{consulta.paciente.nome}</strong>
                <small>{consulta.procedimento.nome}</small>
                <Etiqueta consulta={consulta} agora={acoes.agora} />
                <Acoes consulta={consulta} {...acoes} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Etiqueta({ consulta, agora }) {
  if (aguardaRegistro(consulta, agora)) return <span className="status orange">Passou, sem registro</span>
  const situacao = STATUS_DA_CONSULTA[consulta.status]
  return <span className={`status ${situacao.cor}`}>{situacao.texto}</span>
}

function Acoes({ consulta, agora, registrando, aoCancelar, aoRealizar }) {
  const confirmada = consulta.status === 'CONFIRMADA'
  const nome = `${consulta.paciente.nome}, ${horaDoInstante(consulta.inicio)}`
  return (
    <span className="consultas-acoes">
      {confirmada && jaComecou(consulta, agora) && (
        <button type="button" className="soft-btn soft-btn--green" disabled={registrando === consulta.id} aria-label={`Marcar como realizada: ${nome}`} onClick={() => aoRealizar(consulta)}>Marcar realizada</button>
      )}
      {confirmada && <Link className="soft-btn" to={`/agenda?remarcar=${consulta.id}`} aria-label={`Remarcar: ${nome}`}>Remarcar</Link>}
      {confirmada && <button type="button" className="soft-btn soft-btn--perigo" aria-label={`Cancelar: ${nome}`} onClick={() => aoCancelar(consulta)}>Cancelar</button>}
      <Link className="soft-btn" to={`/consultas/${consulta.id}`} aria-label={`Detalhes: ${nome}`}>Detalhes</Link>
    </span>
  )
}
