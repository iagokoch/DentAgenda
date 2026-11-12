import { randomBytes } from 'node:crypto'
import { expect } from '@playwright/test'

export const usuarios = {
  paciente: { id: 'qa-paciente', tipo: 'CLIENTE', nome: 'Paciente QA' },
  recepcao: { id: 'qa-recepcao', tipo: 'FUNCIONARIO', nome: 'Recepção QA', categoria: 'RECEPCIONISTA', isAdmin: false },
  dentista: { id: 'qa-dentista', tipo: 'FUNCIONARIO', nome: 'Dentista QA', categoria: 'DENTISTA', isAdmin: false },
  admin: { id: 'qa-admin', tipo: 'FUNCIONARIO', nome: 'Admin QA', categoria: 'RECEPCIONISTA', isAdmin: true },
}

export const gerarSenha = () => randomBytes(18).toString('base64url')
export const ok = (corpo, status = 200) => ({ corpo, status })
export const erro = (codigo, status = 400) => ({ status, corpo: { erro: { codigo, mensagem: 'Falha sintética de QA.' } } })
const listaVazia = { itens: [], total: 0, pagina: 1, porPagina: 100 }

// Toda chamada de API termina aqui. Nenhuma resposta sintética recorre ao proxy Vite.
export async function prepararApi(context, { usuario = null, respostas = {} } = {}) {
  let atual = usuario
  const inesperadas = []
  const pedidos = []
  const token = randomBytes(24).toString('base64url')
  const basicas = {
    'POST /api/auth/refresh': () => atual ? ok({ accessToken: token }) : erro('SESSAO_INVALIDA', 401),
    'GET /api/auth/eu': () => ok({ usuario: atual }),
    'GET /api/consultas': ok(listaVazia),
    'GET /api/consultas/pendentes': ok(listaVazia),
    'GET /api/pacientes': ok(listaVazia),
    'GET /api/funcionarios': ok([]),
    'GET /api/procedimentos': ok([]),
  }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4178') {
      inesperadas.push(`Destino externo bloqueado: ${url.origin}`)
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const chave = `${request.method()} ${url.pathname}`
    pedidos.push(chave)
    const resposta = respostas[chave] ?? basicas[chave]
    if (!resposta) {
      inesperadas.push(chave)
      return route.fulfill({ status: 599, json: { erro: { codigo: 'SEM_FIXTURE', mensagem: 'Fixture ausente.' } } })
    }
    const resultado = typeof resposta === 'function' ? await resposta(request) : resposta
    return resultado.status === 204
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: resultado.status, json: resultado.corpo })
  })
  return {
    pedidos,
    sessaoDe(papel) { atual = usuarios[papel]; return ok({ accessToken: token, usuario: atual }) },
    conferir() { expect(inesperadas, 'Toda chamada deve ter fixture e ficar no servidor local').toEqual([]) },
  }
}
