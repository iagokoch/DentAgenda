import { describe, expect, it } from 'vitest'
import { aguardaRegistro, colunasPorDentista, deslocarDia, diaPorExtenso, filtrarPorPaciente } from './visao.js'

const consulta = (id, dentista, inicio, fim, status = 'CONFIRMADA', paciente = 'Marcos Oliveira') => ({
  id, inicio, fim, status, dentista, paciente: { id: `p-${id}`, nome: paciente }, procedimento: { nome: 'Limpeza' },
})
const ana = { id: 'd1', nome: 'Ana Costa' }
const carla = { id: 'd2', nome: 'Carla Souza' }

describe('visão de consultas da clínica', () => {
  it('deslocarDia passa de mês e de ano', () => {
    expect(deslocarDia('2026-11-30', 1)).toBe('2026-12-01')
    expect(deslocarDia('2026-01-01', -1)).toBe('2025-12-31')
    expect(deslocarDia('2026-11-16', 0)).toBe('2026-11-16')
  })

  it('diaPorExtenso usa o dia da data, sem deslocar pelo fuso do navegador', () => {
    expect(diaPorExtenso('2026-11-16')).toBe('segunda-feira, 16 de novembro')
  })

  it('aguardaRegistro: confirmada cujo fim já passou', () => {
    const agora = new Date('2026-11-16T15:00:00Z')
    expect(aguardaRegistro(consulta('a', ana, '2026-11-16T08:00:00-03:00', '2026-11-16T09:00:00-03:00'), agora)).toBe(true)
    expect(aguardaRegistro(consulta('b', ana, '2026-11-16T14:00:00-03:00', '2026-11-16T15:00:00-03:00'), agora)).toBe(false)
    expect(aguardaRegistro(consulta('c', ana, '2026-11-16T08:00:00-03:00', '2026-11-16T09:00:00-03:00', 'REALIZADA'), agora)).toBe(false)
    expect(aguardaRegistro(consulta('d', ana, '2026-11-16T08:00:00-03:00', '2026-11-16T09:00:00-03:00', 'CANCELADA'), agora)).toBe(false)
  })

  it('colunasPorDentista mantém dentista sem consulta, ordena por horário e inclui dentista fora da lista', () => {
    const tarde = consulta('t', ana, '2026-11-16T14:00:00-03:00', '2026-11-16T15:00:00-03:00')
    const cedo = consulta('c', ana, '2026-11-16T08:00:00-03:00', '2026-11-16T09:00:00-03:00')
    const outro = consulta('o', { id: 'd9', nome: 'Pedro Lacerda' }, '2026-11-16T10:00:00-03:00', '2026-11-16T11:00:00-03:00')
    const colunas = colunasPorDentista([ana, carla], [tarde, cedo, outro])
    expect(colunas.map((coluna) => coluna.nome)).toEqual(['Ana Costa', 'Carla Souza', 'Pedro Lacerda'])
    expect(colunas[0].consultas.map((item) => item.id)).toEqual(['c', 't'])
    expect(colunas[1].consultas).toEqual([])
  })

  it('colunasPorDentista sem lista de dentistas usa só quem tem consulta', () => {
    const cedo = consulta('c', ana, '2026-11-16T08:00:00-03:00', '2026-11-16T09:00:00-03:00')
    expect(colunasPorDentista([], [cedo]).map((coluna) => coluna.nome)).toEqual(['Ana Costa'])
  })

  it('filtrarPorPaciente ignora caixa e acentos', () => {
    const itens = [consulta('a', ana, 'x', 'y', 'CONFIRMADA', 'Júlia Ferreira'), consulta('b', ana, 'x', 'y', 'CONFIRMADA', 'Paulo Lima')]
    expect(filtrarPorPaciente(itens, 'julia').map((item) => item.id)).toEqual(['a'])
    expect(filtrarPorPaciente(itens, '  ').length).toBe(2)
  })
})
