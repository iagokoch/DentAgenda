import { describe, expect, it } from 'vitest'
import { faltamMenosDe24Horas, historicoDoPaciente, jaComecou, proximasDoPaciente } from './consultas-do-paciente.js'

const agora = new Date('2026-10-05T12:00:00Z') // segunda, 09:00 em São Paulo
const consulta = (id, inicio, status = 'CONFIRMADA') => ({ id, inicio, status })

describe('regras da área do paciente', () => {
  it('jaComecou: no instante de início a consulta já começou', () => {
    expect(jaComecou(consulta('a', '2026-10-05T09:00:00-03:00'), agora)).toBe(true)
    expect(jaComecou(consulta('a', '2026-10-05T09:05:00-03:00'), agora)).toBe(false)
  })

  it('faltamMenosDe24Horas: exatamente 24 h antes ainda não exige justificativa (api.md, D14)', () => {
    expect(faltamMenosDe24Horas(consulta('a', '2026-10-06T09:00:00-03:00'), agora)).toBe(false)
    expect(faltamMenosDe24Horas(consulta('a', '2026-10-06T08:59:00-03:00'), agora)).toBe(true)
  })

  it('próximas: só as confirmadas que ainda não começaram, na ordem da API', () => {
    const itens = [
      consulta('comecou', '2026-10-05T08:30:00-03:00'),
      consulta('cancelada', '2026-10-05T10:00:00-03:00', 'CANCELADA'),
      consulta('hoje', '2026-10-05T11:00:00-03:00'),
      consulta('amanha', '2026-10-06T11:00:00-03:00'),
    ]

    expect(proximasDoPaciente(itens, agora).map((item) => item.id)).toEqual(['hoje', 'amanha'])
  })

  it('histórico: tudo o que não está nas próximas, da mais nova para a mais antiga', () => {
    const itens = [
      consulta('antiga', '2026-09-01T09:00:00-03:00', 'REALIZADA'),
      consulta('comecou', '2026-10-05T08:30:00-03:00'),
      consulta('futura', '2026-10-06T11:00:00-03:00'),
      consulta('cancelada', '2026-10-07T10:00:00-03:00', 'CANCELADA'),
    ]

    expect(historicoDoPaciente(itens, agora).map((item) => item.id)).toEqual(['cancelada', 'comecou', 'antiga'])
  })
})
