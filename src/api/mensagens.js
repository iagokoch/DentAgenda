// O 400 ENTRADA_INVALIDA traz as mensagens do Zod, nem sempre em português; a tela usa as suas.
const MENSAGEM_DO_CAMPO = {
  cpf: 'CPF inválido.',
  email: 'E-mail inválido.',
  telefone: 'Telefone só com números, com DDD.',
  senha: 'A senha precisa ter de 8 a 72 caracteres.',
  novaSenha: 'A senha precisa ter de 8 a 72 caracteres.',
  codigo: 'O código tem 6 dígitos.',
  nome: 'Informe o nome.',
  nascimento: 'Data de nascimento inválida.',
}

export function mensagemDoErro(erro) {
  if (erro?.codigo === 'ENTRADA_INVALIDA') {
    const mensagens = [...new Set(erro.campos.map((campo) => MENSAGEM_DO_CAMPO[campo.caminho]).filter(Boolean))]
    return mensagens.length > 0 ? mensagens.join(' ') : 'Confira os dados digitados.'
  }
  return erro?.mensagem ?? 'Algo deu errado. Tente de novo.'
}

export const somenteDigitos = (texto) => texto.replace(/\D/g, '')
