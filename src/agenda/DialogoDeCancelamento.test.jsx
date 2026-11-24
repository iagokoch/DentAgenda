// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderizarTela } from '../testes/tela.jsx'
import DialogoDeCancelamento from './DialogoDeCancelamento.jsx'

it('o aviso padrão não promete envio ou entrega e preserva justificativa', () => {
  renderizarTela(<DialogoDeCancelamento aoCancelar={vi.fn()} aoFechar={vi.fn()} />)
  const dialogo = screen.getByRole('dialog')
  expect(within(dialogo).getByText(/O cancelamento será registrado/)).toBeTruthy()
  expect(dialogo.textContent).not.toMatch(/avisado|SMS|entregue/)
  expect(within(dialogo).getByLabelText(/Justificativa/).required).toBe(false)
})

it('preserva aviso específico e justificativa obrigatória do paciente', () => {
  renderizarTela(<DialogoDeCancelamento aviso="Informe o motivo do cancelamento." justificativaObrigatoria aoCancelar={vi.fn()} aoFechar={vi.fn()} />)
  expect(screen.getByText('Informe o motivo do cancelamento.')).toBeTruthy()
  expect(screen.getByLabelText(/Justificativa/).required).toBe(true)
})
