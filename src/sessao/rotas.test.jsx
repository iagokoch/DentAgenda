// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderizarTela, USUARIOS } from '../testes/tela.jsx'
import { RotaProtegida } from './rotas.jsx'
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
