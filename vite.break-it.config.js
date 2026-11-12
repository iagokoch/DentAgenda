import { defineConfig } from 'vite'
import base from './vite.config.js'

export default defineConfig({
  ...base,
  // A auditoria usa somente fixtures e não precisa carregar configuração local.
  envDir: false,
  server: { ...base.server, proxy: {} },
  plugins: [
    ...base.plugins,
    {
      name: 'break-it-bloquear-api',
      configureServer(servidor) {
        // Cobre inclusive pedidos tardios durante o encerramento do contexto Playwright.
        servidor.middlewares.use((pedido, resposta, proximo) => {
          const caminho = pedido.url?.split('?')[0]
          if (caminho !== '/api' && !caminho?.startsWith('/api/')) return proximo()
          resposta.statusCode = 599
          resposta.setHeader('Content-Type', 'application/json')
          resposta.end(JSON.stringify({ erro: { codigo: 'API_BLOQUEADA_QA', mensagem: 'Use uma fixture da auditoria.' } }))
        })
      },
    },
  ],
})
