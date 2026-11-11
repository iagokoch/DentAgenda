// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { falha, ok, renderizarTela, simularApi } from '../testes/tela.jsx'
import ConsultasPendentes from './ConsultasPendentes.jsx'

const consulta = (indice) => ({
  id: `c-${indice}`, paciente: { id: `p-${indice}`, nome: `Paciente ${indice}` },
  dentista: { id: 'd-1', nome: 'Ana Costa' },
  inicio: '2026-10-02T09:00:00-03:00', fim: '2026-10-02T10:00:00-03:00',
})

function LocalAtual() {
  const { pathname, search } = useLocation()
  return <output aria-label="URL atual">{pathname + search}</output>
}

const abrir = (query = '') => renderizarTela(<><ConsultasPendentes /><LocalAtual /></>, { caminho: `/consultas/pendentes${query}` })

function simularPaginas(quantidade) {
  const itens = Array.from({ length: quantidade }, (_, indice) => consulta(indice + 1))
  return simularApi({ 'GET /api/consultas/pendentes': ({ url }) => {
    const pagina = Number(url.searchParams.get('pagina'))
    return ok({ itens: itens.slice((pagina - 1) * 20, pagina * 20), total: itens.length })
  } })
}

describe('consultas pendentes (#34)', () => {
  it('pagina a lista inteira e preserva os dados necessários para localizar cada consulta', async () => {
    const pedidos = simularPaginas(41)
    abrir()

    const lista = await screen.findByRole('list', { name: 'Consultas pendentes' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('Mostrando 1–20 de 41 consultas')).toBeTruthy()
    expect(screen.getAllByText('02/10/2026 às 09:00–10:00')).toHaveLength(20)
    expect(screen.getAllByText('Ana Costa')).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Anterior' }).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByText('Paciente 21')
    expect(screen.queryByText('Paciente 1')).toBeNull()
    expect(screen.getByLabelText('URL atual').textContent).toBe('/consultas/pendentes?pagina=2')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('link', { name: /Ver consulta de Paciente 21 em/ }).getAttribute('href')).toBe('/consultas/c-21?origem=pendentes&pagina=2')
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByText('Paciente 41')
    expect(screen.getByRole('button', { name: 'Próxima' }).disabled).toBe(true)
    expect(screen.getByText('Mostrando 41–41 de 41 consultas')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await screen.findByText('Paciente 21')
    expect(pedidos.map(({ url }) => url.searchParams.get('pagina'))).toEqual(['1', '2', '3', '2'])
  })

  it('apresenta carregamento e depois lista vazia sem controles de paginação', async () => {
    const resposta = Promise.withResolvers()
    simularApi({ 'GET /api/consultas/pendentes': () => resposta.promise })
    abrir()
    expect(screen.getByText('Carregando consultas pendentes…')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    await act(async () => resposta.resolve(ok({ itens: [], total: 0 })))
    expect(await screen.findByText('Nenhuma consulta pendente de registro.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Próxima' })).toBeNull()
  })

  it('não mostra itens de outra página durante carregamento nem após erro e permite repetir', async () => {
    let falhar = true
    const resposta = Promise.withResolvers()
    simularApi({ 'GET /api/consultas/pendentes': ({ url }) => {
      if (url.searchParams.get('pagina') === '1') return ok({ itens: [consulta(1)], total: 21 })
      return falhar ? resposta.promise : ok({ itens: [consulta(21)], total: 21 })
    } })
    abrir()
    await screen.findByText('Paciente 1')
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(screen.queryByText('Paciente 1')).toBeNull()
    expect(screen.getByText('Carregando consultas pendentes…')).toBeTruthy()
    await act(async () => resposta.resolve(falha(403, 'SEM_PERMISSAO', 'Sem permissão.')))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sem permissão.')
    expect(screen.queryByRole('list')).toBeNull()
    falhar = false
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Paciente 21')).toBeTruthy()
  })

  it.each(['-1', '0', '1.5', 'texto', 'Infinity', '9007199254740992'])('normaliza pagina=%s para a primeira página', async (pagina) => {
    const pedidos = simularPaginas(1)
    abrir(`?pagina=${pagina}`)
    await screen.findByText('Paciente 1')
    expect(pedidos[0].url.searchParams.get('pagina')).toBe('1')
    expect(screen.getByRole('link', { name: /Ver consulta de Paciente 1 em/ }).getAttribute('href')).toContain('pagina=1')
  })

  it.each([0, 21])('recua da página 3 para a última válida quando o total cai para %i', async (total) => {
    const pedidos = simularPaginas(total)
    abrir('?pagina=3')
    await screen.findByText(total === 0 ? 'Nenhuma consulta pendente de registro.' : 'Paciente 21')
    const paginaEsperada = total === 0 ? '1' : '2'
    expect(screen.getByLabelText('URL atual').textContent).toBe(`/consultas/pendentes?pagina=${paginaEsperada}`)
    expect(pedidos.map(({ url }) => url.searchParams.get('pagina'))).toEqual(['3', paginaEsperada])
  })

  it('ignora resposta antiga após sair da página e recomeçar a leitura', async () => {
    const primeira = Promise.withResolvers()
    const pedidos = simularApi({ 'GET /api/consultas/pendentes': () => primeira.promise })
    const tela = abrir()
    await waitFor(() => expect(pedidos).toHaveLength(1))
    tela.unmount()
    simularPaginas(1)
    abrir()
    await screen.findByText('Paciente 1')
    await act(async () => primeira.resolve(ok({ itens: [consulta(99)], total: 1 })))
    expect(screen.queryByText('Paciente 99')).toBeNull()
    expect(screen.getByText('Paciente 1')).toBeTruthy()
  })
})
