// Formatação só para exibir: a API guarda CPF, telefone e CEP apenas com dígitos (docs/api.md).
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function formatarCpf(cpf) {
  return /^\d{11}$/.test(cpf) ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf
}

export function formatarTelefone(telefone) {
  if (/^\d{11}$/.test(telefone)) return telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (/^\d{10}$/.test(telefone)) return telefone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return telefone
}

export function formatarCep(cep) {
  return /^\d{8}$/.test(cep) ? cep.replace(/(\d{5})(\d{3})/, '$1-$2') : cep
}

// Datas chegam como 'AAAA-MM-DD' ou ISO com fuso; vale o dia escrito no texto (já está no fuso da clínica).
const partesDaData = (texto) => texto.slice(0, 10).split('-').map(Number)

export function dataLonga(data) {
  const [ano, mes, dia] = partesDaData(data)
  return `${dia} de ${MESES[mes - 1]}, ${ano}`
}

export function desdeLongo(data) {
  const [ano, mes] = partesDaData(data)
  return `${MESES[mes - 1]}, ${ano}`
}

export function dataBR(data) {
  const [ano, mes, dia] = partesDaData(data)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
}

export function idade(nascimento, hoje = new Date()) {
  const [ano, mes, dia] = partesDaData(nascimento)
  const aniversarioJaPassou = hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia)
  return hoje.getFullYear() - ano - (aniversarioJaPassou ? 0 : 1)
}

export const iniciais = (nome) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

// A busca por CPF é exata: CPF digitado com pontos e traço vira só dígitos antes de ir para a API.
export function termoDeBusca(texto) {
  const limpo = texto.trim()
  const digitos = limpo.replace(/\D/g, '')
  return /^[\d.\-\s]+$/.test(limpo) && digitos.length === 11 ? digitos : limpo
}

export function enderecoEmLinhas(endereco) {
  if (!endereco) return []
  const rua = [endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(', ')
  return [`${rua} — ${endereco.bairro}`, `${endereco.cidade} - ${endereco.uf} · CEP ${formatarCep(endereco.cep)}`]
}
