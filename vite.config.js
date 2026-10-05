import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // D19/D30: front e API no mesmo site, senão o cookie SameSite=Strict não chega ao refresh.
    // 3000 = PORTA de backend/.env.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    // Sem isto o Vitest da raiz também pegaria os testes de backend/.
    include: ['src/**/*.test.js'],
  },
})
