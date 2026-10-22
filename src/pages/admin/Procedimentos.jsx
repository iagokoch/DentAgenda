import { useState } from 'react'
import { api } from '../../api/api.js'
import { mensagemDoErro } from '../../api/mensagens.js'
import { useDadosDaApi } from '../../api/useDadosDaApi.js'
import GavetaDeProcedimento from '../../admin/GavetaDeProcedimento.jsx'
import { precoEmReais } from '../../agenda/calendario.js'
import AppShell from '../../components/AppShell'
import Icon from '../../components/Icon'

// Procedimentos (D37): só admin (A). Não existe DELETE (D18): desativado some do agendamento e pode voltar.
export default function Procedimentos() {
  const procedimentos = useDadosDaApi('/api/procedimentos')
  const [gaveta, setGaveta] = useState(null)
  const [aviso, setAviso] = useState({ tipo: null, texto: '' })

  async function salvar(corpo) {
    if (gaveta.procedimento) {
      await api.pedir(`/api/procedimentos/${gaveta.procedimento.id}`, { metodo: 'PATCH', corpo })
      setAviso({ tipo: 'sucesso', texto: `Procedimento ${corpo.nome ?? gaveta.procedimento.nome} salvo.` })
    } else {
      const criado = await api.pedir('/api/procedimentos', { metodo: 'POST', corpo })
      setAviso({ tipo: 'sucesso', texto: `Procedimento ${criado.nome} cadastrado.` })
    }
    setGaveta(null)
    procedimentos.recarregar()
  }

  async function alternarAtivo(procedimento) {
    setAviso({ tipo: null, texto: '' })
    try {
      await api.pedir(`/api/procedimentos/${procedimento.id}`, { metodo: 'PATCH', corpo: { ativo: !procedimento.ativo } })
      setAviso({ tipo: 'sucesso', texto: procedimento.ativo ? `${procedimento.nome} não aparece mais no agendamento.` : `${procedimento.nome} voltou a aparecer no agendamento.` })
      procedimentos.recarregar()
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDoErro(falha) })
    }
  }

  const abrirGaveta = (procedimento) => {
    setAviso({ tipo: null, texto: '' })
    setGaveta({ procedimento })
  }

  return (
    <AppShell title="Procedimentos" wide>
      <div className="page-heading">
        <div>
          <h1>Procedimentos</h1>
          <p>O que a clínica oferece, com duração e preço. A duração define os horários da agenda.</p>
        </div>
        <button type="button" className="primary-btn primary-btn--solid" onClick={() => abrirGaveta(undefined)}><Icon name="plus" /> Novo procedimento</button>
      </div>
      <div aria-live="polite">
        {aviso.tipo === 'sucesso' && <p className="form-info form-sucesso">{aviso.texto}</p>}
        {aviso.tipo === 'erro' && <p className="form-error" role="alert">{aviso.texto}</p>}
      </div>

      <div className="panel patient-table" role="table" aria-label="Procedimentos" aria-busy={procedimentos.estado === 'carregando'}>
        <div className="patient-row patient-row--head admin-row" role="row">
          <span role="columnheader">Procedimento</span><span role="columnheader">Duração e preço</span><span role="columnheader">Situação</span><span role="columnheader"><span className="sr-only">Ações</span></span>
        </div>
        {procedimentos.estado === 'carregando' && <p className="patient-state form-info">Carregando…</p>}
        {procedimentos.estado === 'erro' && (
          <div className="patient-state">
            <p className="form-error" role="alert">{procedimentos.erro}</p>
            <button type="button" className="soft-btn" onClick={procedimentos.recarregar}>Tentar de novo</button>
          </div>
        )}
        {procedimentos.estado === 'pronto' && procedimentos.dados.length === 0 && <p className="patient-state form-info">Nenhum procedimento cadastrado. Cadastre o primeiro para abrir a agenda.</p>}
        {procedimentos.estado === 'pronto' && procedimentos.dados.map((procedimento) => (
          <div className="patient-row admin-row" role="row" key={procedimento.id}>
            <span className="patient-row__nome" role="cell"><strong>{procedimento.nome}</strong></span>
            <span role="cell">{procedimento.duracaoMinutos} min · R$ {precoEmReais(procedimento.precoCentavos)}</span>
            <span role="cell"><span className={`status ${procedimento.ativo ? 'green' : 'gray'}`}>{procedimento.ativo ? 'Ativo' : 'Inativo'}</span></span>
            <span role="cell" className="admin-row__acoes">
              <button type="button" className="soft-btn" aria-label={`Editar ${procedimento.nome}`} onClick={() => abrirGaveta(procedimento)}>Editar</button>
              <button type="button" className={`soft-btn ${procedimento.ativo ? 'soft-btn--perigo' : ''}`} aria-label={`${procedimento.ativo ? 'Desativar' : 'Reativar'} ${procedimento.nome}`} onClick={() => alternarAtivo(procedimento)}>
                {procedimento.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </span>
          </div>
        ))}
      </div>

      {gaveta && <GavetaDeProcedimento procedimento={gaveta.procedimento} aoSalvar={salvar} aoFechar={() => setGaveta(null)} />}
    </AppShell>
  )
}
