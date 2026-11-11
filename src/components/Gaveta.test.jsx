// @vitest-environment jsdom
import { useState } from 'react'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '../testes/tela.jsx'
import Gaveta from './Gaveta.jsx'

function Exemplo({ aoEnviar }) {
  const [aberta, setAberta] = useState(false)
  return <>
    <button type="button" onClick={() => setAberta(true)}>Abrir edição</button>
    {aberta && <Gaveta titulo="Edição" aoFechar={() => setAberta(false)}>
      <form onSubmit={(evento) => { evento.preventDefault(); aoEnviar(); setAberta(false) }}>
        <label htmlFor="exemplo-nome">Nome</label>
        <input id="exemplo-nome" required />
        <button type="submit">Salvar</button>
      </form>
    </Gaveta>}
  </>
}

describe('teclado da gaveta (#2)', () => {
  it('usa um elemento compatível com o papel de diálogo (#2)', async () => {
    renderizarTela(<Exemplo aoEnviar={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir edição' }))
    const { violations } = await axe.run(screen.getByRole('dialog'), { runOnly: ['aria-allowed-role'] })
    expect(violations.map(({ id }) => id)).toEqual([])
  })

  it('foca o campo, contém Tab e Shift+Tab, fecha com Escape e devolve o foco', async () => {
    renderizarTela(<Exemplo aoEnviar={vi.fn()} />)
    const abrir = screen.getByRole('button', { name: 'Abrir edição' })
    await userEvent.click(abrir)
    const gaveta = screen.getByRole('dialog', { name: 'Edição' })
    expect(document.activeElement).toBe(within(gaveta).getByLabelText('Nome'))
    await userEvent.tab()
    expect(document.activeElement).toBe(within(gaveta).getByRole('button', { name: 'Salvar' }))
    await userEvent.tab()
    expect(document.activeElement).toBe(within(gaveta).getByRole('button', { name: 'Fechar' }))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(within(gaveta).getByRole('button', { name: 'Salvar' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(abrir)
  })

  it('envia por Enter no campo e devolve o foco ao fechar', async () => {
    const aoEnviar = vi.fn()
    renderizarTela(<Exemplo aoEnviar={aoEnviar} />)
    const abrir = screen.getByRole('button', { name: 'Abrir edição' })
    await userEvent.click(abrir)
    await userEvent.keyboard('Ana{Enter}')
    expect(aoEnviar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(abrir)
  })
})
