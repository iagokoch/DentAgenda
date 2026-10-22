// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import MarcarConsulta from './MarcarConsulta.jsx'

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00Z') }))
afterEach(() => vi.useRealTimers())

const limpeza = { id: 'proc-1', nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }
const marcada = {
  id: 'consulta-1',
  paciente: { id: 'paciente-1', nome: 'Marcos Oliveira' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: '2026-10-06T09:00:00-03:00',
  fim: '2026-10-06T10:00:00-03:00',
  status: 'CONFIRMADA',
}

function apiDoPaciente(post) {
  return simularApi({
    'GET /api/procedimentos': ok([limpeza]),
    'GET /api/dentistas': ok([{ id: 'dentista-1', nome: 'Ana Costa' }, { id: 'dentista-2', nome: 'Bruno Lima' }]),
    'GET /api/dias-disponiveis': ok({ dias: ['2026-10-06'] }),
    'GET /api/horarios-livres': ok({ horarios: [{ dentistaId: 'dentista-1', inicio: '2026-10-06T09:00:00-03:00' }] }),
    'POST /api/consultas': post,
  })
}

async function escolherLimpezaDia6As9() {
  renderizarTela(<MarcarConsulta />, { usuario: USUARIOS.paciente, caminho: '/minha-conta/agendar' })
  await userEvent.selectOptions(await screen.findByLabelText('Procedimento'), 'proc-1')
  expect(screen.getByText('180,00')).toBeTruthy()
  await userEvent.click(await screen.findByRole('button', { name: '6' }))
  await userEvent.click(await screen.findByRole('button', { name: '09:00' }))
}

describe('Marcar consulta pelo paciente (D35)', () => {
  it('marca sem mandar pacienteId (vem do token) e mostra a confirmação', async () => {
    const pedidos = apiDoPaciente(ok(marcada, 201))
    await escolherLimpezaDia6As9()
    expect(screen.getByText(/06\/10\/2026 às 09:00 • Limpeza • Ana Costa/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('heading', { name: /Consulta marcada/ })).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({
      dentistaId: 'dentista-1',
      procedimentoId: 'proc-1',
      inicio: '2026-10-06T09:00:00-03:00',
    })
    await userEvent.click(screen.getByRole('link', { name: 'Ver minhas consultas' }))
    expect(screen.getByText('Navegou para /minha-conta')).toBeTruthy()
  })

  it('escolher a dentista filtra as vagas por ela', async () => {
    const pedidos = apiDoPaciente(ok(marcada, 201))
    renderizarTela(<MarcarConsulta />, { usuario: USUARIOS.paciente, caminho: '/minha-conta/agendar' })

    await userEvent.selectOptions(await screen.findByLabelText('Procedimento'), 'proc-1')
    await userEvent.selectOptions(await screen.findByLabelText('Dentista'), 'dentista-2')
    await screen.findByRole('button', { name: '6' })

    const ultimaLeituraDeDias = pedidos.filter((pedido) => pedido.url.pathname === '/api/dias-disponiveis').at(-1)
    expect(ultimaLeituraDeDias.url.searchParams.get('dentistaId')).toBe('dentista-2')
  })

  it('409 de horário: mensagem de horário e vagas recarregadas', async () => {
    const pedidos = apiDoPaciente(falha(409, 'FORA_DO_PASSO'))
    await escolherLimpezaDia6As9()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Esse horário não é um dos oferecidos. Escolha outro horário.')).toBeTruthy()
    expect(pedidos.filter((pedido) => pedido.url.pathname === '/api/horarios-livres')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Confirmar' }).disabled).toBe(true)
  })

  it('outro erro da API (422): mostra a mensagem dela e mantém a escolha', async () => {
    apiDoPaciente(falha(422, 'HORARIO_NO_PASSADO', 'Esse horário já passou.'))
    await escolherLimpezaDia6As9()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Esse horário já passou.')
    expect(screen.getByRole('button', { name: 'Confirmar' }).disabled).toBe(false)
  })

  it('sem procedimentos ativos: avisa para falar com a clínica', async () => {
    simularApi({ 'GET /api/procedimentos': ok([]), 'GET /api/dentistas': ok([]) })

    renderizarTela(<MarcarConsulta />, { usuario: USUARIOS.paciente, caminho: '/minha-conta/agendar' })

    expect(await screen.findByText('Nenhum procedimento disponível para marcar. Fale com a clínica.')).toBeTruthy()
  })
})
