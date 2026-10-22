import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { instanteDaClinica } from '../admin/formatos.js'
import { dataDeHoje, dataEHoraLegiveis } from '../agenda/calendario.js'
import { useRelogio } from '../relogio.js'

const periodo = (bloqueio) => `${dataEHoraLegiveis(bloqueio.inicio)} até ${dataEHoraLegiveis(bloqueio.fim)}`

// Bloqueios do dentista (D12, D37): R vê e cria para qualquer dentista, em lote (feriado); D só os próprios.
// `dentistas` é a lista para o lote; vazia, o bloqueio é só do dentista da tela.
export default function Bloqueios({ dentistaId, dentistas }) {
  const relogio = useRelogio()
  const [hoje] = useState(() => dataDeHoje(relogio.agora()))
  const leitura = useDadosDaApi(`/api/dentistas/${dentistaId}/bloqueios?${new URLSearchParams({ de: hoje })}`)
  const [aviso, setAviso] = useState({ tipo: null, texto: '' })

  async function remover(bloqueio) {
    setAviso({ tipo: null, texto: '' })
    try {
      await api.pedir(`/api/bloqueios/${bloqueio.id}`, { metodo: 'DELETE' })
      setAviso({ tipo: 'sucesso', texto: 'Bloqueio removido.' })
      leitura.recarregar()
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDoErro(falha) })
    }
  }

  return (
    <section className="panel disponibilidade-secao" aria-labelledby="titulo-bloqueios" aria-busy={leitura.estado === 'carregando'}>
      <h2 id="titulo-bloqueios">Bloqueios</h2>
      <p className="form-info">Folgas, feriados e compromissos: nesses períodos a agenda não oferece horário.</p>
      <div aria-live="polite">
        {aviso.tipo === 'sucesso' && <p className="form-info form-sucesso">{aviso.texto}</p>}
        {aviso.tipo === 'erro' && <p className="form-error" role="alert">{aviso.texto}</p>}
      </div>
      {leitura.estado === 'carregando' && <p className="form-info agenda-estado">Carregando bloqueios…</p>}
      {leitura.estado === 'erro' && (
        <div className="agenda-estado">
          <p className="form-error" role="alert">{leitura.erro}</p>
          <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
        </div>
      )}
      {leitura.estado === 'pronto' && leitura.dados.length === 0 && <p className="form-info agenda-estado">Nenhum bloqueio de hoje em diante.</p>}
      {leitura.estado === 'pronto' && leitura.dados.length > 0 && (
        <ul className="lista-de-bloqueios">
          {leitura.dados.map((bloqueio) => (
            <li key={bloqueio.id}>
              <span>{periodo(bloqueio)}</span>
              <button type="button" className="text-button text-button--perigo" aria-label={`Remover bloqueio de ${periodo(bloqueio)}`} onClick={() => remover(bloqueio)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      <NovoBloqueio dentistaId={dentistaId} dentistas={dentistas} aoCriar={(texto) => { setAviso({ tipo: 'sucesso', texto }); leitura.recarregar() }} />
    </section>
  )
}

function NovoBloqueio({ dentistaId, dentistas, aoCriar }) {
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [escolhidos, setEscolhidos] = useState([dentistaId])
  const [envio, setEnvio] = useState({ estado: 'parado' })
  const nomeDe = (id) => dentistas.find((dentista) => dentista.id === id)?.nome

  const alternar = (id) => setEscolhidos(escolhidos.includes(id) ? escolhidos.filter((atual) => atual !== id) : [...escolhidos, id])

  async function bloquear(evento) {
    evento.preventDefault()
    setEnvio({ estado: 'enviando' })
    // Na ordem da lista, como a API devolve (docs/api.md).
    const dentistaIds = dentistas.length > 0 ? dentistas.map((dentista) => dentista.id).filter((id) => escolhidos.includes(id)) : [dentistaId]
    try {
      const criados = await api.pedir('/api/bloqueios', { metodo: 'POST', corpo: { dentistaIds, inicio: instanteDaClinica(inicio), fim: instanteDaClinica(fim) } })
      setEnvio({ estado: 'parado' })
      setInicio('')
      setFim('')
      aoCriar(criados.length > 1 ? `Bloqueio criado para ${criados.length} dentistas.` : 'Bloqueio criado.')
    } catch (falha) {
      setEnvio({ estado: 'erro', mensagem: mensagemDoErro(falha), consultas: falha.detalhes?.consultas ?? [] })
    }
  }

  return (
    <form className="novo-bloqueio" onSubmit={bloquear}>
      <h3>Novo bloqueio</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="bloqueio-inicio">Início do bloqueio</label>
          <div className="input-wrap"><input id="bloqueio-inicio" type="datetime-local" required value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="bloqueio-fim">Fim do bloqueio</label>
          <div className="input-wrap"><input id="bloqueio-fim" type="datetime-local" required value={fim} onChange={(e) => setFim(e.target.value)} /></div>
        </div>
      </div>
      {dentistas.length > 0 && (
        <fieldset className="bloqueio-dentistas">
          <legend>Dentistas bloqueados (tudo ou nada: se um tiver consulta no período, nenhum é bloqueado)</legend>
          {dentistas.map((dentista) => (
            <label key={dentista.id} className="campo-marcavel campo-marcavel--linha">
              <input type="checkbox" checked={escolhidos.includes(dentista.id)} onChange={() => alternar(dentista.id)} />
              <span>{dentista.nome}</span>
            </label>
          ))}
        </fieldset>
      )}
      {envio.estado === 'erro' && (
        <div className="form-error" role="alert">
          <p>{envio.mensagem}</p>
          {envio.consultas.length > 0 && (
            <ul className="lista-de-consultas">
              {envio.consultas.map((consulta) => (
                <li key={consulta.id}>
                  <Link to={`/consultas/${consulta.id}`}>{dataEHoraLegiveis(consulta.inicio)} — {consulta.paciente.nome}{nomeDe(consulta.dentistaId) ? ` (${nomeDe(consulta.dentistaId)})` : ''}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="submit" className="primary-btn primary-btn--solid" disabled={envio.estado === 'enviando' || (dentistas.length > 0 && escolhidos.length === 0)}>
        {envio.estado === 'enviando' ? 'Bloqueando…' : 'Bloquear'}
      </button>
    </form>
  )
}
