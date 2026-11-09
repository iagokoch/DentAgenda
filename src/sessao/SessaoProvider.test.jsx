// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/api.js'
import { falha, ok, simularApi, simularTravaEntreAbas } from '../testes/tela.jsx'
import SessaoProvider from './SessaoProvider.jsx'
import { useSessao } from './sessao-contexto.js'

// #7: a sessão nasce do cookie de refresh (D19), e o fim dela pode vir do servidor a qualquer momento.
const CHAVE_DA_SAIDA = 'dentagenda_saida_local'
beforeEach(() => { localStorage.clear(); simularTravaEntreAbas() })
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  api.definirToken(null)
})

function Painel() {
  const { estado, usuario, entrar, sair, saida } = useSessao()
  return (
    <>
      <p>estado: {estado}</p>
      <p>usuario: {usuario?.nome ?? '—'}</p>
      <p>saida: {saida ?? 'nenhuma'}</p>
      <button type="button" onClick={() => entrar({ accessToken: 'token-do-login', usuario: { id: 'u', tipo: 'CLIENTE', nome: 'Júlia' } })}>Entrar</button>
      <button type="button" onClick={sair}>Sair</button>
      <button type="button" onClick={() => api.pedir('/api/auth/eu').catch(() => {})}>Pedir</button>
    </>
  )
}
const montar = () => render(<SessaoProvider><Painel /></SessaoProvider>)

describe('SessaoProvider', () => {
  it('oculta usuário e token imediatamente, antes da resposta do logout', async () => {
    const resposta = Promise.withResolvers()
    simularApi({ 'POST /api/auth/refresh': falha(401, 'NAO_AUTENTICADO'), 'POST /api/auth/logout': () => resposta.promise })
    montar()
    await screen.findByText('estado: anonimo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    const ocultou = screen.queryByText('usuario: Júlia') === null
    const limpouToken = !api.temToken()
    await act(async () => resposta.resolve(falha(500, 'ERRO_INTERNO')))
    expect(ocultou).toBe(true)
    expect(limpouToken).toBe(true)
    expect(await screen.findByText('saida: pendente')).toBeTruthy()
  })

  it.each(['rede', '500'])('falha de %s persiste apenas marcador e bloqueia restauração após recarga', async (falhaDe) => {
    simularApi({
      'POST /api/auth/refresh': falha(401, 'NAO_AUTENTICADO'),
      'POST /api/auth/logout': () => {
        if (falhaDe === 'rede') throw new TypeError('offline')
        return falha(500, 'ERRO_INTERNO')
      },
    })
    const tela = montar()
    await screen.findByText('estado: anonimo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await screen.findByText('saida: pendente')
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem(CHAVE_DA_SAIDA)).toBe('pendente')
    tela.unmount()
    const pedidos = simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'somente-para-revogar' }),
      'POST /api/auth/logout': ok(null, 204),
    })
    montar()
    await screen.findByText('estado: anonimo')
    expect(pedidos).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await screen.findByText('saida: confirmada')
    expect(pedidos.map((pedido) => pedido.caminho)).toEqual(['/api/auth/refresh', '/api/auth/logout'])
    expect(localStorage.getItem(CHAVE_DA_SAIDA)).toBe('confirmada')
    expect(api.temToken()).toBe(false)
  })

  it('/eu atrasado não substitui uma entrada explícita depois de sair', async () => {
    const resposta = Promise.withResolvers()
    const pedidos = simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'token-restaurado' }),
      'GET /api/auth/eu': () => resposta.promise,
      'POST /api/auth/logout': ok(null, 204),
    })
    montar()
    await waitFor(() => expect(pedidos.some((pedido) => pedido.caminho === '/api/auth/eu')).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await screen.findByText('saida: confirmada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await act(async () => resposta.resolve(ok({ usuario: { id: 'antiga', nome: 'Conta antiga', tipo: 'CLIENTE' } })))
    expect(screen.getByText('usuario: Júlia')).toBeTruthy()
    expect(screen.getByText('estado: logado')).toBeTruthy()
    expect(localStorage.getItem(CHAVE_DA_SAIDA)).toBeNull()
  })

  it('marcador de outra aba encerra a apresentação local sem fazer refresh', async () => {
    const pedidos = simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'token-restaurado' }),
      'GET /api/auth/eu': ok({ usuario: { id: 'u', nome: 'Carla', tipo: 'CLIENTE' } }),
    })
    montar()
    await screen.findByText('estado: logado')
    localStorage.setItem(CHAVE_DA_SAIDA, 'pendente')
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: CHAVE_DA_SAIDA, newValue: 'pendente' })))
    expect(screen.getByText('estado: anonimo')).toBeTruthy()
    expect(api.temToken()).toBe(false)
    expect(await api.renovarSessao()).toBe(false)
    expect(pedidos).toHaveLength(2)
  })

  it('armazenamento indisponível bloqueia restauração automática', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('indisponível') })
    const pedidos = simularApi({ 'POST /api/auth/refresh': ok({ accessToken: 'nao-restaurar' }) })
    montar()
    await screen.findByText('estado: anonimo')
    expect(pedidos).toHaveLength(0)
    expect(screen.getByText('saida: pendente')).toBeTruthy()
  })

  it('armazenamento que permite leitura mas recusa gravação também bloqueia restauração', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('sem espaço') })
    const pedidos = simularApi({ 'POST /api/auth/refresh': ok({ accessToken: 'nao-restaurar' }) })
    montar()
    await screen.findByText('estado: anonimo')
    expect(pedidos).toHaveLength(0)
    expect(screen.getByText('saida: pendente')).toBeTruthy()
  })

  it('restaura a sessão pelo cookie de refresh: carregando → logado com o usuário do /eu', async () => {
    const pedidos = simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'token-novo' }),
      'GET /api/auth/eu': ok({ usuario: { id: 'f-1', tipo: 'FUNCIONARIO', nome: 'Carla Souza', categoria: 'RECEPCIONISTA', isAdmin: false } }),
    })

    montar()

    expect(screen.getByText('estado: carregando')).toBeTruthy()
    expect(await screen.findByText('estado: logado')).toBeTruthy()
    expect(screen.getByText('usuario: Carla Souza')).toBeTruthy()
    expect(pedidos[0]).toMatchObject({ metodo: 'POST', caminho: '/api/auth/refresh' })
  })

  it('sem cookie válido (refresh 401) fica anônimo, sem chamar o /eu', async () => {
    const pedidos = simularApi({ 'POST /api/auth/refresh': falha(401, 'NAO_AUTENTICADO') })

    montar()

    expect(await screen.findByText('estado: anonimo')).toBeTruthy()
    expect(pedidos.map((pedido) => pedido.caminho)).toEqual(['/api/auth/refresh'])
  })

  it('servidor fora do ar na abertura também fica anônimo, em vez de carregar para sempre', async () => {
    simularApi({ 'POST /api/auth/refresh': falha(502, 'ERRO_INTERNO') })

    montar()

    expect(await screen.findByText('estado: anonimo')).toBeTruthy()
  })

  it('entrar guarda o usuário; sair chama o logout e volta a anônimo', async () => {
    const pedidos = simularApi({ 'POST /api/auth/refresh': falha(401, 'NAO_AUTENTICADO'), 'POST /api/auth/logout': ok(null, 204) })
    montar()
    await screen.findByText('estado: anonimo')

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByText('usuario: Júlia')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByText('estado: anonimo')).toBeTruthy()
    expect(pedidos.at(-1)).toMatchObject({ metodo: 'POST', caminho: '/api/auth/logout' })
    expect(api.temToken()).toBe(false)
  })

  it('sessão derrubada no servidor (401 e refresh recusado) leva a tela a anônimo', async () => {
    let derrubada = false
    const recusar = () => falha(401, 'NAO_AUTENTICADO')
    simularApi({
      'POST /api/auth/refresh': () => (derrubada ? recusar() : ok({ accessToken: 'token-1' })),
      'GET /api/auth/eu': () => (derrubada ? recusar() : ok({ usuario: { id: 'c', tipo: 'CLIENTE', nome: 'Marcos' } })),
    })
    montar()
    await screen.findByText('estado: logado')
    derrubada = true

    await act(() => userEvent.click(screen.getByRole('button', { name: 'Pedir' })))

    expect(await screen.findByText('estado: anonimo')).toBeTruthy()
  })
})
