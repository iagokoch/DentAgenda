import { defineConfig } from 'vitest/config';

// A guarda precisa ser testada sem carregar ambiente, aplicar migrations ou conectar ao banco.
export default defineConfig({
  test: { include: ['testes/**/*.test.ts'] },
});
