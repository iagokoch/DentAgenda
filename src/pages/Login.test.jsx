// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/api.js'
import SessaoProvider from '../sessao/SessaoProvider.jsx'
import { RotaProtegida, RotaPublica } from '../sessao/rotas.jsx'
import { useSessao } from '../sessao/sessao-contexto.js'
import { falha, ok, simularApi, simularTravaEntreAbas, USUARIOS } from '../testes/tela.jsx'
import Login from './Login.jsx'

beforeEach(() => { localStorage.clear(); simularTravaEntreAbas() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); api.definirToken(null) })

function Inicio() {
  const { usuario, sair } = useSessao()
  return <><p>{usuario.nome}</p><button onClick={sair}>Sair</button></>
}

function montar() {
  return render(<SessaoProvider><MemoryRouter initialEntries={['/inicio']}><Routes>
    <Route path="/inicio" element={<RotaProtegida tipo="FUNCIONARIO"><Inicio /></RotaProtegida>} />
    <Route path="/login" element={<RotaPublica><Login /></RotaPublica>} />
  </Routes></MemoryRouter></SessaoProvider>)
}

describe('aviso de saída no login', () => {
  it('login explícito remove o marcador e inicia uma sessão nova', async () => {
    localStorage.setItem('dentagenda_saida_local', 'confirmada')
    const pedidos = simularApi({
      'POST /api/auth/funcionario/login': ok({ accessToken: 'token-da-nova-sessao', usuario: USUARIOS.recepcao }),
    })
    montar()
    await screen.findByText('Sessão encerrada no servidor.')
    await userEvent.type(screen.getByLabelText(/CPF ou e-mail/), 'recepcao@exemplo.invalid')
    await userEvent.type(screen.getByLabelText(/^Senha$/), 'senha-ficticia-de-teste')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Carla Souza')
    expect(localStorage.getItem('dentagenda_saida_local')).toBeNull()
    expect(pedidos.map((pedido) => pedido.caminho)).toEqual(['/api/auth/funcionario/login'])
  })

  it('informa falha e confirma retry sem reapresentar usuário nem instalar token', async () => {
    let falhar = true
    const pedidos = simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'token-ficticio' }),
      'GET /api/auth/eu': ok({ usuario: USUARIOS.recepcao }),
      'POST /api/auth/logout': () => falhar ? falha(500, 'ERRO_INTERNO') : ok(null, 204),
    })
    const tela = montar()
    await screen.findByText('Carla Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await screen.findByText('Seus dados estão ocultos neste navegador. Tente novamente.')
    expect(screen.getByText('Não foi possível confirmar sua saída')).toBeTruthy()
    expect(screen.queryByText('Carla Souza')).toBeNull()
    expect(api.temToken()).toBe(false)
    tela.unmount()
    const antesDaRecarga = pedidos.length
    montar()
    await screen.findByRole('button', { name: 'Tentar encerrar novamente' })
    expect(pedidos).toHaveLength(antesDaRecarga)
    falhar = false
    await userEvent.click(screen.getByRole('button', { name: 'Tentar encerrar novamente' }))
    await screen.findByText('Sessão encerrada no servidor.')
    expect(pedidos.filter((pedido) => pedido.caminho === '/api/auth/eu')).toHaveLength(1)
    expect(api.temToken()).toBe(false)
    expect(screen.getByRole('button', { name: 'Entrar' }).disabled).toBe(false)
  })

  it('mantém login desabilitado enquanto confirma a revogação', async () => {
    const resposta = Promise.withResolvers()
    simularApi({
      'POST /api/auth/refresh': ok({ accessToken: 'token-ficticio' }),
      'GET /api/auth/eu': ok({ usuario: USUARIOS.recepcao }),
      'POST /api/auth/logout': () => resposta.promise,
    })
    montar()
    await screen.findByText('Carla Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await screen.findByText('Encerrando sessão…')
    const desabilitado = screen.getByRole('button', { name: 'Entrar' }).disabled
    await act(async () => resposta.resolve(ok(null, 204)))
    expect(desabilitado).toBe(true)
    await screen.findByText('Sessão encerrada no servidor.')
  })
});
