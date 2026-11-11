import { describe, expect, it } from 'vitest'
import { centavosDoTexto, faixasPorDia, gradeParaEnviar, instanteDaClinica, mudancas, textoDosCentavos } from './formatos.js'

describe('formatos da administração (D37)', () => {
  it('preço digitado em reais vira centavos inteiros', () => {
    expect(centavosDoTexto('180,00')).toBe(18000)
    expect(centavosDoTexto('180')).toBe(18000)
    expect(centavosDoTexto(' 1.250,5 ')).toBe(125050)
    expect(centavosDoTexto('0')).toBe(0)
  })

  it('preço inválido vira null', () => {
    for (const texto of ['', 'abc', '-10', '10,999', '1,2,3']) expect(centavosDoTexto(texto)).toBeNull()
  })

  it.each([
    ['12,50', 1250], ['12,5', 1250], ['1.250,00', 125000], ['1.250', 125000],
    ['1250', 125000], ['1.234.567,89', 123456789], [' 1.250,5 ', 125050],
    ['0,01', 1], ['0,1', 10], ['0,00', 0], ['00012,50', 1250], ['1234,56', 123456],
  ])('preserva o preço brasileiro %s como %i centavos', (texto, centavos) => {
    expect(centavosDoTexto(texto)).toBe(centavos)
  })

  it.each([
    '12.50', '1.5', '12.34,56', '1..250', '1.250.', '.125', '125.',
    '1234.567', '1.23.456', '1,250.00', '1.250,000', '1 250,00', '1.250,',
  ])('recusa separadores inválidos em %s antes de converter', (texto) => {
    expect(centavosDoTexto(texto)).toBeNull()
  })

  it('preços formatados para edição voltam ao mesmo valor em centavos', () => {
    for (const centavos of [0, 1, 10, 1250, 125000, 123456789]) {
      expect(centavosDoTexto(textoDosCentavos(centavos))).toBe(centavos)
    }
  })

  it('centavos voltam para o texto do campo', () => {
    expect(textoDosCentavos(18000)).toBe('180,00')
    expect(textoDosCentavos(125050)).toBe('1.250,50')
  })

  it('instante do formulário ganha o fuso da clínica', () => {
    expect(instanteDaClinica('2026-12-24T08:30')).toBe('2026-12-24T08:30:00-03:00')
  })

  it('mudancas: só os campos que mudaram', () => {
    expect(mudancas({ nome: 'Ana', cro: 'SP-1', isAdmin: false }, { nome: 'Ana', cro: 'SP-2', isAdmin: true })).toEqual({ cro: 'SP-2', isAdmin: true })
    expect(mudancas({ nome: 'Ana' }, { nome: 'Ana' })).toEqual({})
  })

  it('grade: agrupa por dia da semana e volta ordenada para a API', () => {
    const grade = [
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 3, inicio: '14:00', fim: '18:00' },
      { diaSemana: 1, inicio: '14:00', fim: '18:00' },
    ]

    const dias = faixasPorDia(grade)

    expect(dias).toHaveLength(7)
    expect(dias[1]).toEqual([{ inicio: '08:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }])
    expect(dias[0]).toEqual([])
    dias[1] = [{ inicio: '14:00', fim: '18:00' }, { inicio: '08:00', fim: '12:00' }]
    expect(gradeParaEnviar(dias)).toEqual([
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 1, inicio: '14:00', fim: '18:00' },
      { diaSemana: 3, inicio: '14:00', fim: '18:00' },
    ])
  })
})
