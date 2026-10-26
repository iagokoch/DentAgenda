import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { dataDeHoje, horaDoInstante } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { useRelogio } from '../relogio.js'
import { ehAdmin, ehRecepcao, useSessao } from '../sessao/sessao-contexto.js'

const saudacaoPelaHora = (agora) => {
  const hora = agora.getHours()
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}
const dataPorExtenso = (agora) => agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()

// #3: só atalhos que levam a uma tela que o papel abre (D37).
function atalhosDe(usuario) {
  const atalhos = [
    { para: '/agenda', icone: 'calendar', texto: 'Agendar consulta' },
    { para: '/pacientes', icone: 'users', texto: 'Buscar paciente' },
    { para: '/disponibilidade', icone: 'clock', texto: 'Disponibilidade' },
  ]
  if (ehAdmin(usuario)) atalhos.push({ para: '/admin/equipe', icone: 'id', texto: 'Equipe' })
  else if (ehRecepcao(usuario)) atalhos.push({ para: '/pacientes/novo', icone: 'plus', texto: 'Novo paciente' })
  return atalhos
}

const plural = (quantidade, singular, pluralDaPalavra) => `${quantidade} ${quantidade === 1 ? singular : pluralDaPalavra}`

export default function Inicio() {
  const navigate = useNavigate()
  const { usuario } = useSessao()
  const relogio = useRelogio()
  const [agora] = useState(() => relogio.agora())
  const hoje = dataDeHoje(agora)
  const consultasDeHoje = useDadosDaApi(`/api/consultas?${new URLSearchParams({ de: hoje, ate: hoje, porPagina: '100' })}`)
  const pacientes = useDadosDaApi('/api/pacientes?porPagina=1')
  const pendentes = useDadosDaApi('/api/consultas/pendentes?porPagina=1')

  const naoCanceladas = (consultasDeHoje.dados?.itens ?? []).filter((consulta) => consulta.status !== 'CANCELADA')
  const aVir = naoCanceladas.filter((consulta) => consulta.status === 'CONFIRMADA' && Date.parse(consulta.inicio) > agora.getTime())
  const proxima = aVir[0]

  return (
    <AppShell title="Início">
      <section className="welcome-card">
        <div>
          <span className="eyebrow">{dataPorExtenso(agora)}</span>
          <h1>{saudacaoPelaHora(agora)}, {usuario.nome}!</h1>
          <p>Acompanhe os atendimentos e atividades da sua clínica.</p>
        </div>
        <button className="primary-btn" onClick={() => navigate('/agenda')}><Icon name="plus" /> Novo Agendamento</button>
      </section>

      <section className="stats-grid">
        <CartaoDeNumero icone="calendar" cor="blue" titulo="Consultas hoje" leitura={consultasDeHoje} valor={() => String(naoCanceladas.length)} detalhe={() => `${aVir.length} ainda por vir`} />
        <CartaoDeNumero icone="users" cor="green" titulo="Pacientes cadastrados" leitura={pacientes} valor={(dados) => String(dados.total)} detalhe={() => 'Total no cadastro da clínica'} />
        <CartaoDeNumero
          icone="clock"
          cor="orange"
          titulo="Próxima consulta"
          leitura={consultasDeHoje}
          destacarHora
          valor={() => (proxima ? horaDoInstante(proxima.inicio) : '—')}
          detalhe={() => (proxima ? proxima.paciente.nome : 'Nenhuma consulta restante hoje')}
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">AGENDA</span>
              <h2>Consultas de hoje</h2>
            </div>
          </div>
          <ConsultasDeHoje leitura={consultasDeHoje} />
        </section>
        <aside className="quick-column">
          <section className="panel">
            <div className="panel__header"><h2>Acesso rápido</h2></div>
            <div className="quick-grid">
              {atalhosDe(usuario).map((atalho) => <Link key={atalho.para} to={atalho.para}><Icon name={atalho.icone} /><span>{atalho.texto}</span></Link>)}
            </div>
          </section>
          <section className="panel reminder">
            <Icon name="bell" />
            <div>
              <strong>Lembrete do dia</strong>
              <p>{textoDoLembrete(pendentes)}</p>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}

function textoDoLembrete(pendentes) {
  if (pendentes.estado === 'carregando') return 'Carregando…'
  if (pendentes.estado === 'erro') return 'Não foi possível verificar as consultas pendentes.'
  if (pendentes.dados.total === 0) return 'Nenhuma consulta pendente de registro.'
  return `${plural(pendentes.dados.total, 'consulta já passou', 'consultas já passaram')} e ainda não ${pendentes.dados.total === 1 ? 'foi marcada' : 'foram marcadas'} como realizada${pendentes.dados.total === 1 ? '' : 's'}.`
}

function CartaoDeNumero({ icone, cor, titulo, leitura, valor, detalhe, destacarHora = false }) {
  return (
    <article className="stat-card" aria-busy={leitura.estado === 'carregando'}>
      <span className={`stat-card__icon ${cor}`}><Icon name={icone} /></span>
      <div>
        <small>{titulo}</small>
        {leitura.estado === 'pronto' && (
          <>
            <strong className={destacarHora ? 'stat-card__time' : ''}>{valor(leitura.dados)}</strong>
            <em>{detalhe(leitura.dados)}</em>
          </>
        )}
        {leitura.estado === 'carregando' && <><strong>…</strong><em>Carregando</em></>}
        {leitura.estado === 'erro' && (
          <>
            <strong>—</strong>
            <em className="stat-card__erro">Não foi possível carregar</em>
            <button type="button" className="text-button" onClick={leitura.recarregar}>Tentar de novo</button>
          </>
        )}
      </div>
    </article>
  )
}

function ConsultasDeHoje({ leitura }) {
  if (leitura.estado === 'carregando') return <p className="form-info agenda-estado">Carregando consultas…</p>
  if (leitura.estado === 'erro') {
    return (
      <div className="agenda-estado">
        <p className="form-error" role="alert">{leitura.erro}</p>
        <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
      </div>
    )
  }
  const consultas = leitura.dados.itens
  if (consultas.length === 0) return <p className="form-info agenda-estado">Nenhuma consulta marcada para hoje.</p>
  return (
    <div className="appointment-list">
      {consultas.map((consulta) => {
        const status = STATUS_DA_CONSULTA[consulta.status]
        return (
          <Link key={consulta.id} className="appointment" to={`/consultas/${consulta.id}`}>
            <time>{horaDoInstante(consulta.inicio)}</time>
            <span className="appointment__line" />
            <span className="appointment__info">
              <strong>{consulta.paciente.nome}</strong>
              <small>{consulta.procedimento.nome} · {consulta.dentista.nome}</small>
            </span>
            <span className={`status ${status.cor}`}>{status.texto}</span>
          </Link>
        )
      })}
    </div>
  )
}
