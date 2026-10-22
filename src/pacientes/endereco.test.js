import { describe, expect, it } from 'vitest'
import { ENDERECO_VAZIO, enderecoParaEnviar, enderecoParaFormulario } from './endereco.js'

const completo = {
  cep: '01001-000', logradouro: ' Rua das Flores ', numero: '123', complemento: '',
  bairro: 'Centro', cidade: 'São Paulo', uf: 'sp',
}

describe('enderecoParaEnviar', () => {
  it('tudo em branco → nada a enviar', () => {
    expect(enderecoParaEnviar(ENDERECO_VAZIO)).toEqual({ corpo: null })
    expect(enderecoParaEnviar({ ...ENDERECO_VAZIO, cep: '   ' })).toEqual({ corpo: null })
  })

  it('preenchido pela metade → erro que cita os campos obrigatórios', () => {
    const resultado = enderecoParaEnviar({ ...ENDERECO_VAZIO, cep: '01001000' })
    expect(resultado.corpo).toBeUndefined()
    expect(resultado.erro).toMatch(/CEP, logradouro, número, bairro, cidade e UF/)
  })

  it('só o complemento pode faltar: vai como null; CEP só com dígitos; UF em maiúsculas; textos sem espaços nas pontas', () => {
    expect(enderecoParaEnviar(completo)).toEqual({
      corpo: {
        cep: '01001000', logradouro: 'Rua das Flores', numero: '123', complemento: null,
        bairro: 'Centro', cidade: 'São Paulo', uf: 'SP',
      },
    })
  })

  it('complemento preenchido segue no corpo', () => {
    expect(enderecoParaEnviar({ ...completo, complemento: ' Sala 2 ' }).corpo.complemento).toBe('Sala 2')
  })
})

describe('enderecoParaFormulario', () => {
  it('sem endereço → campos vazios', () => {
    expect(enderecoParaFormulario(null)).toEqual(ENDERECO_VAZIO)
  })

  it('complemento null vira texto vazio', () => {
    const doServidor = { ...completo, cep: '01001000', complemento: null }
    expect(enderecoParaFormulario(doServidor).complemento).toBe('')
  })
})
