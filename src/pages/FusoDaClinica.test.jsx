// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import GavetaDeFuncionario from '../admin/GavetaDeFuncionario.jsx'
import Bloqueios from '../disponibilidade/Bloqueios.jsx'
import { ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Agenda from './Agenda.jsx'
import Inicio from './Inicio.jsx'
import MarcarConsulta from './MarcarConsulta.jsx'
import MinhasConsultas from './MinhasConsultas.jsx'

const VIRADA_UTC = new Date('2026-12-01T00:30:00Z')
const limpeza = { id: 'proc-1', nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }

describe('datas da clínica independem do fuso do navegador (#21)', () => {
  it.each([
    ['clínica', Agenda, USUARIOS.recepcao, '/agenda'],
    ['paciente', MarcarConsulta, USUARIOS.paciente, '/minha-conta/agendar'],
  ])('calendário da %s começa em novembro e permite voltar após avançar', async (_, Tela, usuario, caminho) => {
    const pedidos = simularApi({
      'GET /api/procedimentos': ok([limpeza]),
      'GET /api/dentistas': ok([]),
      'GET /api/dias-disponiveis': ({ url }) => ok({ dias: url.searchParams.get('mes') === '2026-11' ? ['2026-11-30'] : [] }),
      'GET /api/horarios-livres': ok({ horarios: [], janelasLivres: [] }),
    })
    renderizarTela(<Tela />, { usuario, caminho, agora: VIRADA_UTC })

    await userEvent.selectOptions(await screen.findByLabelText('Procedimento'), 'proc-1')
    await waitFor(() => expect(pedidos.find((pedido) => pedido.url.pathname === '/api/dias-disponiveis')?.url.searchParams.get('mes')).toBe('2026-11'))
    expect(screen.getByText('Novembro 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mês anterior' }).disabled).toBe(true)
    await userEvent.click(await screen.findByRole('button', { name: '30 de novembro de 2026' }))
    await waitFor(() => expect(pedidos.find((pedido) => pedido.url.pathname === '/api/horarios-livres')?.url.searchParams.get('data')).toBe('2026-11-30'))

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByText('Dezembro 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mês anterior' }).disabled).toBe(false)
    await waitFor(() => expect(pedidos.filter((pedido) => pedido.url.pathname === '/api/dias-disponiveis').at(-1)?.url.searchParams.get('mes')).toBe('2026-12'))
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByText('Novembro 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mês anterior' }).disabled).toBe(true)
  })

  it('Início busca as consultas de 30/11 enquanto o UTC já está em 01/12', async () => {
    const pedidos = simularApi({
      'GET /api/consultas': ok({ itens: [], total: 0 }),
      'GET /api/pacientes': ok({ itens: [], total: 0 }),
      'GET /api/consultas/pendentes': ok({ itens: [], total: 0 }),
    })
    renderizarTela(<Inicio />, { usuario: USUARIOS.recepcao, agora: VIRADA_UTC })

    await screen.findByText('Nenhuma consulta restante hoje')
    const consulta = pedidos.find((pedido) => pedido.url.pathname === '/api/consultas')
    expect(Object.fromEntries(consulta.url.searchParams)).toMatchObject({ de: '2026-11-30', ate: '2026-11-30' })
  })

  it('próximas consultas do paciente começam no dia vigente na clínica', async () => {
    const pedidos = simularApi({ 'GET /api/consultas': ok({ itens: [], total: 0 }) })
    renderizarTela(<MinhasConsultas />, { usuario: USUARIOS.paciente, agora: VIRADA_UTC })

    await screen.findByText('Você não tem consultas marcadas.')
    const proximas = pedidos.find((pedido) => pedido.url.searchParams.get('status') === 'CONFIRMADA')
    expect(proximas.url.searchParams.get('de')).toBe('2026-11-30')
  })

  it('bloqueios de hoje em diante usam o dia da clínica', async () => {
    const pedidos = simularApi({ 'GET /api/dentistas/dentista-1/bloqueios': ok([]) })
    renderizarTela(<Bloqueios dentistaId="dentista-1" dentistas={[]} />, { usuario: USUARIOS.dentista, agora: VIRADA_UTC })

    await screen.findByText('Nenhum bloqueio de hoje em diante.')
    expect(pedidos[0].url.searchParams.get('de')).toBe('2026-11-30')
  })

  it('novo funcionário recebe como início o dia da clínica', () => {
    renderizarTela(<GavetaDeFuncionario aoSalvar={() => {}} aoFechar={() => {}} />, { usuario: USUARIOS.admin, agora: VIRADA_UTC })

    expect(screen.getByLabelText('Início na clínica').value).toBe('2026-11-30')
  })
})
