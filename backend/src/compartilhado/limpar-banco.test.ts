import { afterAll, describe, expect, it } from 'vitest';
import { limparBanco } from '../../testes/banco-de-teste.ts';
import { criarPrisma } from './banco.ts';

const urlDoBancoDeTeste = process.env.DATABASE_URL ?? '';
const urlDoBancoDeDesenvolvimento = urlDoBancoDeTeste.replace(/_test(?=\?|$)/, '');
const prismaDeDesenvolvimento = criarPrisma(urlDoBancoDeDesenvolvimento);
afterAll(() => prismaDeDesenvolvimento.$disconnect());

// AUD-023: o TRUNCATE de todas as tabelas só pode rodar em banco cujo nome termina em _test.
describe('limparBanco', () => {
  it('recusa limpar um banco que não é de teste', async () => {
    expect(urlDoBancoDeDesenvolvimento).not.toBe(urlDoBancoDeTeste);

    await expect(limparBanco(prismaDeDesenvolvimento)).rejects.toThrow(/_test/);
  });
});
