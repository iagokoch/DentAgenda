// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarTela, USUARIOS } from '../testes/tela.jsx'
import AppShell from './AppShell.jsx'

describe('nomes da navegação compacta (#2)', () => {
  it.each([
    ['recepcao', ['Início', 'Agenda', 'Pacientes', 'Disponibilidade']],
    ['dentista', ['Início', 'Agenda', 'Pacientes', 'Disponibilidade']],
    ['admin', ['Início', 'Agenda', 'Pacientes', 'Disponibilidade', 'Equipe', 'Procedimentos']],
    ['paciente', ['Minhas consultas', 'Marcar consulta']],
  ])('preserva os nomes de links e Sair para %s quando o texto some', (papel, nomes) => {
    renderizarTela(<AppShell title="DentAgenda"><h1>Conteúdo</h1></AppShell>, { usuario: USUARIOS[papel] })
    const menu = screen.getByRole('complementary', { name: 'Menu lateral' })
    // O jsdom não aplica media queries: reproduz o display:none usado em 451–950px.
    menu.querySelectorAll('.nav-link span, .sidebar__sair span').forEach((texto) => {
      texto.style.display = 'none'
    })

    for (const nome of nomes) expect(within(menu).getByRole('link', { name: nome })).toBeTruthy()
    expect(within(menu).getByRole('button', { name: 'Sair' })).toBeTruthy()
  })
})
