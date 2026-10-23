// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../../testes/tela.jsx'
import Procedimentos from './Procedimentos.jsx'

const limpeza = { id: 'p-limpeza', nome: 'Limpeza', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }
const clareamento = { id: 'p-clareamento', nome: 'Clareamento', duracaoMinutos: 90, precoCentavos: 60000, ativo: false }

const abrir = () => renderizarTela(<Procedimentos />, { usuario: USUARIOS.admin, caminho: '/admin/procedimentos' })
const linhaDe = (nome) => within(screen.getByRole('table')).getByText(nome).closest('[role="row"]')

describe('Procedimentos (D37, só admin)', () => {
  it('lista com duração, preço em reais e situação', async () => {
    simularApi({ 'GET /api/procedimentos': ok([clareamento, limpeza]) })

    abrir()

    await screen.findByText('Limpeza')
    expect(linhaDe('Limpeza').textContent).toMatch(/60 min.*R\$ 180,00.*Ativo/)
    expect(linhaDe('Clareamento').textContent).toMatch(/90 min.*R\$ 600,00.*Inativo/)
  })

  it('cadastra convertendo o preço para centavos', async () => {
    const pedidos = simularApi({
      'GET /api/procedimentos': ok([limpeza]),
      'POST /api/procedimentos': ({ corpo }) => ok({ id: 'p-novo', ...corpo, ativo: true }, 201),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Novo procedimento/ }))
    const gaveta = screen.getByRole('dialog', { name: 'Novo procedimento' })
    await userEvent.type(within(gaveta).getByLabelText('Nome'), 'Restauração')
    await userEvent.type(within(gaveta).getByLabelText('Duração (minutos)'), '45')
    await userEvent.type(within(gaveta).getByLabelText('Preço (R$)'), '250,50')
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }))

    expect(await screen.findByText('Procedimento Restauração cadastrado.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({ nome: 'Restauração', duracaoMinutos: 45, precoCentavos: 25050 })
  })

  it('preço inválido não chega à API', async () => {
    const pedidos = simularApi({ 'GET /api/procedimentos': ok([]) })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Novo procedimento/ }))
    const gaveta = screen.getByRole('dialog')
    await userEvent.type(within(gaveta).getByLabelText('Nome'), 'Avaliação')
    await userEvent.type(within(gaveta).getByLabelText('Duração (minutos)'), '30')
    await userEvent.type(within(gaveta).getByLabelText('Preço (R$)'), '12,345')
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }))

    expect(within(gaveta).getByRole('alert').textContent).toBe('Preço em reais, como 180,00.')
    expect(pedidos.some((pedido) => pedido.metodo === 'POST')).toBe(false)
  })

  it('nome repetido: mensagem do 409 NOME_JA_CADASTRADO', async () => {
    simularApi({
      'GET /api/procedimentos': ok([limpeza]),
      'PATCH /api/procedimentos/p-limpeza': falha(409, 'NOME_JA_CADASTRADO', 'Já existe um procedimento com esse nome.'),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Limpeza' }))
    const gaveta = screen.getByRole('dialog', { name: 'Editar procedimento' })
    const nome = within(gaveta).getByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Clareamento')
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Salvar alterações' }))

    expect((await within(gaveta).findByRole('alert')).textContent).toBe('Já existe um procedimento com esse nome.')
  })

  it('edita só o que mudou e desativa/reativa pela linha', async () => {
    const pedidos = simularApi({
      'GET /api/procedimentos': ok([clareamento, limpeza]),
      'PATCH /api/procedimentos/p-limpeza': ({ corpo }) => ok({ ...limpeza, ...corpo }),
      'PATCH /api/procedimentos/p-clareamento': ({ corpo }) => ok({ ...clareamento, ...corpo }),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Limpeza' }))
    const preco = within(screen.getByRole('dialog')).getByLabelText('Preço (R$)')
    expect(preco.value).toBe('180,00')
    await userEvent.clear(preco)
    await userEvent.type(preco, '200')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await screen.findByText('Procedimento Limpeza salvo.')
    await userEvent.click(screen.getByRole('button', { name: 'Reativar Clareamento' }))
    await screen.findByText('Clareamento voltou a aparecer no agendamento.')

    expect(pedidos.filter((pedido) => pedido.metodo === 'PATCH').map((pedido) => pedido.corpo)).toEqual([{ precoCentavos: 20000 }, { ativo: true }])
  })
})
