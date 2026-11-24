import { defineConfig } from 'vitest/config';

// Auditoria pura: nenhuma leitura de ambiente, migration ou conexão PostgreSQL.
export default defineConfig({
  test: {
    include: [
      'src/qa/break-it.property.test.ts',
      'src/modulos/disponibilidade/horarios.test.ts',
      'src/compartilhado/cpf.test.ts',
      'src/compartilhado/datas.test.ts',
      'src/compartilhado/validacao.test.ts',
    ],
  },
});
