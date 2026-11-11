// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { falha, ok, simularApi, USUARIOS } from './testes/tela.jsx'
import { SessaoContexto } from './sessao/sessao-contexto.js'
import App from './App.jsx'

const sessao = vi.hoisted(() => ({ atual: null }))
vi.mock('./sessao/SessaoProvider.jsx', () => ({
  default: ({ children }) => <SessaoContexto value={sessao.atual}>{children}</SessaoContexto>,
}))

beforeEach(() => {
  sessao.atual = { estado: 'logado', usuario: USUARIOS.recepcao, sair: vi.fn() }
})
afterEach(() => window.history.replaceState(null, '', '/'))

const consulta = {
  id: 'c-21', paciente: { id: 'p-1', nome: 'Paciente da segunda página' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' }, procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: '2026-10-02T09:00:00-03:00', fim: '2026-10-02T10:00:00-03:00',
  status: 'CONFIRMADA', observacao: null, versaoObservacao: 0, canceladoPor: null,
}

function abrir(caminho = '/consultas/pendentes?pagina=2') {
  window.history.replaceState(null, '', caminho)
  return render(<App />)
}

describe('rota de consultas pendentes (#34)', () => {
  it.each(['recepcao', 'dentista', 'admin'])('abre a lista para %s sem interpretar pendentes como ID', async (papel) => {
    sessao.atual.usuario = USUARIOS[papel]
    const pedidos = simularApi({ 'GET /api/consultas/pendentes': ok({ itens: [consulta], total: 21 }) })
    abrir()

    expect(await screen.findByRole('heading', { name: 'Consultas pendentes de registro' })).toBeTruthy()
    expect(await screen.findByText('Paciente da segunda página')).toBeTruthy()
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas/pendentes')).toHaveLength(1)
    expect(Object.fromEntries(pedidos[0].url.searchParams)).toEqual({ pagina: '2', porPagina: '20' })
  })

  it('impede acesso do paciente à lista da clínica', async () => {
    sessao.atual.usuario = USUARIOS.paciente
    const pedidos = simularApi({ 'GET /api/consultas': ok({ itens: [], total: 0 }) })
    abrir()

    await waitFor(() => expect(window.location.pathname).toBe('/minha-conta'))
    expect(pedidos.some(({ url }) => url.pathname === '/api/consultas/pendentes')).toBe(false)
  })

  it('encaminha anônimo ao login sem consultar as pendências', async () => {
    sessao.atual = { estado: 'anonimo', usuario: null }
    const pedidos = simularApi({})
    abrir()

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(pedidos).toHaveLength(0)
  })

  it('refaz a leitura após realizar a última consulta da página e atualiza o lembrete', async () => {
    let realizada = false
    const pedidos = simularApi({
      'GET /api/consultas/pendentes': ({ url }) => {
        if (url.searchParams.get('porPagina') === '1') return ok({ itens: [], total: realizada ? 20 : 21 })
        if (url.searchParams.get('pagina') === '2') return ok({ itens: realizada ? [] : [consulta], total: realizada ? 20 : 21 })
        return ok({ itens: [{ ...consulta, id: 'c-1', paciente: { id: 'p-2', nome: 'Outra pendência' } }], total: 20 })
      },
      'GET /api/consultas/c-21': () => ok({ ...consulta, status: realizada ? 'REALIZADA' : 'CONFIRMADA' }),
      'GET /api/consultas/c-21/observacao/historico': ok([]),
      'POST /api/consultas/c-21/realizacao': () => { realizada = true; return ok({ ...consulta, status: 'REALIZADA' }) },
      'GET /api/consultas': ok({ itens: [], total: 0 }),
      'GET /api/pacientes': ok({ itens: [], total: 1 }),
    })
    abrir()

    await userEvent.click(await screen.findByRole('link', { name: /Ver consulta.*Paciente da segunda página/ }))
    expect(window.location.search).toBe('?origem=pendentes&pagina=2')
    await userEvent.click(await screen.findByRole('button', { name: /Marcar como realizada/ }))
    await screen.findByText('Consulta marcada como realizada.')
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para pendências' }))
    expect(await screen.findByText('Outra pendência')).toBeTruthy()
    expect(window.location.search).toBe('?pagina=1')
    expect(screen.queryByText('Paciente da segunda página')).toBeNull()
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas/pendentes' && url.searchParams.get('pagina') === '2')).toHaveLength(2)
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Caminho' })).getByRole('link', { name: 'Início' }))
    expect(await screen.findByText('20 consultas já passaram e ainda não foram marcadas como realizadas.')).toBeTruthy()
  })

  it('oferece retorno à lista mesmo se a consulta não puder ser aberta', async () => {
    simularApi({ 'GET /api/consultas/c-21': falha(404, 'NAO_ENCONTRADO', 'Consulta não encontrada.') })
    abrir('/consultas/c-21?origem=pendentes&pagina=2')
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Voltar para pendências' }).getAttribute('href')).toBe('/consultas/pendentes?pagina=2')
  })
})
