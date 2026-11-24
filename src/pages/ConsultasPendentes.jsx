import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { dataEHoraLegiveis, horaDoInstante } from '../agenda/calendario.js'
import AppShell from '../components/AppShell'

const POR_PAGINA = 20

export default function ConsultasPendentes() {
  const [parametros, setParametros] = useSearchParams()
  const numero = Number(parametros.get('pagina') ?? 1)
  const pagina = Number.isSafeInteger(numero) && numero > 0 ? numero : 1
  const consulta = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) })
  const leitura = useDadosDaApi(`/api/consultas/pendentes?${consulta}`)
  const titulo = useRef(null)
  const total = leitura.dados?.total ?? 0
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA))
  const paginaInexistente = leitura.estado === 'pronto' && pagina > ultimaPagina
  const estado = paginaInexistente ? 'carregando' : leitura.estado

  useEffect(() => { titulo.current?.focus() }, [pagina])
  useEffect(() => {
    if (paginaInexistente) setParametros({ pagina: String(ultimaPagina) }, { replace: true })
  }, [paginaInexistente, ultimaPagina, setParametros])

  return (
    <AppShell title="Consultas pendentes" wide>
      <nav className="breadcrumb" aria-label="Caminho"><Link to="/inicio">Início</Link> / Pendências</nav>
      <div className="page-heading">
        <div>
          <h1 ref={titulo} tabIndex={-1}>Consultas pendentes de registro</h1>
          <p>Consultas já encerradas e ainda não marcadas como realizadas.</p>
        </div>
      </div>
      <section className="panel pendencias" aria-busy={estado === 'carregando'} aria-label="Lista de consultas pendentes">
        <p className="form-info" role="status">
          {estado === 'carregando' && 'Carregando consultas pendentes…'}
          {estado === 'pronto' && (total === 0 ? 'Nenhuma consulta pendente de registro.' : `${total} ${total === 1 ? 'consulta' : 'consultas'} · Mais antigas primeiro`)}
        </p>
        {estado === 'erro' && (
          <div className="pendencias-erro">
            <p className="form-error" role="alert">{leitura.erro}</p>
            <button type="button" className="soft-btn" onClick={leitura.recarregar}>Tentar de novo</button>
          </div>
        )}
        {estado === 'pronto' && total > 0 && (
          <>
            <ol className="pendencias-lista" aria-label="Consultas pendentes">
              {leitura.dados.itens.map((item) => (
                <li key={item.id} className="pendencias-item">
                  <div><span className="pendencias-rotulo">Paciente</span><strong>{item.paciente.nome}</strong></div>
                  <div><span className="pendencias-rotulo">Data e horário</span><span>{dataEHoraLegiveis(item.inicio)}–{horaDoInstante(item.fim)}</span></div>
                  <div><span className="pendencias-rotulo">Dentista</span><span>{item.dentista.nome}</span></div>
                  <Link className="soft-btn" to={`/consultas/${item.id}?origem=pendentes&pagina=${pagina}`} aria-label={`Ver consulta de ${item.paciente.nome} em ${dataEHoraLegiveis(item.inicio)}`}>Ver consulta</Link>
                </li>
              ))}
            </ol>
            <nav className="pendencias-paginacao" aria-label="Paginação das consultas pendentes">
              <span>Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, total)} de {total} {total === 1 ? 'consulta' : 'consultas'}</span>
              <div>
                <button type="button" className="soft-btn" disabled={pagina <= 1} onClick={() => setParametros({ pagina: String(pagina - 1) })}>Anterior</button>
                <button type="button" className="soft-btn" disabled={pagina >= ultimaPagina} onClick={() => setParametros({ pagina: String(pagina + 1) })}>Próxima</button>
              </div>
            </nav>
          </>
        )}
      </section>
    </AppShell>
  )
}
