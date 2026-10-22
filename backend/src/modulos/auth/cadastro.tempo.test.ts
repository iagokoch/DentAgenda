import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { criarContextoDeTeste } from '../../../testes/contexto-de-teste.ts';
import { criarPaciente, gerarCpfValido } from '../../../testes/fabricas.ts';
import { criarApp } from '../../app.ts';

const contexto = criarContextoDeTeste();
const app = criarApp(contexto);
afterAll(() => contexto.prisma.$disconnect());

const confirmar = (cpf: string) =>
  request(app)
    .post('/api/auth/cliente/cadastro/confirmar')
    .send({ cpf, telefone: '47999990000', codigo: '000000', nome: 'Marcos Oliveira', senha: 'senha-do-cadastro-123' });

// D19/D25.5: quem não tem código válido não distingue "CPF com conta" de "sem conta" pelo tempo da resposta.
describe('confirmação de cadastro e o custo do bcrypt', () => {
  it('CPF que já tem login paga o hash antes de recusar, como o CPF sem conta', async () => {
    const comLogin = await criarPaciente(contexto, {}, { comLogin: true });
    const espiaDoHash = vi.spyOn(bcrypt, 'hash');

    const respostaComConta = await confirmar(comLogin.cpf);
    const hashesComConta = espiaDoHash.mock.calls.length;
    espiaDoHash.mockClear();
    const respostaSemConta = await confirmar(gerarCpfValido());
    const hashesSemConta = espiaDoHash.mock.calls.length;
    espiaDoHash.mockRestore();

    expect(respostaComConta.status).toBe(400);
    expect(respostaSemConta.status).toBe(400);
    expect(hashesComConta).toBe(1);
    expect(hashesSemConta).toBe(1);
  });
});
