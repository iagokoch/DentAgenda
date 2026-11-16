import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { ErroDaApi } from '../api/cliente-http.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import DialogoDeCancelamento from '../agenda/DialogoDeCancelamento.jsx'
import { dataDeHoje, dataEHoraLegiveis } from '../agenda/calendario.js'
import { STATUS_DA_CONSULTA } from '../agenda/status.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import { faltamMenosDe24Horas, historicoDoPaciente, jaComecou, proximasDoPaciente } from '../minha-conta/consultas-do-paciente.js'
import { useRelogio } from '../relogio.js'
import { useSessao } from '../sessao/sessao-contexto.js'

const POR_PAGINA = '100'
const AVISO_DO_PACIENTE = 'A clínica vê o cancelamento na agenda. Esta ação não pode ser desfeita; para outro horário, marque uma nova consulta.'
const AVISO_DE_MENOS_DE_24_HORAS = 'Faltam menos de 24 h para a consulta: conte à clínica o motivo do cancelamento.'
const AVISO_DE_CONSULTA_INICIADA = 'A consulta já começou e não pode mais ser cancelada pelo aplicativo.'
const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000

// Área do paciente (D35): as próximas consultas, com cancelamento, e o histórico. Só o paciente logado (C) chega aqui.
export default function MinhasConsultas() {
  const { usuario } = useSessao()
  const relogio = useRelogio()
  const [abertaEm] = useState(() => relogio.agora())
  const [agora, setAgora] = useState(() => relogio.agora())
  const proximas = useDadosDaApi(`/api/consultas?${new URLSearchParams({ status: 'CONFIRMADA', de: dataDeHoje(abertaEm), porPagina: POR_PAGINA })}`)
  const todas = useDadosDaApi(`/api/consultas?${new URLSearchParams({ porPagina: POR_PAGINA })}`)
  const [cancelando, setCancelando] = useState(null)
  const [aviso, setAviso] = useState('')
  const fecharCancelamento = useCallback(() => setCancelando(null), [])
  const itensProximos = proximas.dados?.itens
  const itensDoHistorico = todas.dados?.itens
  const consultaEmCancelamento = cancelando?.consulta

  useEffect(() => {
    let temporizador
    function atualizar() {
      clearTimeout(temporizador)
      const instante = relogio.agora()
      setAgora((anterior) => anterior.getTime() === instante.getTime() ? anterior : instante)
      if (consultaEmCancelamento && jaComecou(consultaEmCancelamento, instante)) {
        setCancelando(null)
        setAviso(AVISO_DE_CONSULTA_INICIADA)
      }
      const fronteiras = [...(itensProximos ?? []), ...(itensDoHistorico ?? [])]
        .filter((consulta) => consulta.status === 'CONFIRMADA')
        .flatMap((consulta) => {
          const inicio = Date.parse(consulta.inicio)
          // Exatamente 24 h ainda permite cancelar sem justificativa (D14).
          return [inicio, inicio - VINTE_E_QUATRO_HORAS_EM_MS + 1]
        })
      const falta = Math.min(...fronteiras.filter((fronteira) => fronteira > instante.getTime())) - instante.getTime()
      // Consultas distantes usam etapas para respeitar o limite do setTimeout.
      if (Number.isFinite(falta)) temporizador = setTimeout(atualizar, Math.min(falta, 2_147_483_647))
    }
    atualizar()
    window.addEventListener('focus', atualizar)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      clearTimeout(temporizador)
      window.removeEventListener('focus', atualizar)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [consultaEmCancelamento, itensProximos, itensDoHistorico, relogio])

  async function cancelar(justificativa) {
    const instante = relogio.agora()
    setAgora(instante)
    if (jaComecou(cancelando.consulta, instante)) {
      setCancelando(null)
      setAviso(AVISO_DE_CONSULTA_INICIADA)
      return
    }
    if (faltamMenosDe24Horas(cancelando.consulta, instante) && !justificativa) {
      throw new ErroDaApi(422, 'JUSTIFICATIVA_OBRIGATORIA', 'Informe o motivo: faltam menos de 24 horas para a consulta.')
    }
    await api.pedir(`/api/consultas/${cancelando.consulta.id}/cancelamento`, { metodo: 'POST', corpo: justificativa ? { justificativa } : {} })
    setCancelando(null)
    setAviso('Consulta cancelada.')
    proximas.recarregar()
    todas.recarregar()
  }

  function abrirCancelamento(consulta) {
    const instante = relogio.agora()
    setAgora(instante)
    if (jaComecou(consulta, instante)) {
      setAviso(AVISO_DE_CONSULTA_INICIADA)
      return
    }
    setAviso('')
    setCancelando({ consulta })
  }

  const semNenhumaConsulta = todas.estado === 'pronto' && todas.dados.itens.length === 0

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

      {semNenhumaConsulta ? <SemConsultas /> : <div className="minha-conta">
        <ListaDeConsultas titulo="Próximas consultas" agora={agora} leitura={proximas} vazio="Você não tem consultas marcadas." filtrar={(itens) => proximasDoPaciente(itens, agora)} aoCancelar={abrirCancelamento} />
        <ListaDeConsultas titulo="Histórico" leitura={todas} vazio="Nenhuma consulta anterior." filtrar={(itens) => historicoDoPaciente(itens, agora)} />
      </div>}

      {cancelando && (
        <DialogoDeCancelamento
          aviso={faltamMenosDe24Horas(cancelando.consulta, agora) ? AVISO_DE_MENOS_DE_24_HORAS : AVISO_DO_PACIENTE}
          justificativaObrigatoria={faltamMenosDe24Horas(cancelando.consulta, agora)}
          aoCancelar={cancelar}
          aoFechar={fecharCancelamento}
        />
      )}
    </AppShell>
  )
}

function SemConsultas() {
  return (
    <section className="panel consultas-vazio" aria-labelledby="titulo-sem-consultas">
      <span className="consultas-vazio__icone" aria-hidden="true"><Icon name="calendar" /></span>
      <h2 id="titulo-sem-consultas">Nenhuma consulta</h2>
      <p>Você ainda não tem consultas marcadas. Escolha o procedimento, o dentista e um horário livre para agendar a sua.</p>
      <Link className="primary-btn primary-btn--solid" to="/minha-conta/agendar"><Icon name="plus" /> Agendar consulta</Link>
    </section>
  )
}

const textoDoStatus = (consulta) => {
  if (consulta.status !== 'CANCELADA') return STATUS_DA_CONSULTA[consulta.status].texto
  return consulta.canceladoPor === 'PACIENTE' ? 'Cancelada por você' : 'Cancelada pela clínica'
}

function ListaDeConsultas({ titulo, agora, leitura, vazio, filtrar, aoCancelar }) {
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
              {aoCancelar && !jaComecou(consulta, agora) && (
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
