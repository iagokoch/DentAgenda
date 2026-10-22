// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderizarTela, USUARIOS } from '../testes/tela.jsx'
import { RotaProtegida, RotaPublica } from './rotas.jsx'
import { ehAdmin } from './sessao-contexto.js'

const abrir = (usuario, elemento) => renderizarTela(elemento, { usuario, caminho: '/admin/equipe' })
const telaDeAdmin = <RotaProtegida tipo="FUNCIONARIO" permitir={ehAdmin}><p>Tela de admin</p></RotaProtegida>

describe('RotaProtegida (D37)', () => {
  it('admin entra na tela de admin', () => {
    abrir(USUARIOS.admin, telaDeAdmin)
    expect(screen.getByText('Tela de admin')).toBeTruthy()
  })

  it('funcionário sem o papel volta para o Início', () => {
    abrir(USUARIOS.recepcao, telaDeAdmin)
    expect(screen.getByText('Navegou para /inicio')).toBeTruthy()
  })

  it('paciente numa tela da clínica vai para a área dele', () => {
    abrir(USUARIOS.paciente, telaDeAdmin)
    expect(screen.getByText('Navegou para /minha-conta')).toBeTruthy()
  })
})

describe('RotaProtegida sem sessão (#7)', () => {
  it('anônimo vai para o login', () => {
    renderizarTela(telaDeAdmin, { estado: 'anonimo', caminho: '/admin/equipe' })
    expect(screen.getByText('Navegou para /login')).toBeTruthy()
  })

  it('enquanto a sessão é restaurada pelo refresh, mostra "Carregando…" e não redireciona', () => {
    renderizarTela(telaDeAdmin, { estado: 'carregando', caminho: '/admin/equipe' })
    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(screen.queryByText(/Navegou para/)).toBeNull()
  })
})

describe('RotaPublica (#7)', () => {
  const login = <RotaPublica><p>Tela de login</p></RotaPublica>

  it('anônimo vê a tela pública', () => {
    renderizarTela(login, { estado: 'anonimo', caminho: '/login' })
    expect(screen.getByText('Tela de login')).toBeTruthy()
  })

  it('funcionário logado vai para o Início', () => {
    renderizarTela(login, { usuario: USUARIOS.dentista, caminho: '/login' })
    expect(screen.getByText('Navegou para /inicio')).toBeTruthy()
  })

  it('paciente logado vai para a área dele', () => {
    renderizarTela(login, { usuario: USUARIOS.paciente, caminho: '/login' })
    expect(screen.getByText('Navegou para /minha-conta')).toBeTruthy()
  })

  it('carregando: não mostra a tela pública nem redireciona', () => {
    renderizarTela(login, { estado: 'carregando', caminho: '/login' })
    expect(screen.queryByText('Tela de login')).toBeNull()
    expect(screen.getByText('Carregando…')).toBeTruthy()
  })
})
