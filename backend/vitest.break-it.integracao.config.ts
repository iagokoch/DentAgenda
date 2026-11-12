import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/qa/break-it.integration.test.ts'],
    fileParallelism: false,
    globalSetup: ['testes/configuracao-global.ts'],
    setupFiles: ['testes/preparar-arquivo.ts'],
  },
});
