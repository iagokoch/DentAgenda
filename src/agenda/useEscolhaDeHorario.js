import { useState } from 'react'
import { useDadosDaApi } from '../api/useDadosDaApi.js'
import { mesDaData } from './calendario.js'

const consultaDaApi = (caminho, parametros) => `${caminho}?${new URLSearchParams(parametros)}`

// Mês, dia e horário de uma marcação, com as vagas da API (dias-disponiveis e horarios-livres). Usado pelo Novo
// Agendamento da clínica (D33) e pela marcação do paciente (D35); quem chama limpa a escolha ao trocar procedimento
// ou dentista.
export function useEscolhaDeHorario({ procedimentoId, dentistaId }) {
  const [mes, setMes] = useState(() => mesDaData(new Date()))
  const [dia, setDia] = useState(null)
  const [horario, setHorario] = useState(null)

  const filtroDeDentista = dentistaId ? { dentistaId } : {}
  const dias = useDadosDaApi(procedimentoId ? consultaDaApi('/api/dias-disponiveis', { procedimentoId, mes, ...filtroDeDentista }) : null)
  const horarios = useDadosDaApi(procedimentoId && dia ? consultaDaApi('/api/horarios-livres', { procedimentoId, data: dia, ...filtroDeDentista }) : null)

  return {
    mes,
    dia,
    horario,
    dias,
    horarios,
    limpar() {
      setDia(null)
      setHorario(null)
    },
    mudarMes(novoMes) {
      setMes(novoMes)
      setDia(null)
      setHorario(null)
    },
    escolherDia(data) {
      setDia(data)
      setHorario(null)
    },
    escolherHorario: setHorario,
    // Depois de um 409 de horário: o horário escolhido não vale mais e as vagas mudaram.
    recarregarVagas() {
      setHorario(null)
      dias.recarregar()
      horarios.recarregar()
    },
  }
}
