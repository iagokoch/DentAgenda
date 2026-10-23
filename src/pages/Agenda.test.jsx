// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Agenda from './Agenda.jsx'

const limpeza = { id: 'proc-1', nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }
const consultaMarcada = {
  id: 'consulta-1',
  paciente: { id: 'paciente-1', nome: 'Marcos Oliveira' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: '2026-10-06T09:00:00-03:00',
  fim: '2026-10-06T10:00:00-03:00',
  status: 'CONFIRMADA',
}

function apiDaAgenda(post) {
  return simularApi({
    'GET /api/pacientes/paciente-1': ok({ id: 'paciente-1', nome: 'Marcos Oliveira' }),
    'GET /api/procedimentos': ok([limpeza]),
    'GET /api/dentistas': ok([{ id: 'dentista-1', nome: 'Ana Costa' }]),
    'GET /api/dias-disponiveis': ok({ dias: ['2026-10-06'] }),
    'GET /api/horarios-livres': ok({ horarios: [{ dentistaId: 'dentista-1', inicio: '2026-10-06T09:00:00-03:00' }], janelasLivres: [] }),
    'POST /api/consultas': post,
  })
}

async function escolherLimpezaDia6As9() {
  renderizarTela(<Agenda />, { usuario: USUARIOS.recepcao, caminho: '/agenda?pacienteId=paciente-1', rota: '/agenda' })
  expect(await screen.findByText('Marcos Oliveira')).toBeTruthy()
  await userEvent.selectOptions(await screen.findByLabelText('Procedimento'), 'proc-1')
  await userEvent.click(await screen.findByRole('button', { name: '6 de outubro de 2026' }))
  await userEvent.click(await screen.findByRole('button', { name: '09:00' }))
}

describe('Novo Agendamento da recepção (D33)', () => {
  it('marca a consulta do paciente do link e mostra a confirmação', async () => {
    const pedidos = apiDaAgenda(ok(consultaMarcada, 201))
    await escolherLimpezaDia6As9()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar Agendamento' }))

    expect(await screen.findByRole('heading', { name: /Consulta marcada/ })).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({
      pacienteId: 'paciente-1',
      dentistaId: 'dentista-1',
      procedimentoId: 'proc-1',
      inicio: '2026-10-06T09:00:00-03:00',
    })
    const dias = pedidos.find((pedido) => pedido.url.pathname === '/api/dias-disponiveis')
    expect(Object.fromEntries(dias.url.searchParams)).toEqual({ procedimentoId: 'proc-1', mes: '2026-10' })
  })

  it('409 de horário: mostra a mensagem, limpa o horário e recarrega as vagas', async () => {
    const pedidos = apiDaAgenda(falha(409, 'HORARIO_INDISPONIVEL'))
    await escolherLimpezaDia6As9()
    const consultasDeHorario = () => pedidos.filter((pedido) => pedido.url.pathname === '/api/horarios-livres').length
    expect(consultasDeHorario()).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar Agendamento' }))

    const horarios = screen.getByRole('heading', { name: 'Horários Disponíveis' }).closest('section')
    expect((await within(horarios).findByRole('alert')).textContent).toBe('Esse horário acabou de ser ocupado. Escolha outro horário.')
    expect(consultasDeHorario()).toBe(2)
    expect(screen.getByRole('button', { name: 'Confirmar Agendamento' }).disabled).toBe(true)
  })
})
