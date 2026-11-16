import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { centavosDoTexto, textoDosCentavos, faixasPorDia, gradeParaEnviar } from '../admin/formatos.js'
import { deslocarMes } from '../agenda/calendario.js'
import { formatarCpf, formatarTelefone, formatarCep, termoDeBusca } from '../pacientes/formatar.js'
import { proximasDoPaciente, historicoDoPaciente, faltamMenosDe24Horas } from '../minha-conta/consultas-do-paciente.js'

const opcoes = { seed: 20261112, numRuns: 250 }
const digitos = (quantidade) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: quantidade, maxLength: quantidade }).map((itens) => itens.join(''))

describe('Break-It: propriedades do frontend (seed 20261112)', () => {
  it('preços persistíveis sobrevivem à formatação e edição sem perder centavos', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2147483647 }), (valor) => {
      expect(centavosDoTexto(textoDosCentavos(valor))).toBe(valor)
    }), opcoes)
  })

  it('agrupar a grade por dia conserva faixas e não altera a entrada', () => {
    const faixa = fc.record({ diaSemana: fc.integer({ min: 0, max: 6 }), inicio: fc.constantFrom('08:00', '09:30', '14:00'), fim: fc.constantFrom('10:00', '12:00', '18:00') })
    fc.assert(fc.property(fc.array(faixa, { maxLength: 30 }), (grade) => {
      const original = structuredClone(grade)
      const ordenar = (itens) => [...itens].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      expect(ordenar(gradeParaEnviar(faixasPorDia(grade)))).toEqual(ordenar(grade))
      expect(grade).toEqual(original)
    }), opcoes)
  })

  it('deslocar o calendário e retornar conserva o mês, inclusive viradas de ano', () => {
    fc.assert(fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: -120, max: 120 }), (ano, mes, deslocamento) => {
      const inicial = `${ano}-${String(mes).padStart(2, '0')}`
      expect(deslocarMes(deslocarMes(inicial, deslocamento), -deslocamento)).toBe(inicial)
    }), opcoes)
  })

  it('máscaras de contato preservam dígitos e busca exata de CPF', () => {
    fc.assert(fc.property(digitos(11), digitos(10), digitos(8), (cpf, telefone, cep) => {
      expect(termoDeBusca(formatarCpf(cpf))).toBe(cpf)
      expect(formatarTelefone(telefone).replace(/\D/g, '')).toBe(telefone)
      expect(formatarTelefone(cpf).replace(/\D/g, '')).toBe(cpf)
      expect(formatarCep(cep).replace(/\D/g, '')).toBe(cep)
    }), opcoes)
  })

  it('próximas e histórico particionam todos os estados sem perder consultas', () => {
    const agora = new Date('2026-10-05T12:00:00Z')
    const consulta = fc.record({ status: fc.constantFrom('CONFIRMADA', 'CANCELADA', 'REALIZADA'), deslocamento: fc.integer({ min: -100000, max: 100000 }) })
    fc.assert(fc.property(fc.array(consulta, { maxLength: 60 }), (entradas) => {
      const consultas = entradas.map(({ status, deslocamento }, id) => ({ id, status, inicio: new Date(agora.getTime() + deslocamento * 60000).toISOString() }))
      const original = structuredClone(consultas)
      const proximas = proximasDoPaciente(consultas, agora)
      const historico = historicoDoPaciente(consultas, agora)
      expect([...proximas, ...historico].map(({ id }) => id).sort((a, b) => a - b)).toEqual(consultas.map(({ id }) => id))
      expect(proximas.every((item) => item.status === 'CONFIRMADA' && Date.parse(item.inicio) > agora.getTime())).toBe(true)
      expect(consultas).toEqual(original)
    }), opcoes)
  })

  it('justificativa das 24 horas muda estritamente no limite documentado', () => {
    const agora = new Date('2026-10-05T12:00:00Z')
    fc.assert(fc.property(fc.integer({ min: -60000, max: 60000 }), (delta) => {
      const consulta = { inicio: new Date(agora.getTime() + 86400000 + delta).toISOString() }
      expect(faltamMenosDe24Horas(consulta, agora)).toBe(delta < 0)
    }), opcoes)
  })
})
