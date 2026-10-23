// Regras de tela da área do paciente (D35). Quem decide de verdade é a API; aqui só o que a tela mostra.
const VINTE_E_QUATRO_HORAS_EM_MS = 24 * 60 * 60 * 1000

export const jaComecou = (consulta, agora) => Date.parse(consulta.inicio) <= agora.getTime()

// Com menos de 24 h, o paciente só cancela com justificativa (D14; exatamente 24 h ainda não exige).
export const faltamMenosDe24Horas = (consulta, agora) => Date.parse(consulta.inicio) - agora.getTime() < VINTE_E_QUATRO_HORAS_EM_MS

const eProxima = (consulta, agora) => consulta.status === 'CONFIRMADA' && !jaComecou(consulta, agora)

// A API devolve em ordem de início: as próximas ficam da mais perto para a mais longe.
export const proximasDoPaciente = (itens, agora) => itens.filter((consulta) => eProxima(consulta, agora))

export const historicoDoPaciente = (itens, agora) => itens.filter((consulta) => !eProxima(consulta, agora)).reverse()
