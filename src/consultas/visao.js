// Funções puras da tela "Consultas" da clínica (recepção, administração e dentista).

// Datas AAAA-MM-DD, sempre calculadas ao meio-dia UTC: não dependem do fuso do navegador.
export function deslocarDia(data, dias) {
  const instante = new Date(`${data}T12:00:00Z`)
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}

export const diaPorExtenso = (data) =>
  new Date(`${data}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

// Confirmada cujo horário já terminou: falta a clínica marcar como realizada (D13, "pendentes").
export const aguardaRegistro = (consulta, agora) => consulta.status === 'CONFIRMADA' && Date.parse(consulta.fim) <= agora.getTime()

// Uma coluna por dentista da lista (mesmo sem consulta no dia) e por dentista que só aparece nas consultas.
export function colunasPorDentista(dentistas, consultas) {
  const colunas = new Map(dentistas.map((dentista) => [dentista.id, { id: dentista.id, nome: dentista.nome, consultas: [] }]))
  for (const consulta of consultas) {
    if (!colunas.has(consulta.dentista.id)) colunas.set(consulta.dentista.id, { id: consulta.dentista.id, nome: consulta.dentista.nome, consultas: [] })
    colunas.get(consulta.dentista.id).consultas.push(consulta)
  }
  const lista = [...colunas.values()]
  for (const coluna of lista) coluna.consultas.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  return lista
}

const semAcento = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarPorPaciente(consultas, termo) {
  const busca = semAcento(termo.trim())
  return busca ? consultas.filter((consulta) => semAcento(consulta.paciente.nome).includes(busca)) : consultas
}
