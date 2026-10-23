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
  pacienteDesde: 'Data de "paciente desde" inválida.',
  convenio: 'Convênio inválido.',
  cep: 'CEP com 8 números.',
  logradouro: 'Informe o logradouro.',
  numero: 'Informe o número.',
  bairro: 'Informe o bairro.',
  cidade: 'Informe a cidade.',
  uf: 'UF com 2 letras.',
  texto: 'Escreva o alerta.',
  // Administração e disponibilidade (D37)
  cro: 'Informe o CRO.',
  dataInicio: 'Data de início inválida.',
  categoria: 'Escolha a categoria.',
  duracaoMinutos: 'Duração em minutos, maior que zero.',
  precoCentavos: 'Preço inválido.',
  inicio: 'Confira o início e o fim.',
  fim: 'Confira o início e o fim.',
  dentistaIds: 'Escolha pelo menos um dentista.',
}

// Campo aninhado vem como "endereco.cep": vale o último pedaço.
const ultimoPedaco = (caminho) => caminho.split('.').pop()

export function mensagemDoErro(erro) {
  if (erro?.codigo === 'ENTRADA_INVALIDA') {
    const mensagens = [...new Set(erro.campos.map((campo) => MENSAGEM_DO_CAMPO[ultimoPedaco(campo.caminho)]).filter(Boolean))]
    return mensagens.length > 0 ? mensagens.join(' ') : 'Confira os dados digitados.'
  }
  return erro?.mensagem ?? 'Algo deu errado. Tente de novo.'
}

// Erros 409 de docs/api.md ("Erros de horário"): todos pedem para escolher outro horário.
const MENSAGEM_DO_HORARIO = {
  HORARIO_INDISPONIVEL: 'Esse horário acabou de ser ocupado. Escolha outro horário.',
  PACIENTE_COM_CONSULTA_NO_HORARIO: 'O paciente já tem uma consulta nesse horário. Escolha outro horário.',
  FORA_DA_GRADE: 'Esse horário está fora da agenda do dentista. Escolha outro horário.',
  HORARIO_BLOQUEADO: 'O dentista não atende nesse horário. Escolha outro horário.',
  FORA_DO_PASSO: 'Esse horário não é um dos oferecidos. Escolha outro horário.',
  FORA_DOS_5_MINUTOS: 'O horário precisa estar em múltiplos de 5 minutos. Escolha outro horário.',
}

// null quando o erro não é de horário: a tela mostra então a mensagem comum.
export const mensagemDoHorario = (erro) => (erro?.status === 409 ? (MENSAGEM_DO_HORARIO[erro.codigo] ?? null) : null)

export const somenteDigitos = (texto) => texto.replace(/\D/g, '')
