import { afterAll, beforeAll } from 'vitest';
import { criarPrisma } from '../src/compartilhado/banco.ts';
import { limparBanco } from './banco-de-teste.ts';

const prisma = criarPrisma(process.env.DATABASE_URL ?? '');

beforeAll(() => limparBanco(prisma));
afterAll(() => prisma.$disconnect());
