// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('alinha ao minuto, acompanha foco/visibilidade e limpa timer/listeners', async () => {
  const { useAgoraAtualizado } = await import('./useAgoraAtualizado.js')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T11:59:45Z'))
  const removerJanela = vi.spyOn(window, 'removeEventListener')
  const removerDocumento = vi.spyOn(document, 'removeEventListener')
  const { result, unmount } = renderHook(() => useAgoraAtualizado())
  await act(async () => vi.advanceTimersByTimeAsync(15_000))
  expect(result.current.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  expect(vi.getTimerCount()).toBe(1)
  vi.setSystemTime(new Date('2026-10-06T03:05:00Z'))
  act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  expect(result.current.toISOString()).toBe('2026-10-06T03:05:00.000Z')
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
  expect(removerJanela).toHaveBeenCalledWith('focus', expect.any(Function))
  expect(removerDocumento).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})
