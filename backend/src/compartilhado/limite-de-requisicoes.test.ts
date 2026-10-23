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

describe('limite por IP atrás de proxy e refresh (D40)', () => {
  const login = (app: ReturnType<typeof criarApp>, ip?: string) => {
    const pedido = request(app).post('/api/auth/cliente/login');
    return (ip ? pedido.set('X-Forwarded-For', ip) : pedido).send({});
  };
  const comProxy = (proxyConfiavel: false | number | string[]) => criarApp({ ...contexto, config: { ...contexto.config, proxyConfiavel } }, { limiteDeAuth: 2 });

  it('refresh não conta para o limite: carregar páginas não esgota o login', async () => {
    const app = criarApp(contexto, { limiteDeAuth: 2 });

    for (let pagina = 0; pagina < 5; pagina++) expect((await request(app).post('/api/auth/refresh').set('X-DentAgenda-Refresh', '1')).status).toBe(401);

    expect((await login(app)).status).toBe(400);
  });

  it('com PROXY_CONFIAVEL=1, cada IP do X-Forwarded-For tem o próprio limite', async () => {
    const app = comProxy(1);

    const doMesmoIp = [await login(app, '203.0.113.1'), await login(app, '203.0.113.1'), await login(app, '203.0.113.1')];
    const deOutroIp = await login(app, '203.0.113.2');

    expect(doMesmoIp.map((resposta) => resposta.status)).toEqual([400, 400, 429]);
    expect(deOutroIp.status).toBe(400);
  });

  it('sem proxy configurado, X-Forwarded-For forjado não escapa do limite', async () => {
    const app = comProxy(false);

    const respostas = [await login(app, '203.0.113.1'), await login(app, '203.0.113.2'), await login(app, '203.0.113.3')];

    expect(respostas.map((resposta) => resposta.status)).toEqual([400, 400, 429]);
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
