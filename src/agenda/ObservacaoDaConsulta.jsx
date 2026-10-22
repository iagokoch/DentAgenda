import { useState } from 'react'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { dataEHoraLegiveis } from './calendario.js'

const AUTOR = { CLINICA: 'Clínica', PACIENTE: 'Paciente' }

// Observação da consulta (PUT grava e registra no histórico) e a lista de versões anteriores.
export default function ObservacaoDaConsulta({ consulta, aoSalvar }) {
  const historico = useDadosDaApi(`/api/consultas/${consulta.id}/observacao/historico`)
  const [texto, setTexto] = useState(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const editando = texto !== null

  async function salvar(evento) {
    evento.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      const atualizada = await api.pedir(`/api/consultas/${consulta.id}/observacao`, { metodo: 'PUT', corpo: { texto: texto.trim() || null } })
      aoSalvar(atualizada)
      historico.recarregar()
      setTexto(null)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    }
    setSalvando(false)
  }

  return (
    <section className="info-card">
      <div className="section-heading">
        <h2>Observações</h2>
        {!editando && <button type="button" className="text-button" onClick={() => setTexto(consulta.observacao ?? '')}>Editar</button>}
      </div>
      {editando ? (
        <form onSubmit={salvar}>
          <label htmlFor="observacao" className="caps-label">Observação da consulta</label>
          <textarea id="observacao" className="observacao-campo" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {erro && <p className="form-error" role="alert">{erro}</p>}
          <div className="dialogo__acoes">
            <button type="button" className="soft-btn" onClick={() => { setTexto(null); setErro('') }}>Cancelar</button>
            <button className="primary-btn primary-btn--solid" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar observação'}</button>
          </div>
        </form>
      ) : (
        <p className="observacao-texto">{consulta.observacao ?? 'Nenhuma observação registrada.'}</p>
      )}

      <h3 className="observacao-historico-titulo">Histórico de alterações</h3>
      <div aria-live="polite">
        {historico.estado === 'carregando' && <p className="form-info">Carregando histórico…</p>}
        {historico.estado === 'erro' && (
          <div>
            <p className="form-error" role="alert">{historico.erro}</p>
            <button type="button" className="soft-btn" onClick={historico.recarregar}>Tentar de novo</button>
          </div>
        )}
        {historico.estado === 'pronto' && historico.dados.length === 0 && <p className="form-info">Ainda não há alterações.</p>}
      </div>
      {historico.estado === 'pronto' && historico.dados.length > 0 && (
        <ul className="observacao-historico">
          {historico.dados.map((versao) => (
            <li key={versao.editadoEm}>
              <small>{dataEHoraLegiveis(versao.editadoEm)} · {versao.funcionario?.nome ?? AUTOR[versao.autor]}</small>
              <p>{versao.texto ?? 'Observação apagada.'}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
