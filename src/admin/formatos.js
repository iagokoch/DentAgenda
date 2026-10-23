import { precoEmReais } from '../agenda/calendario.js'

// D37: preço digitado em reais, com vírgula e ponto de milhar opcional; a API recebe centavos inteiros (D11).
export function centavosDoTexto(texto) {
  const limpo = texto.trim().replace(/\./g, '')
  if (!/^\d+(,\d{1,2})?$/.test(limpo)) return null
  const [reais, centavos = ''] = limpo.split(',')
  return Number(reais) * 100 + Number(centavos.padEnd(2, '0'))
}

export const textoDosCentavos = (centavos) => precoEmReais(centavos)

// D37: o fuso da clínica é fixo em -03:00 (sem horário de verão desde 2019); a API recusa instante sem fuso.
const FUSO_DA_CLINICA = '-03:00'
export const instanteDaClinica = (dataEHora) => `${dataEHora}:00${FUSO_DA_CLINICA}`

// O PATCH leva só o que mudou (docs/api.md).
export function mudancas(antes, depois) {
  return Object.fromEntries(Object.entries(depois).filter(([campo, valor]) => valor !== antes[campo]))
}

// A grade da API é uma lista de faixas; a tela edita um dia por linha (0 = domingo … 6 = sábado, D12).
export function faixasPorDia(grade) {
  const dias = Array.from({ length: 7 }, () => [])
  for (const { diaSemana, inicio, fim } of grade) dias[diaSemana].push({ inicio, fim })
  return dias.map((faixas) => faixas.sort((a, b) => a.inicio.localeCompare(b.inicio)))
}

export function gradeParaEnviar(dias) {
  return dias.flatMap((faixas, diaSemana) =>
    [...faixas].sort((a, b) => a.inicio.localeCompare(b.inicio)).map(({ inicio, fim }) => ({ diaSemana, inicio, fim })),
  )
}
