export const CHAVE_DA_SAIDA = 'dentagenda_saida_local'

export function lerSaidaLocal() {
  try {
    const valor = localStorage.getItem(CHAVE_DA_SAIDA)
    // Alguns navegadores deixam ler, mas recusam gravar. Não presumir ausência de uma saída nesses casos.
    const verificacao = `${CHAVE_DA_SAIDA}_verificacao`
    localStorage.setItem(verificacao, '1')
    localStorage.removeItem(verificacao)
    return { saida: valor === null ? null : valor === 'confirmada' ? 'confirmada' : 'pendente', armazenamentoDisponivel: true }
  } catch {
    // Sem conseguir ler o marcador, restaurar pelo cookie poderia contrariar uma saída anterior.
    return { saida: 'pendente', armazenamentoDisponivel: false }
  }
}

export function registrarSaidaLocal(saida) {
  try {
    if (saida === null) localStorage.removeItem(CHAVE_DA_SAIDA)
    else localStorage.setItem(CHAVE_DA_SAIDA, saida)
    return true
  } catch {
    return false
  }
}
