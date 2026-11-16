// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Consultas from './Consultas.jsx'

const ana = { id: 'dentista-1', nome: 'Ana Costa' }
const carla = { id: 'dentista-2', nome: 'Carla Souza' }
const consulta = (id, dentista, inicio, fim, paciente, status = 'CONFIRMADA') => ({
  id, inicio, fim, status, dentista, paciente: { id: `p-${id}`, nome: paciente }, procedimento: { id: 'proc-1', nome: 'Limpeza' }, canceladoPor: null,
})
// "Agora" dos testes: segunda, 05/10/2026, 09:00 em São Paulo.
const passou = consulta('passou', ana, '2026-10-05T07:00:00-03:00', '2026-10-05T08:00:00-03:00', 'Marcos Oliveira')
const emAndamento = consulta('andamento', carla, '2026-10-05T08:30:00-03:00', '2026-10-05T09:30:00-03:00', 'Júlia Ferreira')
const depois = consulta('depois', ana, '2026-10-05T14:00:00-03:00', '2026-10-05T15:00:00-03:00', 'Rafael Tavares')
const lista = (itens) => ok({ itens, total: itens.length })
const DENTISTAS = ok([ana, carla])
const abrir = (usuario = USUARIOS.recepcao) => renderizarTela(<Consultas />, { usuario, caminho: '/consultas' })
const doDia = (pedidos) => pedidos.filter((pedido) => pedido.url.pathname === '/api/consultas' && pedido.metodo === 'GET')

describe('Consultas da clínica', () => {
  it('recepção vê o dia com uma coluna por dentista, inclusive quem não tem consulta', async () => {
    const pedidos = simularApi({ 'GET /api/dentistas': ok([ana, carla, { id: 'dentista-3', nome: 'Pedro Lacerda' }]), 'GET /api/consultas': lista([passou, emAndamento, depois]) })
    abrir()

    const colunaAna = await screen.findByRole('region', { name: 'Agenda de Ana Costa' })
    expect(within(colunaAna).getByText('Marcos Oliveira')).toBeTruthy()
    expect(within(colunaAna).getByText('Rafael Tavares')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Agenda de Carla Souza' })).getByText('Júlia Ferreira')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Agenda de Pedro Lacerda' })).getByText('Sem consultas')).toBeTruthy()
    const pedido = doDia(pedidos)[0]
    expect(Object.fromEntries(pedido.url.searchParams)).toMatchObject({ de: '2026-10-05', ate: '2026-10-05' })
  })

  it('destaca a consulta que passou sem registro e avisa quantas são', async () => {
    simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([passou, depois]) })
    abrir()

    expect(await screen.findByText('1 consulta já passou e aguarda registro.')).toBeTruthy()
    expect(screen.getAllByText('Passou, sem registro')).toHaveLength(1)
  })

  it('navega entre os dias e volta para hoje', async () => {
    const pedidos = simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([]) })
    abrir()
    await screen.findByText('segunda-feira, 5 de outubro')

    await userEvent.click(screen.getByRole('button', { name: 'Próximo dia' }))
    expect(await screen.findByText('terça-feira, 6 de outubro')).toBeTruthy()
    expect(doDia(pedidos).at(-1).url.searchParams.get('de')).toBe('2026-10-06')

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(await screen.findByText('segunda-feira, 5 de outubro')).toBeTruthy()
  })

  it('dentista vê "Minhas consultas", sem pedir a lista de dentistas e só com a própria coluna', async () => {
    const pedidos = simularApi({ 'GET /api/consultas': lista([passou, depois]) })
    abrir(USUARIOS.dentista)

    expect(await screen.findByRole('heading', { name: 'Minhas consultas', level: 1 })).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'Agenda de Ana Costa' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Agenda de Carla Souza' })).toBeNull()
    expect(pedidos.some((pedido) => pedido.url.pathname === '/api/dentistas')).toBe(false)
  })

  it('lista: filtra por dentista e status na API e por nome do paciente na tela', async () => {
    const pedidos = simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([passou, emAndamento, depois]) })
    abrir()
    await screen.findByRole('region', { name: 'Agenda de Ana Costa' })
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
    await screen.findByText('Marcos Oliveira')

    await userEvent.selectOptions(screen.getByLabelText('Dentista'), 'dentista-2')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'CONFIRMADA')
    await screen.findByText('Marcos Oliveira')
    const ultimo = Object.fromEntries(doDia(pedidos).at(-1).url.searchParams)
    expect(ultimo).toMatchObject({ dentistaId: 'dentista-2', status: 'CONFIRMADA', de: '2026-10-05', ate: '2026-11-04' })

    await userEvent.type(screen.getByLabelText('Paciente'), 'julia')
    expect(screen.getByText('Júlia Ferreira')).toBeTruthy()
    expect(screen.queryByText('Marcos Oliveira')).toBeNull()
  })

  it('lista do dentista não mostra o filtro de dentista', async () => {
    simularApi({ 'GET /api/consultas': lista([depois]) })
    abrir(USUARIOS.dentista)
    await userEvent.click(await screen.findByRole('button', { name: 'Lista' }))

    await screen.findByText('Rafael Tavares')
    expect(screen.queryByLabelText('Dentista')).toBeNull()
  })

  it('lista vazia mostra a mensagem do período', async () => {
    simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([]) })
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Lista' }))

    expect(await screen.findByText('Nenhuma consulta neste período.')).toBeTruthy()
  })

  it('marcar realizada só aparece depois do início e envia a realização', async () => {
    let atual = [passou, depois]
    const pedidos = simularApi({
      'GET /api/dentistas': DENTISTAS,
      'GET /api/consultas': () => lista(atual),
      'POST /api/consultas/passou/realizacao': () => { atual = [{ ...passou, status: 'REALIZADA' }, depois]; return ok(atual[0]) },
    })
    abrir()
    await screen.findByRole('region', { name: 'Agenda de Ana Costa' })

    expect(screen.queryByRole('button', { name: /Marcar como realizada: Rafael Tavares/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Marcar como realizada: Marcos Oliveira/ }))

    expect(await screen.findByText('Consulta marcada como realizada.')).toBeTruthy()
    expect(pedidos.some((pedido) => pedido.metodo === 'POST' && pedido.url.pathname === '/api/consultas/passou/realizacao')).toBe(true)
    expect(screen.queryByRole('button', { name: /Marcar como realizada: Marcos Oliveira/ })).toBeNull()
  })

  it('cancela pelo diálogo e recarrega as consultas', async () => {
    let atual = [depois]
    const pedidos = simularApi({
      'GET /api/dentistas': DENTISTAS,
      'GET /api/consultas': () => lista(atual),
      'POST /api/consultas/depois/cancelamento': () => { atual = [{ ...depois, status: 'CANCELADA' }]; return ok(atual[0]) },
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Cancelar: Rafael Tavares/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar consulta' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar consulta' }))

    expect(await screen.findByText('Consulta cancelada. O paciente foi avisado.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({})
    expect(screen.queryByRole('button', { name: /Cancelar: Rafael Tavares/ })).toBeNull()
    expect(screen.getByText('Cancelada')).toBeTruthy()
  })

  it('remarcar e detalhes levam às telas existentes', async () => {
    simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([depois]) })
    abrir()

    expect((await screen.findByRole('link', { name: /Remarcar: Rafael Tavares/ })).getAttribute('href')).toBe('/agenda?remarcar=depois')
    expect(screen.getByRole('link', { name: /Detalhes: Rafael Tavares/ }).getAttribute('href')).toBe('/consultas/depois')
  })

  it('erro ao carregar: mensagem e "Tentar de novo"', async () => {
    let falhou = true
    simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': () => (falhou ? falha(500, 'ERRO_INTERNO', 'Falha ao listar.') : lista([depois])) })
    abrir()

    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao listar.')
    falhou = false
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Rafael Tavares')).toBeTruthy()
  })

  it('sem violações de acessibilidade nas visões do dia e da lista', async () => {
    simularApi({ 'GET /api/dentistas': DENTISTAS, 'GET /api/consultas': lista([passou, emAndamento, depois]) })
    abrir()
    await screen.findByRole('region', { name: 'Agenda de Ana Costa' })
    expect((await axe.run(document.body)).violations).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
    await screen.findByText('Marcos Oliveira')
    expect((await axe.run(document.body)).violations).toEqual([])
  })
})
