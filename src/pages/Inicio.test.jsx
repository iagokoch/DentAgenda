// @vitest-environment jsdom
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { falha, ok, renderizarTela, simularApi, USUARIOS } from '../testes/tela.jsx'
import Inicio from './Inicio.jsx'
import { useConsultasDeHoje } from '../agenda/useConsultasDeHoje.js'

const consulta = (id, hora, status = 'CONFIRMADA', nome = 'Marcos Oliveira') => ({
  id,
  paciente: { id: `p-${id}`, nome },
  dentista: { id: 'dentista-1', nome: 'Ana Costa' },
  procedimento: { id: 'proc-1', nome: 'Limpeza' },
  inicio: `2026-10-05T${hora}:00-03:00`,
  fim: `2026-10-05T${hora}:00-03:00`,
  status,
})

function api({ pendentes = 0, consultas } = {}) {
  return simularApi({
    'GET /api/consultas': consultas ?? ok({ itens: [consulta('a', '08:00', 'REALIZADA'), consulta('b', '10:00', 'CONFIRMADA', 'Júlia Ramos'), consulta('c', '11:00', 'CANCELADA')], total: 3 }),
    'GET /api/pacientes': ok({ itens: [], total: 42 }),
    'GET /api/consultas/pendentes': ok({ itens: [], total: pendentes }),
  })
}
const cartao = (titulo) => screen.getByText(titulo).closest('article')

function paginaDeConsultas(itens, { url }) {
  const pagina = Number(url.searchParams.get('pagina') ?? 1)
  const porPagina = Number(url.searchParams.get('porPagina'))
  return ok({ itens: itens.slice((pagina - 1) * porPagina, pagina * porPagina), total: itens.length })
}

const canceladas = (quantidade) => Array.from({ length: quantidade }, (_, indice) => consulta(`cancelada-${indice}`, '08:00', 'CANCELADA'))

describe('Início (D33)', () => {
  it('inclui a próxima consulta depois de cem canceladas nos cartões e na lista (#22)', async () => {
    const itens = [...canceladas(100), consulta('futura', '10:00', 'CONFIRMADA', 'Paciente da segunda página')]
    const pedidos = api({ consultas: (pedido) => paginaDeConsultas(itens, pedido) })
    renderizarTela(<Inicio />, { caminho: '/inicio' })

    expect(await within(cartao('Consultas hoje')).findByText('1')).toBeTruthy()
    expect(within(cartao('Consultas hoje')).getByText('1 ainda por vir')).toBeTruthy()
    expect(within(cartao('Próxima consulta')).getByText('10:00')).toBeTruthy()
    expect(within(cartao('Próxima consulta')).getByText('Paciente da segunda página')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Paciente da segunda página/ }).getAttribute('href')).toBe('/consultas/futura')
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/consultas/'))).toHaveLength(101)
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas').map(({ url }) => Object.fromEntries(url.searchParams))).toEqual([
      { de: '2026-10-05', ate: '2026-10-05', porPagina: '100', pagina: '1' },
      { de: '2026-10-05', ate: '2026-10-05', porPagina: '100', pagina: '2' },
    ])
  })

  it.each([0, 1, 100, 200, 201])('lê %i consultas sem pedir uma página extra', async (quantidade) => {
    const pedidos = api({ consultas: (pedido) => paginaDeConsultas(canceladas(quantidade), pedido) })
    renderizarTela(<Inicio />, { caminho: '/inicio' })

    expect(await within(cartao('Consultas hoje')).findByText('0')).toBeTruthy()
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/consultas/'))).toHaveLength(quantidade)
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(Math.max(1, Math.ceil(quantidade / 100)))
  })

  it('mantém carregamento até receber a segunda página, sem mostrar totais parciais', async () => {
    let liberarPagina
    const segundaPagina = new Promise((resolve) => { liberarPagina = resolve })
    const pedidos = api({ consultas: ({ url }) => Number(url.searchParams.get('pagina') ?? 1) === 1
      ? ok({ itens: canceladas(100), total: 101 })
      : segundaPagina })
    renderizarTela(<Inicio />, { caminho: '/inicio' })

    await waitFor(() => expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(2))
    expect(within(cartao('Consultas hoje')).queryByText('0')).toBeNull()
    expect(screen.getByText('Carregando consultas…')).toBeTruthy()
    await act(async () => liberarPagina(ok({ itens: [consulta('futura', '10:00')], total: 101 })))
    expect(await within(cartao('Consultas hoje')).findByText('1')).toBeTruthy()
  })

  it('não mostra resultado parcial se a segunda página falhar e repete desde o início', async () => {
    let falhar = true
    const itens = [...canceladas(100), consulta('futura', '10:00')]
    const pedidos = api({ consultas: (pedido) => falhar && pedido.url.searchParams.get('pagina') === '2'
      ? falha(500, 'ERRO_INTERNO', 'Falha na segunda página.')
      : paginaDeConsultas(itens, pedido) })
    renderizarTela(<Inicio />, { caminho: '/inicio' })

    expect((await screen.findAllByText('Falha na segunda página.')).length).toBeGreaterThan(0)
    expect(within(cartao('Consultas hoje')).queryByText('0')).toBeNull()
    expect(screen.queryByRole('link', { name: /Marcos Oliveira/ })).toBeNull()
    falhar = false
    fireEvent.click(screen.getAllByRole('button', { name: 'Tentar de novo' })[0])
    expect(await within(cartao('Consultas hoje')).findByText('1')).toBeTruthy()
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas').map(({ url }) => url.searchParams.get('pagina'))).toEqual(['1', '2', '1', '2'])
  })

  it('ignora uma página atrasada do dia anterior e não continua a paginação antiga', async () => {
    let liberarPaginaAntiga
    const paginaAntiga = new Promise((resolve) => { liberarPaginaAntiga = resolve })
    const pedidos = api({ consultas: ({ url }) => {
      if (url.searchParams.get('de') === '2026-10-06') return ok({ itens: [consulta('novo-dia', '10:00')], total: 1 })
      if (url.searchParams.get('pagina') === '1') return ok({ itens: canceladas(100), total: 201 })
      return paginaAntiga
    } })
    const { result, rerender } = renderHook(({ dia }) => useConsultasDeHoje(dia), { initialProps: { dia: '2026-10-05' } })

    await waitFor(() => expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(2))
    rerender({ dia: '2026-10-06' })
    expect(result.current.estado).toBe('carregando')
    await waitFor(() => expect(result.current.dados?.itens[0]?.id).toBe('novo-dia'))
    await act(async () => liberarPaginaAntiga(ok({ itens: canceladas(100), total: 201 })))
    expect(result.current.dados.itens.map(({ id }) => id)).toEqual(['novo-dia'])
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(3)
  })

  it('não pede a próxima página depois de sair da tela', async () => {
    let liberarPagina
    const primeiraPagina = new Promise((resolve) => { liberarPagina = resolve })
    const pedidos = api({ consultas: () => primeiraPagina })
    const { unmount } = renderHook(() => useConsultasDeHoje('2026-10-05'))

    await waitFor(() => expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(1))
    unmount()
    await act(async () => liberarPagina(ok({ itens: canceladas(100), total: 201 })))
    expect(pedidos.filter(({ url }) => url.pathname === '/api/consultas')).toHaveLength(1)
  })

  it('saúda pela hora do relógio e lê as consultas de hoje no fuso da clínica', async () => {
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

describe('Início acompanha o tempo', () => {
  it('remove a próxima ao iniciar e revalida pendentes só ao cruzar fim, dia ou retornar', async () => {
    const relogio = new Date('2026-10-05T08:59:00-03:00')
    const marcada = { ...consulta('tempo', '09:00'), fim: '2026-10-05T09:30:00-03:00' }
    const pedidos = simularApi({
      'GET /api/consultas': ok({ itens: [marcada], total: 1 }),
      'GET /api/pacientes': ok({ itens: [], total: 1 }),
      'GET /api/consultas/pendentes': () => ok({ itens: [], total: relogio > new Date(marcada.fim) ? 1 : 0 }),
    })
    vi.useFakeTimers()
    await act(async () => { renderizarTela(<Inicio />, { caminho: '/inicio', agora: relogio }) })
    expect(screen.getByText('1 ainda por vir')).toBeTruthy()
    const pendentes = () => pedidos.filter(p => p.url.pathname.endsWith('/pendentes')).length
    async function avancar(minutos) {
      relogio.setTime(relogio.getTime() + minutos * 60_000)
      await act(async () => { await vi.advanceTimersByTimeAsync(minutos * 60_000) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    }
    try {
      await avancar(1)
      expect(screen.getByText('0 ainda por vir')).toBeTruthy()
      expect(within(cartao('Próxima consulta')).getByText('—')).toBeTruthy()
      expect(pendentes()).toBe(1)
      await avancar(30)
      expect(pendentes()).toBe(1)
      await avancar(1)
      expect(pendentes()).toBe(2)
      await act(async () => { fireEvent.focus(window); fireEvent(document, new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0) })
      expect(pendentes()).toBe(3)
    } finally { vi.useRealTimers() }
  })
  it('troca a consulta diária à meia-noite', async () => {
    const pedidos = api({ consultas: ok({ itens: [], total: 0 }) })
    const relogio = new Date('2026-10-05T23:59:00-03:00')
    vi.useFakeTimers()
    await act(async () => { renderizarTela(<Inicio />, { caminho: '/inicio', agora: relogio }) })
    relogio.setTime(relogio.getTime() + 60_000)
    try { await act(async () => { await vi.advanceTimersByTimeAsync(60_000) }) }
    finally { vi.useRealTimers() }
    await waitFor(() => expect(pedidos.filter(p => p.url.pathname === '/api/consultas').at(-1).url.searchParams.get('de')).toBe('2026-10-06'))
  })
})

it('revalida pendentes quando o GET diário termina depois do fim da consulta', async () => {
  const relogio = new Date('2026-10-05T09:29:00-03:00')
  const leitura = Promise.withResolvers()
  const marcada = { ...consulta('atrasada', '09:00'), fim: '2026-10-05T09:30:00-03:00' }
  const pedidos = simularApi({
    'GET /api/consultas': () => leitura.promise,
    'GET /api/pacientes': ok({ itens: [], total: 0 }),
    'GET /api/consultas/pendentes': () => ok({ itens: [], total: relogio > new Date(marcada.fim) ? 1 : 0 }),
  })
  vi.useFakeTimers()
  try {
    await act(async () => { renderizarTela(<Inicio />, { agora: relogio }) })
    relogio.setTime(relogio.getTime() + 2 * 60_000)
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000) })
    await act(async () => leitura.resolve(ok({ itens: [marcada], total: 1 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(pedidos.filter(p => p.url.pathname.endsWith('/pendentes'))).toHaveLength(2)
    expect(screen.getByText('1 consulta já passou e ainda não foi marcada como realizada.')).toBeTruthy()
  } finally { vi.useRealTimers() }
})
