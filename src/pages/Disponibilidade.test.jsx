// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Disponibilidade from './Disponibilidade.jsx'

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00Z') }))
afterEach(() => vi.useRealTimers())

const DENTISTAS = [{ id: 'dentista-1', nome: 'Ana Costa' }, { id: 'dentista-2', nome: 'Bruno Lima' }]
const GRADE_DA_ANA = [
  { diaSemana: 1, inicio: '08:00', fim: '12:00' },
  { diaSemana: 1, inicio: '14:00', fim: '18:00' },
]
const natal = { id: 'b-1', dentistaId: 'dentista-1', inicio: '2026-12-24T00:00:00-03:00', fim: '2026-12-26T00:00:00-03:00' }

function api(extras = {}) {
  return simularApi({
    'GET /api/dentistas': ok(DENTISTAS),
    'GET /api/dentistas/dentista-1/grade': ok(GRADE_DA_ANA),
    'GET /api/dentistas/dentista-2/grade': ok([]),
    'GET /api/dentistas/dentista-1/bloqueios': ok([natal]),
    'GET /api/dentistas/dentista-2/bloqueios': ok([]),
    ...extras,
  })
}
const abrir = (usuario) => renderizarTela(<Disponibilidade />, { usuario, caminho: '/disponibilidade' })
const secao = (nome) => screen.getByRole('region', { name: nome })

describe('Disponibilidade (D37)', () => {
  it('recepção: escolhe a dentista, vê a grade só para leitura e os bloqueios a partir de hoje', async () => {
    const pedidos = api()
    abrir(USUARIOS.recepcao)

    expect(await within(await screen.findByRole('region', { name: 'Grade semanal' })).findByText('08:00–12:00, 14:00–18:00')).toBeTruthy()
    expect(within(secao('Grade semanal')).queryByRole('button', { name: 'Salvar grade' })).toBeNull()
    expect(await within(secao('Bloqueios')).findByText('24/12/2026 às 00:00 até 26/12/2026 às 00:00')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.url.pathname.endsWith('/bloqueios')).url.search).toBe('?de=2026-10-05')

    await userEvent.selectOptions(screen.getByLabelText('Dentista'), 'dentista-2')
    expect(await within(secao('Grade semanal')).findByText('Sem grade: este dentista não tem horários livres.')).toBeTruthy()
  })

  it('admin edita a grade e vê as consultas que ficaram fora dela', async () => {
    const pedidos = api({
      'PUT /api/dentistas/dentista-1/grade': ({ corpo }) => ok({
        grade: corpo,
        consultasForaDaGrade: [{ id: 'c-1', inicio: '2026-10-12T15:00:00-03:00', fim: '2026-10-12T16:00:00-03:00', paciente: { id: 'p-1', nome: 'Marcos Oliveira' } }],
      }),
    })
    abrir(USUARIOS.admin)
    const grade = await screen.findByRole('region', { name: 'Grade semanal' })

    await userEvent.click(await within(grade).findByRole('button', { name: 'Remover faixa 14:00–18:00 de segunda' }))
    await userEvent.click(within(grade).getByRole('button', { name: 'Adicionar faixa na quarta' }))
    const fimDeQuarta = within(grade).getByLabelText('Fim da faixa 1 de quarta')
    await userEvent.clear(fimDeQuarta)
    await userEvent.type(fimDeQuarta, '11:00')
    await userEvent.click(within(grade).getByRole('button', { name: 'Salvar grade' }))

    expect(await within(grade).findByText(/ficaram fora da nova grade/)).toBeTruthy()
    expect(within(grade).getByRole('link', { name: /12\/10\/2026 às 15:00 — Marcos Oliveira/ }).getAttribute('href')).toBe('/consultas/c-1')
    expect(pedidos.find((pedido) => pedido.metodo === 'PUT').corpo).toEqual([
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 3, inicio: '08:00', fim: '11:00' },
    ])
  })

  it('admin: erro de regra da grade (FAIXAS_SOBREPOSTAS) aparece e a edição continua', async () => {
    api({ 'PUT /api/dentistas/dentista-1/grade': falha(422, 'FAIXAS_SOBREPOSTAS', 'Há faixas sobrepostas no mesmo dia.') })
    abrir(USUARIOS.admin)
    const grade = await screen.findByRole('region', { name: 'Grade semanal' })

    await userEvent.click(await within(grade).findByRole('button', { name: 'Adicionar faixa na segunda' }))
    await userEvent.click(within(grade).getByRole('button', { name: 'Salvar grade' }))

    expect((await within(grade).findByRole('alert')).textContent).toBe('Há faixas sobrepostas no mesmo dia.')
    expect(within(grade).getByLabelText('Início da faixa 3 de segunda')).toBeTruthy()
  })

  it('recepção cria bloqueio em lote com o fuso da clínica', async () => {
    const pedidos = api({ 'POST /api/bloqueios': ({ corpo }) => ok(corpo.dentistaIds.map((dentistaId, indice) => ({ id: `novo-${indice}`, dentistaId, inicio: corpo.inicio, fim: corpo.fim })), 201) })
    abrir(USUARIOS.recepcao)
    const bloqueios = await screen.findByRole('region', { name: 'Bloqueios' })

    await userEvent.type(within(bloqueios).getByLabelText('Início do bloqueio'), '2026-12-31T08:00')
    await userEvent.type(within(bloqueios).getByLabelText('Fim do bloqueio'), '2026-12-31T18:00')
    expect(within(bloqueios).getByRole('checkbox', { name: 'Ana Costa' }).checked).toBe(true)
    await userEvent.click(within(bloqueios).getByRole('checkbox', { name: 'Bruno Lima' }))
    await userEvent.click(within(bloqueios).getByRole('button', { name: 'Bloquear' }))

    expect(await within(bloqueios).findByText('Bloqueio criado para 2 dentistas.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({
      dentistaIds: ['dentista-1', 'dentista-2'],
      inicio: '2026-12-31T08:00:00-03:00',
      fim: '2026-12-31T18:00:00-03:00',
    })
  })

  it('bloqueio com consulta no período (409 CONSULTAS_NO_PERIODO) lista as consultas', async () => {
    api({
      'POST /api/bloqueios': {
        status: 409,
        corpo: { erro: { codigo: 'CONSULTAS_NO_PERIODO', mensagem: 'Há consultas confirmadas nesse período. Resolva-as antes de bloquear.', consultas: [{ id: 'c-9', dentistaId: 'dentista-1', inicio: '2026-12-31T09:00:00-03:00', paciente: { id: 'p-1', nome: 'Marcos Oliveira' } }] } },
      },
    })
    abrir(USUARIOS.recepcao)
    const bloqueios = await screen.findByRole('region', { name: 'Bloqueios' })

    await userEvent.type(within(bloqueios).getByLabelText('Início do bloqueio'), '2026-12-31T08:00')
    await userEvent.type(within(bloqueios).getByLabelText('Fim do bloqueio'), '2026-12-31T18:00')
    await userEvent.click(within(bloqueios).getByRole('button', { name: 'Bloquear' }))

    expect((await within(bloqueios).findByRole('alert')).textContent).toContain('Há consultas confirmadas nesse período.')
    expect(within(bloqueios).getByRole('link', { name: /31\/12\/2026 às 09:00 — Marcos Oliveira \(Ana Costa\)/ }).getAttribute('href')).toBe('/consultas/c-9')
  })

  it('remove um bloqueio', async () => {
    let removido = false
    const pedidos = api({
      'GET /api/dentistas/dentista-1/bloqueios': () => ok(removido ? [] : [natal]),
      'DELETE /api/bloqueios/b-1': () => {
        removido = true
        return ok(null, 204)
      },
    })
    abrir(USUARIOS.recepcao)

    await userEvent.click(await screen.findByRole('button', { name: 'Remover bloqueio de 24/12/2026 às 00:00 até 26/12/2026 às 00:00' }))

    expect(await screen.findByText('Nenhum bloqueio de hoje em diante.')).toBeTruthy()
    expect(pedidos.some((pedido) => pedido.metodo === 'DELETE')).toBe(true)
  })

  it('dentista: só a própria agenda, sem escolher dentista nem marcar outros no bloqueio', async () => {
    const pedidos = api({ 'POST /api/bloqueios': ({ corpo }) => ok([{ id: 'novo', dentistaId: corpo.dentistaIds[0], inicio: corpo.inicio, fim: corpo.fim }], 201) })
    abrir({ ...USUARIOS.dentista, id: 'dentista-1' })
    const bloqueios = await screen.findByRole('region', { name: 'Bloqueios' })

    expect(screen.queryByLabelText('Dentista')).toBeNull()
    expect(within(bloqueios).queryByRole('checkbox')).toBeNull()
    await userEvent.type(within(bloqueios).getByLabelText('Início do bloqueio'), '2026-11-02T08:00')
    await userEvent.type(within(bloqueios).getByLabelText('Fim do bloqueio'), '2026-11-02T12:00')
    await userEvent.click(within(bloqueios).getByRole('button', { name: 'Bloquear' }))

    expect(await within(bloqueios).findByText('Bloqueio criado.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo.dentistaIds).toEqual(['dentista-1'])
    expect(pedidos.some((pedido) => pedido.url.pathname.includes('dentista-2'))).toBe(false)
  })
})
