// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../../testes/tela.jsx'
import Equipe from './Equipe.jsx'

const ana = { id: 'f-ana', nome: 'Ana Costa', cpf: '52998224725', email: 'ana@colzani.com.br', categoria: 'DENTISTA', cro: 'SP-12345', dataInicio: '2026-01-01', isAdmin: false, ativo: true }
const rita = { id: 'f-rita', nome: 'Rita Lima', cpf: '11144477735', email: 'rita@colzani.com.br', categoria: 'RECEPCIONISTA', cro: null, dataInicio: '2026-01-01', isAdmin: true, ativo: true }
const bruno = { id: 'f-bruno', nome: 'Bruno Dias', cpf: '39053344705', email: 'bruno@colzani.com.br', categoria: 'RECEPCIONISTA', cro: null, dataInicio: '2025-03-01', isAdmin: false, ativo: false }

const abrir = () => renderizarTela(<Equipe />, { usuario: USUARIOS.admin, caminho: '/admin/equipe' })
const linhaDe = (nome) => within(screen.getByRole('table')).getByText(nome).closest('[role="row"]')

describe('Equipe (D37, só admin)', () => {
  it('lista os funcionários com categoria, admin e situação', async () => {
    simularApi({ 'GET /api/funcionarios': ok([ana, rita, bruno]) })

    abrir()

    await screen.findByText('Ana Costa')
    expect(within(linhaDe('Ana Costa')).getByText('Dentista · SP-12345')).toBeTruthy()
    expect(within(linhaDe('Rita Lima')).getByText('Admin')).toBeTruthy()
    expect(within(linhaDe('Bruno Dias')).getByText('Inativo')).toBeTruthy()
    expect(within(linhaDe('Bruno Dias')).getByRole('button', { name: 'Reativar Bruno Dias' })).toBeTruthy()
  })

  it('cadastra uma dentista e avisa como ela define a senha', async () => {
    const funcionarios = [rita]
    const pedidos = simularApi({
      'GET /api/funcionarios': () => ok([...funcionarios]),
      'POST /api/funcionarios': ({ corpo }) => {
        funcionarios.push({ id: 'f-nova', ...corpo, ativo: true })
        return ok(funcionarios.at(-1), 201)
      },
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Novo funcionário/ }))
    const gaveta = screen.getByRole('dialog', { name: 'Novo funcionário' })
    await userEvent.type(within(gaveta).getByLabelText('Nome completo'), 'Júlia Ramos')
    await userEvent.type(within(gaveta).getByLabelText('CPF'), '390.533.447-05')
    await userEvent.type(within(gaveta).getByLabelText('E-mail'), 'julia@colzani.com.br')
    await userEvent.selectOptions(within(gaveta).getByLabelText('Categoria'), 'DENTISTA')
    await userEvent.type(within(gaveta).getByLabelText('CRO'), 'SC-999')
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }))

    expect(await screen.findByText(/Júlia Ramos define a senha em “Esqueci minha senha”, com o e-mail julia@colzani.com.br/)).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({
      nome: 'Júlia Ramos',
      cpf: '39053344705',
      email: 'julia@colzani.com.br',
      categoria: 'DENTISTA',
      cro: 'SC-999',
      dataInicio: '2026-10-05',
      isAdmin: false,
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(linhaDe('Júlia Ramos')).toBeTruthy()
  })

  it('recepcionista não tem campo de CRO; erro da API (409) aparece na gaveta, que continua aberta', async () => {
    simularApi({
      'GET /api/funcionarios': ok([rita]),
      'POST /api/funcionarios': falha(409, 'EMAIL_JA_CADASTRADO', 'Já existe um funcionário com esse e-mail.'),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Novo funcionário/ }))
    const gaveta = screen.getByRole('dialog')
    expect(within(gaveta).queryByLabelText('CRO')).toBeNull()
    await userEvent.type(within(gaveta).getByLabelText('Nome completo'), 'Carla Souza')
    await userEvent.type(within(gaveta).getByLabelText('CPF'), '11144477735')
    await userEvent.type(within(gaveta).getByLabelText('E-mail'), 'rita@colzani.com.br')
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }))

    expect((await within(gaveta).findByRole('alert')).textContent).toBe('Já existe um funcionário com esse e-mail.')
  })

  it('edita mandando só o que mudou', async () => {
    const pedidos = simularApi({
      'GET /api/funcionarios': ok([ana, rita]),
      'PATCH /api/funcionarios/f-ana': ok({ ...ana, isAdmin: true }),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Costa' }))
    const gaveta = screen.getByRole('dialog', { name: 'Editar funcionário' })
    expect(within(gaveta).getByLabelText('CRO').value).toBe('SP-12345')
    await userEvent.click(within(gaveta).getByLabelText(/Administrador/))
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('Dados de Ana Costa salvos.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'PATCH').corpo).toEqual({ isAdmin: true })
  })

  it('desativar o último admin: a mensagem da API (ULTIMO_ADMIN) aparece e nada muda', async () => {
    const pedidos = simularApi({
      'GET /api/funcionarios': ok([ana, rita]),
      'PATCH /api/funcionarios/f-rita': falha(422, 'ULTIMO_ADMIN', 'Precisa existir pelo menos um administrador ativo.'),
    })
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'Desativar Rita Lima' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Precisa existir pelo menos um administrador ativo.')
    expect(pedidos.find((pedido) => pedido.metodo === 'PATCH').corpo).toEqual({ ativo: false })
    expect(within(linhaDe('Rita Lima')).getByText('Ativo')).toBeTruthy()
  })

  it('erro ao carregar e lista vazia', async () => {
    let tentativas = 0
    simularApi({ 'GET /api/funcionarios': () => (++tentativas === 1 ? falha(403, 'SEM_PERMISSAO', 'Você não tem permissão.') : ok([])) })
    abrir()

    expect((await screen.findByRole('alert')).textContent).toBe('Você não tem permissão.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhum funcionário cadastrado.')).toBeTruthy()
  })
})
