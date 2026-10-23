import { useState } from 'react'
import { api } from '../../api/api.js'
import { mensagemDoErro } from '../../api/mensagens.js'
import { useDadosDaApi } from '../../api/useDadosDaApi.js'
import GavetaDeFuncionario from '../../admin/GavetaDeFuncionario.jsx'
import AppShell from '../../components/AppShell'
import Icon from '../../components/Icon'
import { iniciais } from '../../pacientes/formatar.js'

const categoriaDe = ({ categoria, cro }) => (categoria === 'DENTISTA' ? `Dentista · ${cro}` : 'Recepção')

// Funcionários da clínica (D37): só admin (A). Desativar é PATCH { ativo: false } e derruba as sessões da pessoa (D21.5).
export default function Equipe() {
  const funcionarios = useDadosDaApi('/api/funcionarios')
  const [gaveta, setGaveta] = useState(null)
  const [aviso, setAviso] = useState({ tipo: null, texto: '' })

  async function salvar(corpo) {
    if (gaveta.funcionario) {
      await api.pedir(`/api/funcionarios/${gaveta.funcionario.id}`, { metodo: 'PATCH', corpo })
      setAviso({ tipo: 'sucesso', texto: `Dados de ${corpo.nome ?? gaveta.funcionario.nome} salvos.` })
    } else {
      const criado = await api.pedir('/api/funcionarios', { metodo: 'POST', corpo })
      setAviso({ tipo: 'sucesso', texto: `Funcionário cadastrado. ${criado.nome} define a senha em “Esqueci minha senha”, com o e-mail ${criado.email}.` })
    }
    setGaveta(null)
    funcionarios.recarregar()
  }

  async function alternarAtivo(funcionario) {
    setAviso({ tipo: null, texto: '' })
    try {
      await api.pedir(`/api/funcionarios/${funcionario.id}`, { metodo: 'PATCH', corpo: { ativo: !funcionario.ativo } })
      setAviso({ tipo: 'sucesso', texto: funcionario.ativo ? `${funcionario.nome} foi desativado(a) e não consegue mais entrar.` : `${funcionario.nome} foi reativado(a).` })
      funcionarios.recarregar()
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDoErro(falha) })
    }
  }

  return (
    <AppShell title="Equipe" wide>
      <div className="page-heading">
        <div>
          <h1>Equipe</h1>
          <p>Funcionários da clínica. Quem é desativado perde o acesso na hora.</p>
        </div>
        <button type="button" className="primary-btn primary-btn--solid" onClick={() => { setAviso({ tipo: null, texto: '' }); setGaveta({}) }}><Icon name="plus" /> Novo funcionário</button>
      </div>
      <div aria-live="polite">
        {aviso.tipo === 'sucesso' && <p className="form-info form-sucesso">{aviso.texto}</p>}
        {aviso.tipo === 'erro' && <p className="form-error" role="alert">{aviso.texto}</p>}
      </div>

      <div className="panel patient-table" role="table" aria-label="Funcionários" aria-busy={funcionarios.estado === 'carregando'}>
        <div className="patient-row patient-row--head admin-row" role="row">
          <span role="columnheader">Funcionário</span><span role="columnheader">Categoria</span><span role="columnheader">Situação</span><span role="columnheader"><span className="sr-only">Ações</span></span>
        </div>
        {funcionarios.estado === 'carregando' && <p className="patient-state form-info">Carregando…</p>}
        {funcionarios.estado === 'erro' && (
          <div className="patient-state">
            <p className="form-error" role="alert">{funcionarios.erro}</p>
            <button type="button" className="soft-btn" onClick={funcionarios.recarregar}>Tentar de novo</button>
          </div>
        )}
        {funcionarios.estado === 'pronto' && funcionarios.dados.length === 0 && <p className="patient-state form-info">Nenhum funcionário cadastrado.</p>}
        {funcionarios.estado === 'pronto' && funcionarios.dados.map((funcionario) => (
          <div className="patient-row admin-row" role="row" key={funcionario.id}>
            <div className="patient-row__nome" role="cell">
              <span className="avatar avatar--small avatar--initials" aria-hidden="true">{iniciais(funcionario.nome)}</span>
              <span><strong>{funcionario.nome}</strong><small className="admin-row__detalhe">{funcionario.email}</small></span>
            </div>
            <span role="cell">{categoriaDe(funcionario)}{funcionario.isAdmin && <span className="etiqueta">Admin</span>}</span>
            <span role="cell"><span className={`status ${funcionario.ativo ? 'green' : 'gray'}`}>{funcionario.ativo ? 'Ativo' : 'Inativo'}</span></span>
            <span role="cell" className="admin-row__acoes">
              <button type="button" className="soft-btn" aria-label={`Editar ${funcionario.nome}`} onClick={() => { setAviso({ tipo: null, texto: '' }); setGaveta({ funcionario }) }}>Editar</button>
              <button type="button" className={`soft-btn ${funcionario.ativo ? 'soft-btn--perigo' : ''}`} aria-label={`${funcionario.ativo ? 'Desativar' : 'Reativar'} ${funcionario.nome}`} onClick={() => alternarAtivo(funcionario)}>
                {funcionario.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </span>
          </div>
        ))}
      </div>

      {gaveta && <GavetaDeFuncionario funcionario={gaveta.funcionario} aoSalvar={salvar} aoFechar={() => setGaveta(null)} />}
    </AppShell>
  )
}
