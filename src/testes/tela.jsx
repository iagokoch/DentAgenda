// Arquivo só de teste: o aviso de fast refresh (componentes e constantes no mesmo módulo) não se aplica.
/* oxlint-disable react/only-export-components */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { RelogioContexto } from '../relogio.js'
import { SessaoContexto } from '../sessao/sessao-contexto.js'

// Apoio aos testes de tela (D36). Quem importa este arquivo precisa de `// @vitest-environment jsdom` no topo.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Segunda, 2026-10-05, 09:00 em São Paulo: o mesmo instante inicial dos testes do backend.
export const AGORA_DOS_TESTES = new Date('2026-10-05T12:00:00Z')

export const ok = (corpo, status = 200) => ({ status, corpo })
export const falha = (status, codigo, mensagem = `Erro ${codigo}.`) => ({ status, corpo: { erro: { codigo, mensagem } } })

export const USUARIOS = {
  paciente: { id: 'paciente-1', tipo: 'CLIENTE', nome: 'Marcos Oliveira' },
  recepcao: { id: 'recepcao-1', tipo: 'FUNCIONARIO', nome: 'Carla Souza', categoria: 'RECEPCIONISTA', isAdmin: false },
  dentista: { id: 'dentista-1', tipo: 'FUNCIONARIO', nome: 'Ana Costa', categoria: 'DENTISTA', isAdmin: false },
  admin: { id: 'admin-1', tipo: 'FUNCIONARIO', nome: 'Rita Lima', categoria: 'RECEPCIONISTA', isAdmin: true },
}

// Troca o fetch por respostas por "MÉTODO /caminho". A chave com query vale só para aquela query; sem query, vale para
// qualquer query do caminho. Uma resposta pode ser função do pedido ({ metodo, url, corpo }), para variar entre
// chamadas. Pedido sem resposta vira erro na tela, com a chave, para o teste falhar dizendo o que faltou.
export function simularApi(respostas) {
  const pedidos = []
  vi.stubGlobal('fetch', vi.fn(async (caminho, opcoes = {}) => {
    const metodo = opcoes.method ?? 'GET'
    const url = new URL(caminho, 'http://localhost')
    const pedido = { metodo, url, caminho, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined }
    pedidos.push(pedido)
    const resposta = respostas[`${metodo} ${caminho}`] ?? respostas[`${metodo} ${url.pathname}`]
    const { status, corpo } = typeof resposta === 'function' ? resposta(pedido) : (resposta ?? falha(599, 'SEM_SIMULACAO', `Sem resposta simulada para ${metodo} ${caminho}`))
    return corpo === null || status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  }))
  return pedidos
}

function OutraTela() {
  const { pathname, search } = useLocation()
  return <p>Navegou para {pathname + search}</p>
}

// Renderiza a tela com a sessão em `estado` (logado com `usuario`, 'anonimo' ou 'carregando'), na rota `caminho`, com
// o relógio parado em `agora` (#7). Navegar para outra rota mostra "Navegou para <rota>".
export function renderizarTela(elemento, { usuario = USUARIOS.recepcao, estado = 'logado', caminho = '/', rota = caminho.split('?')[0], sair = vi.fn(), agora = AGORA_DOS_TESTES } = {}) {
  return render(
    <RelogioContexto value={{ agora: () => new Date(agora) }}>
      <SessaoContexto value={{ estado, usuario: estado === 'logado' ? usuario : null, entrar: vi.fn(), sair }}>
        <MemoryRouter initialEntries={[caminho]}>
          <Routes>
            <Route path={rota} element={elemento} />
            <Route path="*" element={<OutraTela />} />
          </Routes>
        </MemoryRouter>
      </SessaoContexto>
    </RelogioContexto>,
  )
}
