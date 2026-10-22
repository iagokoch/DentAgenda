import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/api.js'
import { mensagemDoErro } from '../api/mensagens.js'
import AppShell from '../components/AppShell'
import Icon from '../components/Icon'
import Alertas from '../pacientes/Alertas.jsx'
import EditarPaciente from '../pacientes/EditarPaciente.jsx'
import { dataLonga, desdeLongo, enderecoEmLinhas, formatarCpf, formatarTelefone, idade, iniciais } from '../pacientes/formatar.js'
import { useSessao } from '../sessao/sessao-contexto.js'

const ABAS = ['Dados Pessoais', 'Histórico', 'Documentos', 'Financeiro']
const NAO_INFORMADO = 'Não informado'

// Dados, endereço e alertas vêm da API. Histórico e Resumo clínico chegam com a agenda; Documentos e Financeiro
// ficam fora do escopo e aparecem como "em breve".
export default function PerfilPaciente() {
  const { pacienteId } = useParams()
  const { usuario } = useSessao()
  const [resposta, setResposta] = useState({ chave: null })
  const [aba, setAba] = useState('Dados Pessoais')
  const [editando, setEditando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  // D10 e docs/api.md: só a recepção edita o cadastro.
  const podeEditar = usuario.categoria === 'RECEPCIONISTA'

  const buscar = useCallback(() => api.pedir(`/api/pacientes/${pacienteId}`), [pacienteId])

  // A resposta guarda a que paciente pertence; enquanto não for a do atual, a tela está carregando.
  const chave = `${pacienteId}|${tentativa}`
  useEffect(() => {
    let atual = true
    const dono = `${pacienteId}|${tentativa}`
    buscar().then(
      (paciente) => atual && setResposta({ chave: dono, paciente }),
      (falha) => atual && setResposta({ chave: dono, erro: mensagemDoErro(falha), codigo: falha.codigo }),
    )
    return () => {
      atual = false
    }
  }, [buscar, pacienteId, tentativa])

  const atualizar = useCallback(async () => {
    const atualizado = await buscar()
    setResposta({ chave: `${pacienteId}|${tentativa}`, paciente: atualizado })
  }, [buscar, pacienteId, tentativa])
  const paciente = resposta.paciente
  const estado = resposta.chave !== chave ? 'carregando' : paciente ? 'pronto' : resposta.codigo === 'NAO_ENCONTRADO' ? 'nao-encontrado' : 'erro'
  const erro = resposta.erro ?? ''
  const fecharEdicao = useCallback(() => setEditando(false), [])

  if (estado !== 'pronto') {
    return (
      <AppShell title="DentAgenda" wide>
        <section className="tab-placeholder">
          {estado === 'carregando' && <p className="form-info">Carregando…</p>}
          {estado === 'nao-encontrado' && <><h2>Paciente não encontrado</h2><p>Esse cadastro não existe ou foi removido.</p><Link className="primary-btn primary-btn--solid" to="/pacientes">Voltar para Pacientes</Link></>}
          {estado === 'erro' && <><p className="form-error" role="alert">{erro}</p><button className="soft-btn" onClick={() => setTentativa(tentativa + 1)}>Tentar de novo</button></>}
        </section>
      </AppShell>
    )
  }

  const enderecoLinhas = enderecoEmLinhas(paciente.endereco)
  return (
    <AppShell title="DentAgenda" wide>
      <nav className="breadcrumb" aria-label="Caminho"><Link to="/pacientes">Pacientes</Link> / {paciente.nome}</nav>
      <section className="patient-hero">
        <div className="avatar avatar--patient avatar--initials" aria-hidden="true">{iniciais(paciente.nome)}</div>
        <div className="patient-hero__name"><h1>{paciente.nome}</h1><p>Paciente desde {desdeLongo(paciente.pacienteDesde)}</p></div>
        <div className="patient-actions">
          <a className="soft-btn" href={`tel:+55${paciente.telefone}`}><Icon name="phone" /> Ligar</a>
          <a className="soft-btn soft-btn--green" href={`https://wa.me/55${paciente.telefone}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" /> WhatsApp</a>
          <Link className="primary-btn primary-btn--solid" to="/agenda"><Icon name="calendar" /> Agendar Consulta</Link>
        </div>
      </section>

      <div className="tabs" role="tablist">
        {ABAS.map((nome) => <button role="tab" aria-selected={aba === nome} className={aba === nome ? 'active' : ''} key={nome} onClick={() => setAba(nome)}>{nome}</button>)}
      </div>

      {aba === 'Dados Pessoais' ? (
        <div className="patient-grid">
          <div className="patient-main">
            <section className="info-card">
              <div className="section-heading">
                <h2>Informações Gerais</h2>
                {podeEditar && <button className="text-button" onClick={() => setEditando(true)}><Icon name="edit" size={14} /> Editar</button>}
              </div>
              <div className="info-grid">
                <Info icon="phone" label="TELEFONE" value={formatarTelefone(paciente.telefone)} />
                <Info icon="mail" label="E-MAIL" value={paciente.email ?? NAO_INFORMADO} />
                <Info icon="id" label="CPF" value={formatarCpf(paciente.cpf)} />
                <Info icon="calendar" label="DATA DE NASCIMENTO" value={paciente.nascimento ? `${dataLonga(paciente.nascimento)} (${idade(paciente.nascimento)} anos)` : NAO_INFORMADO} />
                <Info icon="clipboard" label="CONVÊNIO" value={paciente.convenio ?? 'Particular'} />
                <Info icon="map" label="ENDEREÇO" value={enderecoLinhas.length > 0 ? enderecoLinhas : NAO_INFORMADO} />
              </div>
            </section>
          </div>
          <aside className="patient-side">
            <section className="info-card documents">
              <h2>Documentos</h2>
              <p className="documents__soon">Anexar e baixar arquivos<strong>Em breve</strong></p>
            </section>
            <Alertas pacienteId={paciente.id} />
          </aside>
        </div>
      ) : (
        <TabPlaceholder titulo={aba} />
      )}

      {editando && <EditarPaciente paciente={paciente} aoFechar={fecharEdicao} aoAtualizar={atualizar} />}
    </AppShell>
  )
}

function Info({ icon, label, value }) {
  const linhas = Array.isArray(value) ? value : [value]
  return (
    <div className="info-item">
      <span><Icon name={icon} /></span>
      <div><small>{label}</small>{linhas.map((linha) => <strong key={linha}>{linha}</strong>)}</div>
    </div>
  )
}

function TabPlaceholder({ titulo }) {
  return (
    <section className="tab-placeholder">
      <span><Icon name={titulo === 'Documentos' ? 'file' : titulo === 'Financeiro' ? 'report' : 'clipboard'} size={30} /></span>
      <h2>{titulo}</h2>
      <p>Em breve.</p>
    </section>
  )
}
