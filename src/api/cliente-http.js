// Formato de erro de docs/api.md: { erro: { codigo, mensagem, campos } }.
export class ErroDaApi extends Error {
  constructor(status, codigo, mensagem, campos = []) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
    this.mensagem = mensagem
    this.campos = campos
  }
}

const CAMINHO_DO_REFRESH = '/api/auth/refresh'

async function erroDaResposta(resposta) {
  const corpo = await resposta.json().catch(() => null)
  const erro = corpo?.erro
  if (!erro?.codigo) {
    return new ErroDaApi(resposta.status, 'ERRO_INTERNO', 'Não foi possível falar com o servidor. Tente de novo.')
  }
  return new ErroDaApi(resposta.status, erro.codigo, erro.mensagem, erro.campos ?? [])
}

// D19: o access token fica só em memória (nunca em localStorage, onde um script injetado o leria);
// a sessão sobrevive ao recarregar a página pelo cookie httpOnly de refresh.
export function criarClienteHttp({ fetch = (...args) => globalThis.fetch(...args), aoEncerrarSessao = () => {} } = {}) {
  let accessToken = null
  let renovacaoEmAndamento = null

  async function enviar(caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
    const headers = { ...cabecalhos }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (corpo !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await fetch(caminho, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
    } catch {
      throw new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor.')
    }
  }

  async function renovar() {
    const resposta = await enviar(CAMINHO_DO_REFRESH, { metodo: 'POST', cabecalhos: { 'X-DentAgenda-Refresh': '1' } })
    if (!resposta.ok) {
      accessToken = null
      return false
    }
    accessToken = (await resposta.json()).accessToken
    return true
  }

  // Vários pedidos podem receber 401 juntos; todos esperam a mesma renovação,
  // porque o refresh é rotativo e um segundo uso do mesmo cookie derrubaria a sessão (D19).
  function renovarSessao() {
    renovacaoEmAndamento ??= renovar()
      .catch(() => {
        accessToken = null
        return false
      })
      .finally(() => {
        renovacaoEmAndamento = null
      })
    return renovacaoEmAndamento
  }

  async function pedir(caminho, opcoes = {}) {
    let resposta = await enviar(caminho, opcoes)
    if (resposta.status === 401 && accessToken) {
      const erro = await erroDaResposta(resposta)
      if (erro.codigo !== 'NAO_AUTENTICADO') throw erro
      if (!(await renovarSessao())) {
        aoEncerrarSessao()
        throw erro
      }
      resposta = await enviar(caminho, opcoes)
    }
    if (!resposta.ok) throw await erroDaResposta(resposta)
    return resposta.status === 204 ? null : resposta.json()
  }

  return {
    pedir,
    renovarSessao,
    definirToken: (token) => {
      accessToken = token
    },
    temToken: () => accessToken !== null,
  }
}
