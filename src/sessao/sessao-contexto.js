import { createContext, useContext } from 'react'

export const SessaoContexto = createContext(null)

export function useSessao() {
  return useContext(SessaoContexto)
}

// Funcionário vai para as telas da clínica; paciente, para a área dele (D30, em aberto).
export function telaInicialDe(usuario) {
  return usuario.tipo === 'FUNCIONARIO' ? '/inicio' : '/minha-conta'
}
