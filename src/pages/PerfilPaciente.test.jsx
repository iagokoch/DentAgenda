// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { ok, renderizarTela, simularApi } from '../testes/tela.jsx'
import PerfilPaciente from './PerfilPaciente.jsx'

const paciente = { id: 'p-1', nome: 'Marcos Oliveira', cpf: '52998224725', telefone: '47987654321', email: null, nascimento: '1985-10-06', convenio: null, pacienteDesde: '2019-03-01', endereco: null, temLogin: false }

function abrir() {
  simularApi({ 'GET /api/pacientes/p-1': ok(paciente), 'GET /api/pacientes/p-1/alertas': ok([]), 'GET /api/consultas': ok({ itens: [], total: 0 }) })
  renderizarTela(<PerfilPaciente />, { caminho: '/pacientes/p-1', rota: '/pacientes/:pacienteId' })
}

describe('Perfil do paciente', () => {
  it('a idade sai do relógio injetado: faz 41 amanhã, hoje tem 40 (#7)', async () => {
    abrir()
    expect(await screen.findByText(/\(40 anos\)/)).toBeTruthy()
  })

  it('a edição contém o foco, fecha com Escape e salva por Enter (#2)', async () => {
    const pedidos = simularApi({
      'GET /api/pacientes/p-1': ok(paciente),
      'GET /api/pacientes/p-1/alertas': ok([]),
      'PATCH /api/pacientes/p-1': ok({ ...paciente, nome: 'Marcos Silva' }),
    })
    renderizarTela(<PerfilPaciente />, { caminho: '/pacientes/p-1', rota: '/pacientes/:pacienteId' })
    const abrirEdicao = await screen.findByRole('button', { name: 'Editar' })
    await userEvent.click(abrirEdicao)
    let gaveta = screen.getByRole('dialog', { name: 'Editar dados' })
    expect(document.activeElement).toBe(within(gaveta).getByLabelText('Nome completo'))
    within(gaveta).getByRole('button', { name: 'Salvar alterações' }).focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(within(gaveta).getByRole('button', { name: 'Fechar' }))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(within(gaveta).getByRole('button', { name: 'Salvar alterações' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(abrirEdicao)

    await userEvent.keyboard('{Enter}')
    gaveta = screen.getByRole('dialog', { name: 'Editar dados' })
    await userEvent.clear(within(gaveta).getByLabelText('Nome completo'))
    await userEvent.keyboard('Marcos Silva{Enter}')
    await screen.findByRole('button', { name: 'Editar' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedidos.filter((pedido) => pedido.metodo === 'PATCH').map((pedido) => pedido.corpo)).toEqual([{ nome: 'Marcos Silva' }])
    expect(document.activeElement).toBe(abrirEdicao)
  })

  it('a gaveta do paciente tem semântica válida de diálogo (#2)', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const { violations } = await axe.run(screen.getByRole('dialog'), { runOnly: ['aria-allowed-role'] })
    expect(violations.map(({ id }) => id)).toEqual([])
  })

  it('abas pelo teclado: tablist, tabpanel ligado à aba e setas, Home e End (#2)', async () => {
    abrir()
    const dados = await screen.findByRole('tab', { name: 'Dados Pessoais' })
    expect(dados.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(dados.id)
    expect(screen.getByRole('tab', { name: 'Histórico' }).tabIndex).toBe(-1)

    dados.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByRole('tab', { name: 'Histórico' }).getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Financeiro' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Dados Pessoais' }))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Financeiro' }))
    expect(screen.getByRole('tabpanel').textContent).toContain('Em breve')
  })
})
