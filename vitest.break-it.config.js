import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/qa/break-it.property.test.js'], env: { TZ: 'America/Sao_Paulo' } },
})
