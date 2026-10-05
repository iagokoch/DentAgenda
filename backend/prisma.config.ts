import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho. loadEnvFile não sobrescreve o que já está no ambiente,
// então o DATABASE_URL de teste definido pelo Vitest prevalece sobre o do arquivo.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
