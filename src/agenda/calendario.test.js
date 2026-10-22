import { describe, expect, it } from 'vitest'
import { mensagemDoHorario } from '../api/mensagens.js'
import { dataDeHoje, dataEHoraLegiveis, diaDoMes, dataDoDia, deslocarMes, horaDoInstante, mesDaData, nomeDoMes, posicaoDoPrimeiroDia, precoEmReais, quantidadeDeDias } from './calendario.js'

describe('calendário do agendamento', () => {
  it('mesDaData devolve AAAA-MM', () => {
    expect(mesDaData(new Date(2026, 9, 22))).toBe('2026-10')
  })

  it('deslocarMes passa de dezembro para janeiro e de janeiro para dezembro', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
    expect(deslocarMes('2026-10', 1)).toBe('2026-11')
  })

  it('nomeDoMes escreve o mês por extenso', () => {
    expect(nomeDoMes('2026-10')).toBe('Outubro 2026')
  })

  it('quantidadeDeDias respeita mês de 30, 31 e fevereiro bissexto', () => {
    expect(quantidadeDeDias('2026-10')).toBe(31)
    expect(quantidadeDeDias('2026-11')).toBe(30)
    expect(quantidadeDeDias('2028-02')).toBe(29)
  })

  it('posicaoDoPrimeiroDia conta de domingo (0) a sábado (6)', () => {
    expect(posicaoDoPrimeiroDia('2026-10')).toBe(4)
  })

  it('dataDoDia e diaDoMes são inversos', () => {
    expect(dataDoDia('2026-10', 5)).toBe('2026-10-05')
    expect(diaDoMes('2026-10-05')).toBe(5)
  })

  it('horaDoInstante lê a hora escrita no texto, sem converter fuso', () => {
    expect(horaDoInstante('2026-10-05T09:30:00-03:00')).toBe('09:30')
  })

  it('dataDeHoje devolve AAAA-MM-DD com zero à esquerda', () => {
    expect(dataDeHoje(new Date(2026, 9, 5))).toBe('2026-10-05')
  })

  it('dataEHoraLegiveis escreve dia/mês/ano às hora', () => {
    expect(dataEHoraLegiveis('2026-10-05T09:30:00-03:00')).toBe('05/10/2026 às 09:30')
  })

  it('precoEmReais formata centavos em reais', () => {
    expect(precoEmReais(18000)).toBe('180,00')
    expect(precoEmReais(0)).toBe('0,00')
    expect(precoEmReais(123456)).toBe('1.234,56')
  })
})

describe('mensagemDoHorario', () => {
  it.each([
    'HORARIO_INDISPONIVEL',
    'PACIENTE_COM_CONSULTA_NO_HORARIO',
    'FORA_DA_GRADE',
    'HORARIO_BLOQUEADO',
    'FORA_DO_PASSO',
    'FORA_DOS_5_MINUTOS',
  ])('%s leva a escolher outro horário', (codigo) => {
    expect(mensagemDoHorario({ status: 409, codigo })).toMatch(/horário/i)
  })

  it('devolve null para erro que não é de horário', () => {
    expect(mensagemDoHorario({ status: 422, codigo: 'DENTISTA_INATIVO' })).toBeNull()
    expect(mensagemDoHorario(new Error('x'))).toBeNull()
  })
})
