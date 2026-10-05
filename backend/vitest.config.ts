import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Os testes rodam contra o banco dentagenda_test (D23), nunca contra o de desenvolvimento.
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.DATABASE_URL_TESTE) process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Um banco só para todos os arquivos: em série, limpo antes de cada arquivo (D23).
    fileParallelism: false,
    globalSetup: ['testes/configuracao-global.ts'],
    setupFiles: ['testes/preparar-arquivo.ts'],
  },
});
