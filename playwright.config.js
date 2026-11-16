import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/break-it',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/break-it',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    channel: process.env.BREAK_IT_BROWSER_CHANNEL || undefined,
    headless: true,
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
  },
  webServer: {
    // Executar o Vite diretamente evita processos npm intermediários no encerramento do Windows.
    command: 'node node_modules/vite/bin/vite.js --config vite.break-it.config.js --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
  },
})
