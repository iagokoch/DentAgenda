// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Inicio from './Inicio.jsx'

const consulta = (id, hora, status = 'CONFIRMADA', nome = 'Marcos Oliveira') => ({
  id,
  paciente: { id: `p-${id}`, nome },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: `2026-10-05T${hora}:00-03:00`,
  fim: `2026-10-05T${hora}:00-03:00`,
  status,
})

function api({ pendentes = 0 } = {}) {
  return simularApi({
    'GET /api/consultas': ok({ itens: [consulta('a', '08:00', 'REALIZADA'), consulta('b', '10:00', 'CONFIRMADA', 'Júlia Ramos'), consulta('c', '11:00', 'CANCELADA')], total: 3 }),
    'GET /api/pacientes': ok({ itens: [], total: 42 }),
    'GET /api/consultas/pendentes': ok({ itens: [], total: pendentes }),
  })
}
const cartao = (titulo) => screen.getByText(titulo).closest('article')

describe('Início (D33)', () => {
  it('saúda pela hora do relógio e lê as consultas de hoje no fuso do navegador', async () => {
    const pedidos = api()

    renderizarTela(<Inicio />, { usuario: USUARIOS.recepcao, caminho: '/inicio' })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bom dia, Carla Souza!')
    expect(await within(cartao('Consultas hoje')).findByText('2')).toBeTruthy()
    expect(within(cartao('Consultas hoje')).getByText('1 ainda por vir')).toBeTruthy()
    expect(within(cartao('Próxima consulta')).getByText('10:00')).toBeTruthy()
    expect(within(cartao('Próxima consulta')).getByText('Júlia Ramos')).toBeTruthy()
    expect(within(cartao('Pacientes cadastrados')).getByText('42')).toBeTruthy()
    const deHoje = pedidos.find((pedido) => pedido.url.pathname === '/api/consultas')
    expect(Object.fromEntries(deHoje.url.searchParams)).toMatchObject({ de: '2026-10-05', ate: '2026-10-05' })
  })

  it('à noite a saudação muda (relógio injetado)', () => {
    api()
    renderizarTela(<Inicio />, { usuario: USUARIOS.recepcao, caminho: '/inicio', agora: new Date('2026-10-05T22:30:00Z') })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Boa noite, Carla Souza!')
  })

  it('lembra das consultas pendentes de registro', async () => {
    api({ pendentes: 2 })
    renderizarTela(<Inicio />, { usuario: USUARIOS.dentista, caminho: '/inicio' })
    expect(await screen.findByText('2 consultas já passaram e ainda não foram marcadas como realizadas.')).toBeTruthy()
  })

  it('atalhos só levam a telas que o papel abre (#3)', () => {
    api()
    const atalhos = (usuario) => {
      const { unmount } = renderizarTela(<Inicio />, { usuario, caminho: '/inicio' })
      const nomes = within(screen.getByRole('heading', { name: 'Acesso rápido' }).closest('section')).getAllByRole('link').map((link) => link.getAttribute('href'))
      unmount()
      return nomes
    }

    expect(atalhos(USUARIOS.recepcao)).toEqual(['/agenda', '/pacientes', '/disponibilidade', '/pacientes/novo'])
    expect(atalhos(USUARIOS.admin)).toEqual(['/agenda', '/pacientes', '/disponibilidade', '/admin/equipe'])
    expect(atalhos(USUARIOS.dentista)).toEqual(['/agenda', '/pacientes', '/disponibilidade'])
  })
})
