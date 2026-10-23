// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { ok, renderizarTela, simularApi, USUARIOS } from './testes/tela.jsx'
import Agenda from './pages/Agenda.jsx'
import Cadastro from './pages/Cadastro.jsx'
import DetalhesDaConsulta from './pages/DetalhesDaConsulta.jsx'
import Disponibilidade from './pages/Disponibilidade.jsx'
import Equipe from './pages/admin/Equipe.jsx'
import Inicio from './pages/Inicio.jsx'
import Login from './pages/Login.jsx'
import MarcarConsulta from './pages/MarcarConsulta.jsx'
import MinhasConsultas from './pages/MinhasConsultas.jsx'
import NovoPaciente from './pages/NovoPaciente.jsx'
import Pacientes from './pages/Pacientes.jsx'
import PerfilPaciente from './pages/PerfilPaciente.jsx'
import Procedimentos from './pages/admin/Procedimentos.jsx'
import RecuperarSenha from './pages/RecuperarSenha.jsx'

// #2 (D39): axe em cada tela, com dados. O jsdom não calcula cor nem layout, então contraste fica de fora daqui e é
// medido no navegador real (roteiro em docs/acessibilidade.md).
const REGRAS_SEM_LAYOUT = { 'color-contrast': { enabled: false } }

const paciente = { id: 'p-1', nome: 'Marcos Oliveira', cpf: '52998224725', telefone: '47987654321', email: 'marcos@email.com', nascimento: '1985-05-15', convenio: null, pacienteDesde: '2019-03-01', endereco: null, temLogin: true }
const consulta = {
  id: 'c-1',
  paciente: { id: 'p-1', nome: 'Marcos Oliveira' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: '2026-10-06T09:00:00-03:00',
  fim: '2026-10-06T10:00:00-03:00',
  status: 'CONFIRMADA',
  observacao: null,
  canceladoPor: null,
}
const limpeza = { id: 'proc-1', nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }
const API = {
  'GET /api/consultas': ok({ itens: [consulta], total: 1 }),
  'GET /api/consultas/pendentes': ok({ itens: [], total: 0 }),
  'GET /api/consultas/c-1': ok(consulta),
  'GET /api/consultas/c-1/observacao/historico': ok([]),
  'GET /api/pacientes': ok({ itens: [{ id: 'p-1', nome: 'Marcos Oliveira', cpf: '52998224725', telefone: '47987654321' }], total: 1 }),
  'GET /api/pacientes/p-1': ok(paciente),
  'GET /api/pacientes/p-1/alertas': ok([]),
  'GET /api/procedimentos': ok([limpeza]),
  'GET /api/dentistas': ok([{ id: 'dentista-1', nome: 'Ana Costa' }]),
  'GET /api/dentistas/dentista-1/grade': ok([{ diaSemana: 1, inicio: '08:00', fim: '12:00' }]),
  'GET /api/dentistas/dentista-1/bloqueios': ok([]),
  'GET /api/funcionarios': ok([{ id: 'f-1', nome: 'Ana Costa', cpf: '52998224725', email: 'ana@colzani.com.br', categoria: 'DENTISTA', cro: 'SP-1', dataInicio: '2026-01-01', isAdmin: false, ativo: true }]),
}

const TELAS = [
  { nome: 'Login', elemento: <Login />, caminho: '/login', pronta: 'Entrar' },
  { nome: 'Cadastro', elemento: <Cadastro />, caminho: '/cadastro' },
  { nome: 'Recuperar senha', elemento: <RecuperarSenha />, caminho: '/recuperar-senha' },
  { nome: 'Início', elemento: <Inicio />, caminho: '/inicio', pronta: 'Limpeza' },
  { nome: 'Pacientes', elemento: <Pacientes />, caminho: '/pacientes', pronta: '529.982.247-25' },
  { nome: 'Novo paciente', elemento: <NovoPaciente />, caminho: '/pacientes/novo' },
  { nome: 'Perfil do paciente', elemento: <PerfilPaciente />, caminho: '/pacientes/p-1', rota: '/pacientes/:pacienteId', pronta: 'Informações Gerais' },
  { nome: 'Novo agendamento', elemento: <Agenda />, caminho: '/agenda?pacienteId=p-1', rota: '/agenda', pronta: 'Marcos Oliveira' },
  { nome: 'Detalhes da consulta', elemento: <DetalhesDaConsulta />, caminho: '/consultas/c-1', rota: '/consultas/:consultaId', pronta: 'Ações' },
  { nome: 'Disponibilidade', elemento: <Disponibilidade />, caminho: '/disponibilidade', usuario: USUARIOS.admin, pronta: 'Salvar grade' },
  { nome: 'Equipe', elemento: <Equipe />, caminho: '/admin/equipe', usuario: USUARIOS.admin, pronta: 'ana@colzani.com.br' },
  { nome: 'Procedimentos', elemento: <Procedimentos />, caminho: '/admin/procedimentos', usuario: USUARIOS.admin, pronta: '60 min · R$ 180,00' },
  { nome: 'Minhas consultas', elemento: <MinhasConsultas />, caminho: '/minha-conta', usuario: USUARIOS.paciente, pronta: 'Próximas consultas' },
  { nome: 'Marcar consulta', elemento: <MarcarConsulta />, caminho: '/minha-conta/agendar', usuario: USUARIOS.paciente, pronta: 'O que você precisa?' },
]

describe('acessibilidade das telas com axe (#2)', () => {
  it.each(TELAS)('$nome', async ({ elemento, caminho, rota, usuario, pronta }) => {
    simularApi(API)
    const { container } = renderizarTela(elemento, { caminho, rota, usuario })
    if (pronta) await screen.findAllByText(pronta, { exact: false })

    const { violations } = await axe.run(container, { rules: REGRAS_SEM_LAYOUT })

    expect(violations.map((violacao) => `${violacao.id}: ${violacao.nodes.map((no) => no.target.join(' ')).join(', ')}`)).toEqual([])
  })
})
