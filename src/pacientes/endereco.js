import { somenteDigitos } from '../api/mensagens.js'

export const ENDERECO_VAZIO = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }
const CAMPOS_OBRIGATORIOS = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf']

const algumPreenchido = (endereco) => Object.values(endereco).some((valor) => valor.trim() !== '')

// Endereço da API (complemento pode ser null) → valores de campo de formulário.
export function enderecoParaFormulario(endereco) {
  return endereco ? { ...ENDERECO_VAZIO, ...endereco, complemento: endereco.complemento ?? '' } : { ...ENDERECO_VAZIO }
}

// Endereço é tudo ou nada (docs/api.md): se algum campo foi preenchido, só o complemento pode faltar.
// { corpo: null } = nada preenchido; { erro } = preenchido pela metade; { corpo } = pronto para o PUT/POST.
export function enderecoParaEnviar(endereco) {
  if (!algumPreenchido(endereco)) return { corpo: null }
  if (CAMPOS_OBRIGATORIOS.some((campo) => endereco[campo].trim() === '')) {
    return { erro: 'Para salvar o endereço, preencha CEP, logradouro, número, bairro, cidade e UF.' }
  }
  return {
    corpo: {
      cep: somenteDigitos(endereco.cep),
      logradouro: endereco.logradouro.trim(),
      numero: endereco.numero.trim(),
      complemento: endereco.complemento.trim() || null,
      bairro: endereco.bairro.trim(),
      cidade: endereco.cidade.trim(),
      uf: endereco.uf.trim().toUpperCase(),
    },
  }
}
