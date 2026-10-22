import { createContext, useContext } from 'react'

export const SessaoContexto = createContext(null)

export function useSessao() {
  return useContext(SessaoContexto)
}

// Funcionário vai para as telas da clínica; paciente, para a área dele (D35).
export function telaInicialDe(usuario) {
  return usuario.tipo === 'FUNCIONARIO' ? '/inicio' : '/minha-conta'
}

// Papéis do docs/api.md (D10) usados pelas rotas e pelo menu do front (D37). Admin é flag somada à categoria.
export const ehAdmin = (usuario) => usuario.isAdmin === true
export const ehRecepcao = (usuario) => usuario.categoria === 'RECEPCIONISTA'
