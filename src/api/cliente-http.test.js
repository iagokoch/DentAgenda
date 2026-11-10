import { describe, expect, it, vi } from 'vitest'
import { criarClienteHttp as construirClienteHttp, ErroDaApi } from './cliente-http.js'

const criarClienteHttp = (opcoes) => {
  let fila = Promise.resolve()
  return construirClienteHttp({
    coordenacao: { entreAbas: true, executar: (operacao) => {
      const pedido = fila.then(operacao)
      fila = pedido.catch(() => {})
      return pedido
    } }, ...opcoes,
  })
}

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
  it('refresh atrasado não reinstala token depois de invalidar a geração', async () => {
    const resposta = Promise.withResolvers()
    const cliente = criarClienteHttp(fetchFalso(resposta.promise))
    cliente.definirToken('antigo')
    const renovacao = cliente.renovarSessao()
    cliente.definirToken(null)
    resposta.resolve(json(200, { accessToken: 'atrasado' }))
    expect(await renovacao).toBe(false)
    expect(cliente.temToken()).toBe(false)
  })

  it('401 de um pedido antigo não renova nem encerra uma sessão nova', async () => {
    const resposta = Promise.withResolvers()
    const { fetch, chamadas } = fetchFalso(resposta.promise)
    const aoEncerrarSessao = vi.fn()
    const cliente = criarClienteHttp({ fetch, aoEncerrarSessao })
    cliente.definirToken('antigo')
    const pedido = cliente.pedir('/api/pacientes').catch((erro) => erro)
    cliente.definirToken('novo')
    resposta.resolve(naoAutenticado())
    expect(await pedido).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
    expect(chamadas).toHaveLength(1)
    expect(aoEncerrarSessao).not.toHaveBeenCalled()
    expect(cliente.temToken()).toBe(true)
  })

  it('saída espera refresh anterior e usa o resultado somente para revogar', async () => {
    const resposta = Promise.withResolvers()
    const { fetch, chamadas } = fetchFalso(resposta.promise, json(200, { accessToken: 'somente-para-revogar' }),
      new Response(null, { status: 204 }), naoAutenticado(), naoAutenticado())
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('antigo')
    const renovacao = cliente.renovarSessao()
    await vi.waitFor(() => expect(chamadas).toHaveLength(1))
    const saida = cliente.encerrarSessao()
    expect(cliente.temToken()).toBe(false)
    expect(chamadas).toHaveLength(1)
    resposta.resolve(json(200, { accessToken: 'rotacionado' }))
    expect(await renovacao).toBe(false)
    expect(await saida).toBe(true)
    expect(chamadas).toContainEqual(expect.objectContaining({ caminho: '/api/auth/logout', autorizacao: 'Bearer somente-para-revogar' }))
    expect(cliente.temToken()).toBe(false)
  })

  it('falha ao sair mantém refresh automático bloqueado e permite retry explícito sem token público', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json(200, { accessToken: 'privado' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('antigo')
    await expect(cliente.encerrarSessao()).rejects.toMatchObject({ codigo: 'SEM_CONEXAO' })
    expect(await cliente.renovarSessao()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await cliente.encerrarSessao()).toBe(true)
    expect(cliente.temToken()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('401 do logout isoladamente não confirma que o cookie atual foi revogado', async () => {
    const { fetch, chamadas } = fetchFalso(json(200, { accessToken: 'privado' }), naoAutenticado())
    const cliente = criarClienteHttp({ fetch })
    cliente.definirToken('antigo')
    await expect(cliente.encerrarSessao()).rejects.toMatchObject({ codigo: 'NAO_AUTENTICADO' })
    expect(chamadas).toHaveLength(2)
    expect(cliente.temToken()).toBe(false)
    expect(await cliente.renovarSessao()).toBe(false)
  })

  it.each(['/api/auth/cliente/login', '/api/auth/cliente/cadastro/confirmar'])
  ('criação de sessão em %s espera a revogação anterior', async (caminho) => {
    const resposta = Promise.withResolvers()
    const { fetch, chamadas } = fetchFalso(resposta.promise, new Response(null, { status: 204 }), json(200, { accessToken: 'novo' }))
    const cliente = criarClienteHttp({ fetch })
    const saida = cliente.encerrarSessao()
    await vi.waitFor(() => expect(chamadas).toHaveLength(1))
    const login = cliente.pedir(caminho, { metodo: 'POST', corpo: {} })
    expect(chamadas).toHaveLength(1)
    resposta.resolve(json(200, { accessToken: 'privado' }))
    await saida
    expect(await login).toEqual({ accessToken: 'novo' })
    expect(chamadas.map((chamada) => chamada.caminho)).toEqual([
      '/api/auth/refresh', '/api/auth/logout', caminho,
    ])
  })

  it('cookie recusado no refresh não é tratado como revogação confirmada', async () => {
    const cliente = criarClienteHttp(fetchFalso(naoAutenticado()))
    await expect(cliente.encerrarSessao()).rejects.toMatchObject({ codigo: 'NAO_AUTENTICADO' })
  })

  it('sem coordenação entre abas mantém resultado conservador mesmo após logout 204', async () => {
    const cliente = criarClienteHttp({
      ...fetchFalso(json(200, { accessToken: 'antigo' }), new Response(null, { status: 204 })),
      coordenacao: { entreAbas: false, executar: (operacao) => operacao() },
    })
    cliente.definirToken('antigo')
    expect(await cliente.encerrarSessao()).toBe(false)
    expect(cliente.temToken()).toBe(false)
  })

  it('duas abas coordenam refresh atrasado e saída usando o cookie atual', async () => {
    let fila = Promise.resolve()
    const coordenacao = { entreAbas: true, executar: (operacao) => {
      const pedido = fila.then(operacao)
      fila = pedido.catch(() => {})
      return pedido
    } }
    const iniciou = Promise.withResolvers()
    const liberar = Promise.withResolvers()
    let cookie = 'original'
    let ativo = 'original'
    let saindo = false
    let primeiraRenovacao = true
    const logout = []
    const fetch = async (caminho, opcoes) => {
      if (caminho === '/api/auth/refresh') {
        if (cookie !== ativo) return naoAutenticado()
        ativo = primeiraRenovacao ? 'sucessor' : 'para-revogar'
        if (primeiraRenovacao) {
          primeiraRenovacao = false
          iniciou.resolve()
          await liberar.promise
        }
        cookie = ativo // Simula Set-Cookie aplicado quando a resposta chega.
        return json(200, { accessToken: ativo })
      }
      const token = opcoes.headers.Authorization?.replace('Bearer ', '')
      logout.push(token)
      if (token !== ativo) return naoAutenticado()
      ativo = null
      cookie = null
      return new Response(null, { status: 204 })
    }
    const abaA = criarClienteHttp({ fetch, coordenacao })
    const abaB = criarClienteHttp({ fetch, coordenacao, restauracaoPermitida: () => !saindo })
    abaA.definirToken('original')
    abaB.definirToken('original')
    const renovacao = abaB.renovarSessao()
    await iniciou.promise
    saindo = true
    const saida = abaA.encerrarSessao()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const tentouAntesDaResposta = logout.length > 0
    liberar.resolve()
    expect(await saida).toBe(true)
    expect(await renovacao).toBe(false)
    expect(tentouAntesDaResposta).toBe(false)
    expect(ativo).toBeNull()
    expect(cookie).toBeNull()
    expect(abaA.temToken()).toBe(false)
    expect(abaB.temToken()).toBe(false)
  })

  it.each(['antes', 'depois'])('login de outra aba %s da saída mantém a ordem e o cookie correspondente', async (ordem) => {
    let fila = Promise.resolve()
    const coordenacao = { entreAbas: true, executar: (operacao) => {
      const pedido = fila.then(operacao)
      fila = pedido.catch(() => {})
      return pedido
    } }
    const iniciou = Promise.withResolvers()
    const liberar = Promise.withResolvers()
    let cookie = 'original'
    const sessoes = new Set(['original'])
    let numero = 0
    const fetch = async (caminho, opcoes) => {
      if (caminho.endsWith('/login')) {
        sessoes.add('login-b'); cookie = 'login-b'
        return json(200, { accessToken: 'login-b' })
      }
      if (caminho.endsWith('/refresh')) {
        if (!sessoes.has(cookie)) return naoAutenticado()
        sessoes.delete(cookie)
        const novo = `refresh-${++numero}`
        sessoes.add(novo)
        if (numero === 1) { iniciou.resolve(); await liberar.promise }
        cookie = novo
        return json(200, { accessToken: novo })
      }
      const token = opcoes.headers.Authorization?.replace('Bearer ', '')
      if (!sessoes.has(token)) return naoAutenticado()
      sessoes.delete(token); cookie = null
      return new Response(null, { status: 204 })
    }
    const abaA = criarClienteHttp({ fetch, coordenacao })
    const abaB = criarClienteHttp({ fetch, coordenacao })
    abaA.definirToken('original')
    const renovacao = abaA.renovarSessao()
    await iniciou.promise
    let login, saida
    if (ordem === 'antes') {
      login = abaB.pedir('/api/auth/cliente/login', { metodo: 'POST' })
      saida = abaA.encerrarSessao()
    } else {
      saida = abaA.encerrarSessao()
      login = abaB.pedir('/api/auth/cliente/login', { metodo: 'POST' })
    }
    liberar.resolve()
    await Promise.all([renovacao, login, saida])
    expect(cookie).toBe(ordem === 'antes' ? null : 'login-b')
    expect([...sessoes]).toEqual(ordem === 'antes' ? [] : ['login-b'])
  })

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

  it('campos extras do erro (ex.: consultas do CONSULTAS_NO_PERIODO) vão em detalhes', async () => {
    const consultas = [{ id: 'c1', dentistaId: 'd1', inicio: '2026-12-24T09:00:00-03:00', paciente: { id: 'p1', nome: 'Marcos' } }]
    const { fetch } = fetchFalso(json(409, { erro: { codigo: 'CONSULTAS_NO_PERIODO', mensagem: 'Há consultas.', consultas } }))
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.pedir('/api/bloqueios', { metodo: 'POST', corpo: {} }).catch((falha) => falha)

    expect(erro).toMatchObject({ status: 409, codigo: 'CONSULTAS_NO_PERIODO', campos: [], detalhes: { consultas } })
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

  it('refresh que falha por rede não encerra a sessão: lança SEM_CONEXAO e mantém o token', async () => {
    const aoEncerrarSessao = vi.fn()
    const fila = [naoAutenticado()]
    const fetch = vi.fn(async () => {
      const proxima = fila.shift()
      if (!proxima) throw new TypeError('Failed to fetch')
      return proxima
    })
    const cliente = criarClienteHttp({ fetch, aoEncerrarSessao })
    cliente.definirToken('token-1')

    const erro = await cliente.pedir('/api/pacientes').catch((e) => e)

    expect(erro).toMatchObject({ status: 0, codigo: 'SEM_CONEXAO' })
    expect(aoEncerrarSessao).not.toHaveBeenCalled()
    expect(cliente.temToken()).toBe(true)
  })

  it('refresh que volta 5xx não encerra a sessão', async () => {
    const aoEncerrarSessao = vi.fn()
    const { fetch } = fetchFalso(naoAutenticado(), new Response('Bad Gateway', { status: 502 }))
    const cliente = criarClienteHttp({ fetch, aoEncerrarSessao })
    cliente.definirToken('token-1')

    const erro = await cliente.pedir('/api/pacientes').catch((e) => e)

    expect(erro).toMatchObject({ status: 502 })
    expect(aoEncerrarSessao).not.toHaveBeenCalled()
    expect(cliente.temToken()).toBe(true)
  })

  it('renovarSessao rejeita quando a rede cai, em vez de dizer que a sessão acabou', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cliente = criarClienteHttp({ fetch })

    const erro = await cliente.renovarSessao().catch((e) => e)

    expect(erro).toMatchObject({ codigo: 'SEM_CONEXAO' })
  })

  it('todo pedido leva um limite de tempo', async () => {
    const { fetch, chamadas } = fetchFalso(json(200, {}))
    const cliente = criarClienteHttp({ fetch })

    await cliente.pedir('/api/auth/eu')

    expect(chamadas[0].opcoes.signal).toBeInstanceOf(AbortSignal)
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
