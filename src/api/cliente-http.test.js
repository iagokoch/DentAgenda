import { describe, expect, it, vi } from 'vitest'
import { criarClienteHttp, ErroDaApi } from './cliente-http.js'

const json = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const naoAutenticado = () => json(401, { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Faça login novamente.' } })

// fetch falso: responde pela ordem da fila e guarda cada chamada.
function fetchFalso(...respostas) {
  const fila = [...respostas]
  const chamadas = []
  const fetch = vi.fn(async (caminho, opcoes = {}) => {
    chamadas.push({ caminho, opcoes, autorizacao: new Headers(opcoes.headers).get('Authorization') })
    const proxima = fila.shift()
    if (!proxima) throw new Error(`sem resposta preparada para ${caminho}`)
    return proxima
  })
  return { fetch, chamadas }
}

describe('cliente HTTP', () => {
  it('manda o token em Authorization e devolve o JSON da resposta', async () => {
    const { fetch, chamadas } = fetchFalso(json(200, { usuario: { nome: 'Ana' } }))
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('token-1')

    const resposta = await cliente.pedir('/api/auth/eu')

    expect(resposta).toEqual({ usuario: { nome: 'Ana' } })
    expect(chamadas[0].autorizacao).toBe('Bearer token-1')
  })

  it('sem token não manda Authorization; corpo vai em JSON', async () => {
    const { fetch, chamadas } = fetchFalso(json(200, {}))
    const cliente = criarClienteHttp({ fetch })

    await cliente.pedir('/api/auth/cliente/login', { metodo: 'POST', corpo: { cpf: '1' } })

    expect(chamadas[0].autorizacao).toBeNull()
    expect(chamadas[0].opcoes.method).toBe('POST')
    expect(JSON.parse(chamadas[0].opcoes.body)).toEqual({ cpf: '1' })
    expect(new Headers(chamadas[0].opcoes.headers).get('Content-Type')).toBe('application/json')
  })

  it('204 devolve null', async () => {
    const { fetch } = fetchFalso(new Response(null, { status: 204 }))
    const cliente = criarClienteHttp({ fetch })

    expect(await cliente.pedir('/api/auth/logout', { metodo: 'POST' })).toBeNull()
  })

  it('erro da API vira ErroDaApi com status, código, mensagem e campos', async () => {
    const campos = [{ caminho: 'cpf', mensagem: 'CPF inválido.' }]
    const { fetch } = fetchFalso(json(400, { erro: { codigo: 'ENTRADA_INVALIDA', mensagem: 'Dados inválidos.', campos } }))
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.pedir('/api/auth/cliente/login', { metodo: 'POST', corpo: {} }).catch((e) => e)

    expect(erro).toBeInstanceOf(ErroDaApi)
    expect(erro).toMatchObject({ status: 400, codigo: 'ENTRADA_INVALIDA', mensagem: 'Dados inválidos.', campos })
  })

  it('erro sem corpo JSON (proxy sem backend) vira ERRO_INTERNO', async () => {
    const { fetch } = fetchFalso(new Response('Bad Gateway', { status: 502 }))
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.pedir('/api/auth/eu').catch((e) => e)

    expect(erro).toMatchObject({ status: 502, codigo: 'ERRO_INTERNO', campos: [] })
    expect(erro.mensagem).toEqual(expect.any(String))
  })

  it('falha de rede vira SEM_CONEXAO', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.pedir('/api/auth/eu').catch((e) => e)

    expect(erro).toMatchObject({ status: 0, codigo: 'SEM_CONEXAO' })
  })

  it('401 NAO_AUTENTICADO → renova com o cabeçalho do refresh e repete o pedido com o token novo', async () => {
    const { fetch, chamadas } = fetchFalso(naoAutenticado(), json(200, { accessToken: 'token-2' }), json(200, { ok: true }))
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('token-1')

    const resposta = await cliente.pedir('/api/pacientes')

    expect(resposta).toEqual({ ok: true })
    expect(chamadas.map((chamada) => chamada.caminho)).toEqual(['/api/pacientes', '/api/auth/refresh', '/api/pacientes'])
    expect(chamadas[1].opcoes.method).toBe('POST')
    expect(new Headers(chamadas[1].opcoes.headers).get('X-DentAgenda-Refresh')).toBe('1')
    expect(chamadas[2].autorizacao).toBe('Bearer token-2')
  })

  it('pedidos simultâneos com 401 fazem um refresh só', async () => {
    const { fetch, chamadas } = fetchFalso(
      naoAutenticado(),
      naoAutenticado(),
      json(200, { accessToken: 'token-2' }),
      json(200, { n: 1 }),
      json(200, { n: 2 }),
    )
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('token-1')

    await Promise.all([cliente.pedir('/api/a'), cliente.pedir('/api/b')])

    expect(chamadas.filter((chamada) => chamada.caminho === '/api/auth/refresh')).toHaveLength(1)
  })

  it('refresh recusado → apaga o token, avisa o fim da sessão e lança o 401', async () => {
    const aoEncerrarSessao = vi.fn()
    const { fetch } = fetchFalso(naoAutenticado(), naoAutenticado())
    const cliente = criarClienteHttp({ fetch, aoEncerrarSessao })
    cliente.definirToken('token-1')

    const erro = await cliente.pedir('/api/pacientes').catch((e) => e)

    expect(erro).toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO' })
    expect(aoEncerrarSessao).toHaveBeenCalledTimes(1)
    expect(cliente.temToken()).toBe(false)
  })

  it('401 com outro código (senha errada) não tenta renovar', async () => {
    const { fetch, chamadas } = fetchFalso(
      json(401, { erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'CPF ou senha incorretos.' } }),
    )
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.pedir('/api/auth/cliente/login', { metodo: 'POST', corpo: {} }).catch((e) => e)

    expect(erro.codigo).toBe('CREDENCIAIS_INVALIDAS')
    expect(chamadas).toHaveLength(1)
  })

  it('pedido repetido que volta 401 não renova de novo', async () => {
    const { fetch, chamadas } = fetchFalso(naoAutenticado(), json(200, { accessToken: 'token-2' }), naoAutenticado())
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('token-1')

    const erro = await cliente.pedir('/api/pacientes').catch((e) => e)

    expect(erro.codigo).toBe('NAO_AUTENTICADO')
    expect(chamadas).toHaveLength(3)
  })

  it('renovarSessao: true e guarda o token quando o cookie vale; false quando não', async () => {
    const valido = criarClienteHttp(fetchFalso(json(200, { accessToken: 'token-9' })))
    const invalido = criarClienteHttp(fetchFalso(naoAutenticado()))

    expect(await valido.renovarSessao()).toBe(true)
    expect(valido.temToken()).toBe(true)
    expect(await invalido.renovarSessao()).toBe(false)
    expect(invalido.temToken()).toBe(false)
  })
})
