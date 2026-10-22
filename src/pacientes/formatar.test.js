import { describe, expect, it } from 'vitest'
import {
  dataBR,
  dataLonga,
  desdeLongo,
  enderecoEmLinhas,
  formatarCep,
  formatarCpf,
  formatarTelefone,
  idade,
  iniciais,
  termoDeBusca,
} from './formatar.js'

describe('formatarCpf', () => {
  it('põe pontos e traço em 11 dígitos', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
  })
  it('devolve o texto como veio se não tem 11 dígitos', () => {
    expect(formatarCpf('123')).toBe('123')
  })
})

describe('formatarTelefone', () => {
  it('celular de 11 dígitos', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321')
  })
  it('fixo de 10 dígitos', () => {
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890')
  })
  it('devolve o texto como veio se o tamanho não bate', () => {
    expect(formatarTelefone('987')).toBe('987')
  })
})

describe('formatarCep', () => {
  it('põe o traço em 8 dígitos', () => {
    expect(formatarCep('01001000')).toBe('01001-000')
  })
})

describe('datas', () => {
  it('dataLonga: AAAA-MM-DD → "15 de Maio, 1985"', () => {
    expect(dataLonga('1985-05-15')).toBe('15 de Maio, 1985')
  })
  it('desdeLongo: mês e ano', () => {
    expect(desdeLongo('2022-03-01')).toBe('Março, 2022')
  })
  it('dataBR aceita data pura e data com hora e fuso (usa o dia que veio no texto)', () => {
    expect(dataBR('2026-10-05')).toBe('05/10/2026')
    expect(dataBR('2026-10-05T23:30:00-03:00')).toBe('05/10/2026')
  })
})

describe('idade', () => {
  const hoje = new Date('2026-10-21T12:00:00Z')
  it('já fez aniversário no ano', () => {
    expect(idade('1985-05-15', hoje)).toBe(41)
  })
  it('ainda não fez aniversário no ano', () => {
    expect(idade('1985-12-25', hoje)).toBe(40)
  })
  it('faz aniversário hoje', () => {
    expect(idade('1985-10-21', hoje)).toBe(41)
  })
})

describe('iniciais', () => {
  it('primeira letra das duas primeiras palavras, em maiúscula', () => {
    expect(iniciais('marcos de oliveira')).toBe('MD')
    expect(iniciais('Ana')).toBe('A')
    expect(iniciais('  ')).toBe('')
  })
})

describe('termoDeBusca', () => {
  it('CPF digitado com pontuação vira só dígitos', () => {
    expect(termoDeBusca(' 529.982.247-25 ')).toBe('52998224725')
  })
  it('nome segue como texto, sem espaços nas pontas', () => {
    expect(termoDeBusca('  José da Silva ')).toBe('José da Silva')
  })
  it('número com tamanho diferente de 11 não é tratado como CPF', () => {
    expect(termoDeBusca('123.456')).toBe('123.456')
  })
})

describe('enderecoEmLinhas', () => {
  const base = {
    cep: '01001000', logradouro: 'Rua das Flores', numero: '123', complemento: null,
    bairro: 'Centro', cidade: 'São Paulo', uf: 'SP',
  }
  it('monta duas linhas, com complemento quando existe', () => {
    expect(enderecoEmLinhas(base)).toEqual(['Rua das Flores, 123 — Centro', 'São Paulo - SP · CEP 01001-000'])
    expect(enderecoEmLinhas({ ...base, complemento: 'Sala 2' })[0]).toBe('Rua das Flores, 123, Sala 2 — Centro')
  })
  it('sem endereço devolve lista vazia', () => {
    expect(enderecoEmLinhas(null)).toEqual([])
  })
})
