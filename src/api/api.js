import { criarClienteHttp } from './cliente-http.js'
import { lerSaidaLocal } from '../sessao/saida-pendente.js'

let aoEncerrarSessao = () => {}

// Único cliente da aplicação: o token em memória precisa ser o mesmo para todas as telas.
export const api = criarClienteHttp({
  aoEncerrarSessao: () => aoEncerrarSessao(),
  restauracaoPermitida: () => lerSaidaLocal().saida === null,
})

export function quandoSessaoEncerrar(funcao) {
  aoEncerrarSessao = funcao
  return () => { if (aoEncerrarSessao === funcao) aoEncerrarSessao = () => {} }
}
