// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import MinhasConsultas from './MinhasConsultas.jsx'

// Segunda, 2026-10-05, 09:00 em São Paulo.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00Z') }))
afterEach(() => vi.useRealTimers())

const consulta = (id, inicio, status = 'CONFIRMADA', extra = {}) => ({
  id,
  inicio,
  fim: inicio.replace(/T(\d{2})/, (_, hora) => `T${String(Number(hora) + 1).padStart(2, '0')}`),
  status,
  paciente: { id: 'paciente-1', nome: 'Marcos Oliveira' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  canceladoPor: null,
  ...extra,
})
const amanha = consulta('amanha', '2026-10-06T10:00:00-03:00')
const hojeAsTres = consulta('hoje', '2026-10-05T15:00:00-03:00')
const realizada = consulta('realizada', '2026-09-01T09:00:00-03:00', 'REALIZADA')
const cancelada = consulta('cancelada', '2026-09-10T09:00:00-03:00', 'CANCELADA', { canceladoPor: 'CLINICA' })

const PROXIMAS = 'GET /api/consultas?status=CONFIRMADA&de=2026-10-05&porPagina=100'
const TODAS = 'GET /api/consultas?porPagina=100'
const lista = (itens) => ok({ itens, total: itens.length })
const abrir = () => renderizarTela(<MinhasConsultas />, { usuario: USUARIOS.paciente, caminho: '/minha-conta' })
const itemDe = (texto) => screen.getByText(texto).closest('li')

describe('Minhas consultas (D35)', () => {
  it('mostra as próximas com botão de cancelar e o histórico sem as próximas, do mais novo ao mais antigo', async () => {
    simularApi({ [PROXIMAS]: lista([hojeAsTres, amanha]), [TODAS]: lista([realizada, cancelada, hojeAsTres, amanha]) })

    abrir()

    const proximas = await screen.findByRole('region', { name: 'Próximas consultas' })
    expect(within(proximas).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('05/10/2026 às 15:00'),
      expect.stringContaining('06/10/2026 às 10:00'),
    ])
    expect(within(proximas).getAllByRole('button', { name: /Cancelar/ })).toHaveLength(2)
    const historico = screen.getByRole('region', { name: 'Histórico' })
    expect(within(historico).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/10\/09\/2026.*Cancelada pela clínica/),
      expect.stringMatching(/01\/09\/2026.*Realizada/),
    ])
    expect(within(historico).queryByRole('button')).toBeNull()
  })

  it('sem consultas: estados vazios e o atalho para marcar', async () => {
    simularApi({ [PROXIMAS]: lista([]), [TODAS]: lista([]) })

    abrir()

    expect(await screen.findByText('Você não tem consultas marcadas.')).toBeTruthy()
    expect(screen.getByText('Nenhuma consulta anterior.')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('link', { name: /Marcar consulta/ })[0])
    expect(screen.getByText('Navegou para /minha-conta/agendar')).toBeTruthy()
  })

  it('cancela com mais de 24 h sem justificativa e recarrega as listas', async () => {
    let cancelou = false
    const pedidos = simularApi({
      [PROXIMAS]: () => lista(cancelou ? [] : [amanha]),
      [TODAS]: () => lista(cancelou ? [{ ...amanha, status: 'CANCELADA', canceladoPor: 'PACIENTE' }] : [amanha]),
      'POST /api/consultas/amanha/cancelamento': () => {
        cancelou = true
        return ok({ ...amanha, status: 'CANCELADA' })
      },
    })
    abrir()

    await userEvent.click(within(await screen.findByRole('region', { name: 'Próximas consultas' })).getByRole('button', { name: /Cancelar/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar consulta' })
    expect(within(dialogo).getByLabelText(/Justificativa/).required).toBe(false)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar consulta' }))

    expect(await screen.findByText('Consulta cancelada.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Você não tem consultas marcadas.')).toBeTruthy()
    expect(itemDe('Cancelada por você')).toBeTruthy()
  })

  it('com menos de 24 h a justificativa já abre obrigatória e vai no pedido', async () => {
    const pedidos = simularApi({
      [PROXIMAS]: lista([hojeAsTres]),
      [TODAS]: lista([hojeAsTres]),
      'POST /api/consultas/hoje/cancelamento': ok({ ...hojeAsTres, status: 'CANCELADA' }),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Cancelar/ }))
    const campo = screen.getByLabelText(/Justificativa/)
    expect(campo.required).toBe(true)
    expect(screen.getByText(/menos de 24 h/)).toBeTruthy()
    await userEvent.type(campo, 'Imprevisto no trabalho.')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar consulta' }))

    expect(await screen.findByText('Consulta cancelada.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({ justificativa: 'Imprevisto no trabalho.' })
  })

  it('erro da API no cancelamento aparece no popup, que continua aberto', async () => {
    simularApi({
      [PROXIMAS]: lista([amanha]),
      [TODAS]: lista([amanha]),
      'POST /api/consultas/amanha/cancelamento': falha(422, 'CONSULTA_JA_INICIADA', 'A consulta já começou.'),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Cancelar/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar consulta' }))

    expect((await screen.findByRole('alert')).textContent).toBe('A consulta já começou.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('erro ao carregar: mensagem e "Tentar de novo"', async () => {
    let tentativas = 0
    simularApi({
      [PROXIMAS]: () => (++tentativas === 1 ? falha(500, 'ERRO_INTERNO', 'Erro inesperado.') : lista([amanha])),
      [TODAS]: lista([amanha]),
    })
    abrir()

    expect((await screen.findByRole('alert')).textContent).toBe('Erro inesperado.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('06/10/2026 às 10:00')).toBeTruthy()
  })
})
