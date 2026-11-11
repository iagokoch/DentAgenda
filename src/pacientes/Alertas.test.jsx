// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { falha, ok, simularApi } from '../testes/tela.jsx'
import Alertas from './Alertas.jsx'

const anterior = { id: 'alerta-anterior', texto: 'Alergia fictícia a penicilina', autor: 'PACIENTE', criadoEm: '2026-11-10T09:00:00-03:00' }
const criado = { ...anterior, id: 'alerta-novo', texto: 'Alergia fictícia a látex' }
const outroPaciente = { ...anterior, id: 'alerta-outro-paciente', texto: 'Alerta fictício de outro paciente' }

function abrir(respostas = {}) {
  simularApi({
    'GET /api/pacientes/p-1/alertas': ok([anterior]),
    'POST /api/pacientes/p-1/alertas': ok(criado, 201),
    'DELETE /api/pacientes/p-1/alertas/alerta-novo': ok(null, 204),
    'DELETE /api/pacientes/p-1/alertas/alerta-anterior': ok(null, 204),
    'GET /api/pacientes/p-2/alertas': ok([outroPaciente]),
    ...respostas,
  })
  return render(<Alertas pacienteId="p-1" />)
}

async function adicionar() {
  await userEvent.type(screen.getByRole('textbox', { name: 'Novo alerta' }), criado.texto)
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar alerta' }))
}

async function responder(pedido, resposta) {
  await act(async () => { pedido.resolve(resposta) })
}

describe('alertas clínicos e respostas fora de ordem (#18)', () => {
  it.each(['leitura', 'criacao'])('%s termina primeiro: preserva alertas anteriores e o criado', async (primeiro) => {
    const leitura = Promise.withResolvers()
    abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise })
    if (primeiro === 'leitura') await responder(leitura, ok([anterior]))

    await adicionar()
    expect(await screen.findByText(criado.texto)).toBeTruthy()
    if (primeiro === 'criacao') {
      expect(screen.getByText('Carregando…')).toBeTruthy()
      await responder(leitura, ok([anterior]))
    }

    expect(await screen.findByText(anterior.texto)).toBeTruthy()
    expect(screen.getAllByText(criado.texto)).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('Carregando…')).toBeNull()
  })

  it('GET atrasado vazio não oculta o alerta confirmado nem informa lista vazia', async () => {
    const leitura = Promise.withResolvers()
    abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise })
    await adicionar()
    expect(await screen.findByText(criado.texto)).toBeTruthy()

    await responder(leitura, ok([]))

    expect(screen.getByText(criado.texto)).toBeTruthy()
    expect(screen.queryByText('Nenhum alerta registrado.')).toBeNull()
  })

  it('GET que já contém o alerta criado não o duplica', async () => {
    const leitura = Promise.withResolvers()
    abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise })
    await adicionar()
    await screen.findByText(criado.texto)

    await responder(leitura, ok([anterior, criado]))

    expect(screen.getAllByText(criado.texto)).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('GET atrasado não restaura alerta criado e depois removido', async () => {
    const leitura = Promise.withResolvers()
    abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise })
    await adicionar()
    await screen.findByText(criado.texto)
    await userEvent.click(screen.getByRole('button', { name: `Remover alerta ${criado.texto}` }))
    await waitFor(() => expect(screen.queryByText(criado.texto)).toBeNull())

    await responder(leitura, ok([anterior, criado]))

    expect(screen.getByText(anterior.texto)).toBeTruthy()
    expect(screen.queryByText(criado.texto)).toBeNull()
  })

  it.each(['leitura', 'criacao'])('%s termina primeiro: falha do GET preserva criação já iniciada e o erro', async (primeiro) => {
    const leitura = Promise.withResolvers()
    const criacao = Promise.withResolvers()
    abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise, 'POST /api/pacientes/p-1/alertas': criacao.promise })
    await adicionar()
    const erroDeLeitura = falha(503, 'ERRO_INTERNO', 'Falha fictícia na leitura.')

    if (primeiro === 'leitura') await responder(leitura, erroDeLeitura)
    await responder(criacao, ok(criado, 201))
    if (primeiro === 'criacao') await responder(leitura, erroDeLeitura)

    expect(screen.getByText(criado.texto)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Falha fictícia na leitura.')
    expect(screen.queryByText('Carregando…')).toBeNull()
    await userEvent.type(screen.getByRole('textbox', { name: 'Novo alerta' }), 'Outro alerta')
    expect(screen.getByRole('button', { name: 'Adicionar alerta' }).disabled).toBe(true)
  })

  it('falha do POST não insere alerta e preserva o resultado do GET', async () => {
    abrir({ 'POST /api/pacientes/p-1/alertas': falha(503, 'ERRO_INTERNO', 'Falha fictícia ao salvar.') })
    await screen.findByText(anterior.texto)

    await adicionar()

    expect((await screen.findByRole('alert')).textContent).toBe('Falha fictícia ao salvar.')
    expect(screen.getByText(anterior.texto)).toBeTruthy()
    expect(screen.queryByText(criado.texto)).toBeNull()
  })

  it('remoção confirmada após leitura retira somente o alerta escolhido', async () => {
    abrir({ 'GET /api/pacientes/p-1/alertas': ok([anterior, criado]) })
    await screen.findByText(criado.texto)

    await userEvent.click(screen.getByRole('button', { name: `Remover alerta ${criado.texto}` }))

    await waitFor(() => expect(screen.queryByText(criado.texto)).toBeNull())
    expect(screen.getByText(anterior.texto)).toBeTruthy()
  })

  it('falha do DELETE mantém o alerta na lista', async () => {
    abrir({ 'DELETE /api/pacientes/p-1/alertas/alerta-anterior': falha(503, 'ERRO_INTERNO', 'Falha fictícia ao remover.') })
    await screen.findByText(anterior.texto)

    await userEvent.click(screen.getByRole('button', { name: `Remover alerta ${anterior.texto}` }))

    expect((await screen.findByRole('alert')).textContent).toBe('Falha fictícia ao remover.')
    expect(screen.getByText(anterior.texto)).toBeTruthy()
  })

  it('trocar paciente isola lista, formulário e POST pendente do anterior', async () => {
    const criacao = Promise.withResolvers()
    const leituraDoOutro = Promise.withResolvers()
    const { rerender } = abrir({ 'POST /api/pacientes/p-1/alertas': criacao.promise, 'GET /api/pacientes/p-2/alertas': leituraDoOutro.promise })
    await screen.findByText(anterior.texto)
    await adicionar()

    rerender(<Alertas pacienteId="p-2" />)

    expect(screen.queryByText(anterior.texto)).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Novo alerta' }).value).toBe('')
    await responder(leituraDoOutro, ok([outroPaciente]))
    await responder(criacao, ok(criado, 201))
    expect(screen.getByText(outroPaciente.texto)).toBeTruthy()
    expect(screen.queryByText(criado.texto)).toBeNull()
  })

  it('GET pendente do paciente anterior não substitui a lista atual', async () => {
    const leitura = Promise.withResolvers()
    const { rerender } = abrir({ 'GET /api/pacientes/p-1/alertas': leitura.promise })
    rerender(<Alertas pacienteId="p-2" />)
    await screen.findByText(outroPaciente.texto)

    await responder(leitura, ok([anterior]))

    expect(screen.getByText(outroPaciente.texto)).toBeTruthy()
    expect(screen.queryByText(anterior.texto)).toBeNull()
  })
})
