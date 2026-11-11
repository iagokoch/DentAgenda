// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import DetalhesDaConsulta from './DetalhesDaConsulta.jsx'

const consulta = {
  id: 'c-1',
  paciente: { id: 'p-1', nome: 'Marcos Oliveira' },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: '2026-10-05T10:00:00-03:00',
  fim: '2026-10-05T11:00:00-03:00',
  status: 'CONFIRMADA',
  observacao: null,
  versaoObservacao: 0,
  canceladoPor: null,
}
const abrir = (opcoes = {}) => renderizarTela(<DetalhesDaConsulta />, { caminho: '/consultas/c-1', rota: '/consultas/:consultaId', usuario: USUARIOS.dentista, ...opcoes })
const api = (extras = {}) => simularApi({ 'GET /api/consultas/c-1': ok(consulta), 'GET /api/consultas/c-1/observacao/historico': ok([]), ...extras })

describe('Detalhes da consulta (D33)', () => {
  it('histórico com mesmo timestamp usa identidades distintas sem colisão de chave', async () => {
    const avisos = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      api({ 'GET /api/consultas/c-1/observacao/historico': ok([
        { id: 'h-2', versao: 2, texto: 'Segunda versão', autor: 'PACIENTE', editadoEm: '2026-10-05T09:00:00-03:00' },
        { id: 'h-1', versao: 1, texto: 'Primeira versão', autor: 'PACIENTE', editadoEm: '2026-10-05T09:00:00-03:00' },
      ]) })
      abrir()
      await screen.findByText('Segunda versão')
      expect(screen.getByText('Primeira versão')).toBeTruthy()
      expect(avisos.mock.calls.some((argumentos) => argumentos.join(' ').includes('same key'))).toBe(false)
    } finally {
      avisos.mockRestore()
    }
  })

  it('habilita realização ao atravessar o início sem remontar a tela', async () => {
    api()
    const agora = new Date('2026-10-05T12:59:59.900Z')
    vi.useFakeTimers()
    try {
      await act(async () => abrir({ agora }))
      expect(screen.getByRole('button', { name: /Marcar como realizada/ }).disabled).toBe(true)
      agora.setTime(Date.parse('2026-10-05T13:00:00Z'))
      await act(() => vi.advanceTimersByTimeAsync(100))
      expect(screen.getByRole('button', { name: /Marcar como realizada/ }).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reavalia o início ao recuperar foco após suspensão', async () => {
    api()
    const agora = new Date('2026-10-05T12:00:00Z')
    abrir({ agora })
    expect((await screen.findByRole('button', { name: /Marcar como realizada/ })).disabled).toBe(true)
    agora.setTime(Date.parse('2026-10-05T13:30:00Z'))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(screen.getByRole('button', { name: /Marcar como realizada/ }).disabled).toBe(false)
  })

  it.each([
    ['realizacao', 'observacao'], ['realizacao', 'situacao'],
    ['cancelamento', 'observacao'], ['cancelamento', 'situacao'],
  ])('%s: resposta de %s chega primeiro e preserva status e observação', async (acao, primeira) => {
    const observacao = Promise.withResolvers()
    const situacao = Promise.withResolvers()
    const status = acao === 'realizacao' ? 'REALIZADA' : 'CANCELADA'
    api({
      'PUT /api/consultas/c-1/observacao': () => observacao.promise,
      [`POST /api/consultas/c-1/${acao}`]: () => situacao.promise,
    })
    abrir({ agora: new Date('2026-10-05T13:30:00Z') })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    await userEvent.type(screen.getByLabelText('Observação da consulta'), 'Nota atualizada')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar observação' }))
    if (acao === 'realizacao') {
      await userEvent.click(screen.getByRole('button', { name: /Marcar como realizada/ }))
    } else {
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar consulta' }))
    }
    const resolverObservacao = () => observacao.resolve(ok({ ...consulta, observacao: 'Nota atualizada', versaoObservacao: 1 }))
    const resolverSituacao = () => situacao.resolve(ok({ ...consulta, status,
      ...(acao === 'cancelamento' && { canceladoEm: '2026-10-05T10:30:00-03:00', canceladoPor: 'CLINICA' }),
    }))
    await act(async () => (primeira === 'observacao' ? resolverObservacao() : resolverSituacao()))
    await act(async () => (primeira === 'observacao' ? resolverSituacao() : resolverObservacao()))
    await waitFor(() => expect(screen.getAllByText(status === 'REALIZADA' ? 'Realizada' : 'Cancelada').length).toBeGreaterThan(0))
    expect(screen.getByText('Nota atualizada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Marcar como realizada/ })).toBeNull()
  })

  it('antes do início, "Marcar como realizada" fica desabilitado (relógio às 09:00, consulta às 10:00)', async () => {
    api()
    abrir()
    expect((await screen.findByRole('button', { name: /Marcar como realizada/ })).disabled).toBe(true)
  })

  it('depois do início, marca como realizada e mostra o novo status', async () => {
    const pedidos = api({ 'POST /api/consultas/c-1/realizacao': ok({ ...consulta, status: 'REALIZADA' }) })
    abrir({ agora: new Date('2026-10-05T13:30:00Z') })

    await userEvent.click(await screen.findByRole('button', { name: /Marcar como realizada/ }))

    expect(await screen.findByText('Consulta marcada como realizada.')).toBeTruthy()
    expect(screen.getAllByText('Realizada').length).toBeGreaterThan(0)
    expect(pedidos.some((pedido) => pedido.metodo === 'POST')).toBe(true)
  })

  it('cancelar pela clínica: justificativa opcional e aviso de SMS ao paciente', async () => {
    const pedidos = api({ 'POST /api/consultas/c-1/cancelamento': ok({ ...consulta, status: 'CANCELADA', canceladoPor: 'CLINICA', canceladoEm: '2026-10-05T09:00:00-03:00', justificativa: null }) })
    abrir({ usuario: USUARIOS.recepcao })

    await userEvent.click(await screen.findByRole('button', { name: /Cancelar consulta/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar consulta' })
    expect(within(dialogo).getByText(/O paciente é avisado por SMS/)).toBeTruthy()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar consulta' }))

    expect(await screen.findByText('Consulta cancelada. O paciente foi avisado.')).toBeTruthy()
    expect(pedidos.find((pedido) => pedido.metodo === 'POST').corpo).toEqual({})
  })

  it('consulta de outro dentista (404 da API): mensagem de erro, sem as ações', async () => {
    simularApi({ 'GET /api/consultas/c-1': falha(404, 'NAO_ENCONTRADO', 'Consulta não encontrada.') })
    abrir()
    expect((await screen.findByRole('alert')).textContent).toContain('Consulta não encontrada.')
    expect(screen.queryByRole('button', { name: /Marcar como realizada/ })).toBeNull()
  })

  it('o popup prende o foco: Tab no último botão volta ao campo de justificativa (#2)', async () => {
    api()
    abrir({ usuario: USUARIOS.recepcao })
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar consulta/ }))
    const dialogo = screen.getByRole('dialog')
    const campo = within(dialogo).getByLabelText(/Justificativa/)
    expect(document.activeElement).toBe(campo)

    within(dialogo).getByRole('button', { name: 'Cancelar consulta' }).focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(campo)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Cancelar consulta' }))
  })

  it('o cancelamento tem semântica válida de diálogo (#2)', async () => {
    api()
    abrir({ usuario: USUARIOS.recepcao })
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar consulta/ }))
    const { violations } = await axe.run(screen.getByRole('dialog'), { runOnly: ['aria-allowed-role'] })
    expect(violations.map(({ id }) => id)).toEqual([])
  })
})
