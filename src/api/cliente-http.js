import { coordenacaoDaSessao } from './coordenacao-de-sessao.js'

// Formato de erro de docs/api.md: { erro: { codigo, mensagem, campos } }. Campos a mais de um erro específico
// (ex.: `consultas` do 409 CONSULTAS_NO_PERIODO) ficam em `detalhes`.
export class ErroDaApi extends Error {
  constructor(status, codigo, mensagem, campos = [], detalhes = {}) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
    this.mensagem = mensagem
    this.campos = campos
    this.detalhes = detalhes
  }
}

const CAMINHO_DO_REFRESH = '/api/auth/refresh'
// Sem limite, um servidor que não responde deixa a tela em "carregando" para sempre.
const TEMPO_LIMITE_EM_MS = 30_000
const INICIA_SESSAO = new Set(['/api/auth/cliente/login', '/api/auth/funcionario/login', '/api/auth/cliente/cadastro/confirmar'])

async function erroDaResposta(resposta) {
  const corpo = await resposta.json().catch(() => null)
  const erro = corpo?.erro
  if (!erro?.codigo) {
    return new ErroDaApi(resposta.status, 'ERRO_INTERNO', 'Não foi possível falar com o servidor. Tente de novo.')
  }
  const { codigo, mensagem, campos, ...detalhes } = erro
  return new ErroDaApi(resposta.status, codigo, mensagem, campos ?? [], detalhes)
}

// D19: o access token fica só em memória (nunca em localStorage, onde um script injetado o leria);
// a sessão sobrevive ao recarregar a página pelo cookie httpOnly de refresh.
export function criarClienteHttp({ fetch = (...args) => globalThis.fetch(...args), aoEncerrarSessao = () => {},
  coordenacao = coordenacaoDaSessao, restauracaoPermitida = () => true } = {}) {
  let accessToken = null
  let renovacaoEmAndamento = null
  let saidaEmAndamento = null
  let geracao = 0
  let restauracaoBloqueada = false

  async function enviar(caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}, token = accessToken) {
    const headers = { ...cabecalhos }
    if (token) headers.Authorization = `Bearer ${token}`
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await fetch(caminho, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
      })
    } catch {
      throw new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor.')
    }
  }

  // O resultado pode ser usado somente para revogar, sem tornar o token visível à sessão normal.
  async function renovar() {
    const resposta = await enviar(CAMINHO_DO_REFRESH, { metodo: 'POST', cabecalhos: { 'X-DentAgenda-Refresh': '1' } }, null)
    if (resposta.status === 401) {
      const erro = await erroDaResposta(resposta)
      if (erro.codigo === 'NAO_AUTENTICADO') return null
      throw erro
    }
    if (!resposta.ok) throw await erroDaResposta(resposta)
    const corpo = await resposta.json().catch(() => null)
    if (!corpo?.accessToken) throw new ErroDaApi(502, 'ERRO_INTERNO', 'Não foi possível confirmar a sessão no servidor.')
    return corpo.accessToken
  }

  // Vários pedidos podem receber 401 juntos; todos esperam a mesma renovação,
  // porque o refresh é rotativo e um segundo uso do mesmo cookie derrubaria a sessão (D19).
  function obterRefresh() {
    if (!renovacaoEmAndamento) {
      const pedido = coordenacao.executar(() => {
        if (restauracaoBloqueada || !restauracaoPermitida()) return Promise.resolve(null)
        return renovar()
      }).finally(() => {
        if (renovacaoEmAndamento === pedido) renovacaoEmAndamento = null
      })
      renovacaoEmAndamento = pedido
    }
    return renovacaoEmAndamento
  }

  function renovarSessao() {
    if (restauracaoBloqueada) return Promise.resolve(false)
    const inicio = geracao
    return obterRefresh().then((token) => {
      if (inicio !== geracao || restauracaoBloqueada) return false
      if (!restauracaoPermitida()) { bloquearRestauracao(); return false }
      accessToken = token
      return token !== null
    })
  }

  function conferirGeracao(inicio) {
    if (inicio !== geracao) throw new ErroDaApi(401, 'NAO_AUTENTICADO', 'Sessão encerrada neste navegador.')
  }

  async function pedir(caminho, opcoes = {}) {
    // Um login novo não pode disputar o cookie com uma revogação ainda pendente.
    if (INICIA_SESSAO.has(caminho) && saidaEmAndamento) {
      await saidaEmAndamento.catch(() => {})
    }
    if (INICIA_SESSAO.has(caminho)) return coordenacao.executar(() => pedirNaSessao(caminho, opcoes, true))
    return pedirNaSessao(caminho, opcoes)
  }

  async function pedirNaSessao(caminho, opcoes, iniciaSessao = false) {
    const inicio = geracao
    let resposta = await enviar(caminho, opcoes, iniciaSessao ? null : accessToken)
    conferirGeracao(inicio)
    if (resposta.status === 401 && accessToken && !iniciaSessao) {
      const erro = await erroDaResposta(resposta)
      conferirGeracao(inicio)
      if (erro.codigo !== 'NAO_AUTENTICADO') throw erro
      const renovada = await renovarSessao()
      conferirGeracao(inicio)
      if (!renovada) {
        aoEncerrarSessao()
        throw erro
      }
      resposta = await enviar(caminho, opcoes)
      conferirGeracao(inicio)
    }
    if (!resposta.ok) throw await erroDaResposta(resposta)
    const corpo = resposta.status === 204 ? null : await resposta.json()
    conferirGeracao(inicio)
    return corpo
  }

  function bloquearRestauracao() {
    geracao += 1
    restauracaoBloqueada = true
    accessToken = null
  }

  async function revogarToken(token) {
    const resposta = await enviar('/api/auth/logout', { metodo: 'POST' }, token)
    if (!resposta.ok) throw await erroDaResposta(resposta)
    if (resposta.status !== 204) throw new ErroDaApi(502, 'ERRO_INTERNO', 'O servidor não confirmou o encerramento.')
  }

  async function limparTokensAnteriores(tokens, atual) {
    for (const token of new Set(tokens.filter((valor) => valor && valor !== atual))) {
      try { await revogarToken(token) } catch (erro) {
        if (erro.status !== 401 || erro.codigo !== 'NAO_AUTENTICADO') throw erro
      }
    }
  }

  async function revogar(tokensAnteriores) {
    // O cookie pode ter mudado enquanto esperávamos a trava. Tokens capturados servem só para limpeza adicional.
    const atual = await renovar()
    if (atual) await revogarToken(atual)
    await limparTokensAnteriores(tokensAnteriores, atual)
    if (!atual) throw new ErroDaApi(401, 'NAO_AUTENTICADO', 'Não foi possível confirmar o encerramento no servidor.')
  }

  function encerrarSessao() {
    if (saidaEmAndamento) return saidaEmAndamento
    const token = accessToken
    const refreshAnterior = renovacaoEmAndamento
    bloquearRestauracao()
    // Reservar a posição imediatamente impede que um login posterior ultrapasse a saída.
    const pedido = coordenacao.executar(async () => {
      // Esse refresh já entrou na fila antes desta saída: esperá-lo aqui não adquire outra trava.
      const renovado = refreshAnterior ? await refreshAnterior.catch(() => null) : null
      await revogar([token, renovado])
      return coordenacao.entreAbas
    }).finally(() => {
      if (saidaEmAndamento === pedido) saidaEmAndamento = null
    })
    saidaEmAndamento = pedido
    return pedido
  }

  return {
    pedir,
    renovarSessao,
    bloquearRestauracao,
    encerrarSessao,
    definirToken: (token) => {
      geracao += 1
      restauracaoBloqueada = false
      accessToken = token
    },
    temToken: () => accessToken !== null,
  }
}
