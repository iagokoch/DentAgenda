import { criarClienteHttp } from './cliente-http.js'

let aoEncerrarSessao = () => {}

// Único cliente da aplicação: o token em memória precisa ser o mesmo para todas as telas.
export const api = criarClienteHttp({ aoEncerrarSessao: () => aoEncerrarSessao() })

export function quandoSessaoEncerrar(funcao) {
  aoEncerrarSessao = funcao
}
