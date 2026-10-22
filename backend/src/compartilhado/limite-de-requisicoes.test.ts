import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContextoDeTeste } from '../../testes/contexto-de-teste.ts';
import { criarApp } from '../app.ts';

const contexto = criarContextoDeTeste();
afterAll(() => contexto.prisma.$disconnect());

// AUD-006: login e recuperação gastam bcrypt; o limite por conta (D19) não impede um IP de esgotar a CPU.
describe('limite de requisições por IP em /api/auth', () => {
  it('acima do limite → 429 LIMITE_DE_REQUISICOES; rotas fora de /api/auth não são limitadas', async () => {
    const app = criarApp(contexto, { limiteDeAuth: 3 });

    const respostas = [];
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      respostas.push(await request(app).post('/api/auth/cliente/login').send({}));
    }
    const foraDoAuth = await request(app).get('/api/nada');

    expect(respostas.slice(0, 3).map((resposta) => resposta.status)).toEqual([400, 400, 400]);
    expect(respostas[3]?.status).toBe(429);
    expect(respostas[3]?.body.erro.codigo).toBe('LIMITE_DE_REQUISICOES');
    expect(foraDoAuth.status).toBe(404);
  });
});

describe('cabeçalhos de segurança', () => {
  it('helmet ativo e sem x-powered-by', async () => {
    const resposta = await request(criarApp(contexto)).get('/api/nada');

    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['x-frame-options']).toBeDefined();
    expect(resposta.headers['x-powered-by']).toBeUndefined();
  });
});
