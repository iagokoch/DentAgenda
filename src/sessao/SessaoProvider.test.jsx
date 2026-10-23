// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { api } from '../api/api.js'
import { falha, ok, simularApi } from '../testes/tela.jsx'
import SessaoProvider from './SessaoProvider.jsx'
import { useSessao } from './sessao-contexto.js'

// #7: a sessão nasce do cookie de refresh (D19), e o fim dela pode vir do servidor a qualquer momento.
afterEach(() => api.definirToken(null))

function Painel() {
  const { estado, usuario, entrar, sair } = useSessao()
  return (
    <>
      <p>estado: {estado}</p>
      <p>usuario: {usuario?.nome ?? '—'}</p>
      <button type="button" onClick={() => entrar({ accessToken: 'token-do-login', usuario: { id: 'u', tipo: 'CLIENTE', nome: 'Júlia' } })}>Entrar</button>
      <button type="button" onClick={sair}>Sair</button>
      <button type="button" onClick={() => api.pedir('/api/auth/eu').catch(() => {})}>Pedir</button>
    </>
  )
}
const montar = () => render(<SessaoProvider><Painel /></SessaoProvider>)

describe('SessaoProvider', () => {
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
