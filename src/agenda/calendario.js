// Meses são 'AAAA-MM' e dias 'AAAA-MM-DD', como na API (docs/api.md). Datas em UTC só para contar dias:
// o fuso do navegador não pode deslocar o calendário.
const NOMES_DOS_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const partesDoMes = (mes) => mes.split('-').map(Number)

export function mesDaData(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

export function deslocarMes(mes, deslocamento) {
  const [ano, numero] = partesDoMes(mes)
  return mesDaData(new Date(ano, numero - 1 + deslocamento, 1))
}

export function nomeDoMes(mes) {
  const [ano, numero] = partesDoMes(mes)
  return `${NOMES_DOS_MESES[numero - 1]} ${ano}`
}

export function quantidadeDeDias(mes) {
  const [ano, numero] = partesDoMes(mes)
  return new Date(Date.UTC(ano, numero, 0)).getUTCDate()
}

export function posicaoDoPrimeiroDia(mes) {
  const [ano, numero] = partesDoMes(mes)
  return new Date(Date.UTC(ano, numero - 1, 1)).getUTCDay()
}

export const dataDoDia = (mes, dia) => `${mes}-${String(dia).padStart(2, '0')}`

export const diaDoMes = (data) => Number(data.slice(8, 10))

// O instante da API já vem no fuso da clínica; vale a hora escrita no texto.
export const horaDoInstante = (instante) => instante.slice(11, 16)

export const precoEmReais = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dataDeHoje = (agora = new Date()) => dataDoDia(mesDaData(agora), agora.getDate())

// "05/10/2026 às 09:30", a partir do instante da API.
export const dataEHoraLegiveis = (instante) => {
  const [ano, mes, dia] = instante.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano} às ${horaDoInstante(instante)}`
}
