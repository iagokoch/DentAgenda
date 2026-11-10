import { afterEach, expect, it, vi } from 'vitest'
import { coordenacaoDaSessao } from './coordenacao-de-sessao.js'

afterEach(() => vi.unstubAllGlobals())

it('usa uma trava de origem com espera limitada quando Web Locks está disponível', async () => {
  const request = vi.fn(async (_nome, _opcoes, operacao) => operacao())
  vi.stubGlobal('navigator', { locks: { request } })
  expect(coordenacaoDaSessao.entreAbas).toBe(true)
  expect(await coordenacaoDaSessao.executar(() => 42)).toBe(42)
  expect(request.mock.calls[0][0]).toBe('dentagenda-sessao')
  expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})

it('fallback local serializa operações, mas não declara coordenação entre abas', async () => {
  vi.stubGlobal('navigator', {})
  const liberar = Promise.withResolvers()
  const ordem = []
  const primeira = coordenacaoDaSessao.executar(async () => { ordem.push(1); await liberar.promise })
  const segunda = coordenacaoDaSessao.executar(() => { ordem.push(2) })
  await Promise.resolve()
  expect(ordem).toEqual([1])
  liberar.resolve()
  await Promise.all([primeira, segunda])
  expect(ordem).toEqual([1, 2])
  expect(coordenacaoDaSessao.entreAbas).toBe(false)
})
