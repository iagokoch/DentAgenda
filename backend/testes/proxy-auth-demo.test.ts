import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app.ts';
import { carregarConfig } from '../src/config/env.ts';
import type { Contexto } from '../src/compartilhado/contexto.ts';
import { criarLogger } from '../src/compartilhado/logger.ts';
import { EnviadorIndisponivelDemo } from '../src/compartilhado/mensageria.ts';

// Seam HTTP da API: X-Forwarded-For aqui já representa o header normalizado
// pelo último proxy confiável. Não comprova a Cloudflare nem a normalização Nginx.
function montar() {
  const acessoAoBanco = vi.fn(() => { throw new Error('Este teste não pode consultar banco.'); });
  const prisma = new Proxy({}, { get: acessoAoBanco }) as Contexto['prisma'];
  const config = carregarConfig({
    NODE_ENV: 'production', PORTA: '3000',
    DATABASE_URL: 'postgresql://demo:ficticio@banco:5432/dentagenda_demo_remota',
    JWT_SEGREDO: 'a'.repeat(32), CODIGO_HMAC_SEGREDO: 'b'.repeat(32),
    ENVIADOR_MENSAGEM: 'indisponivel-demo',
    DEMONSTRACAO_RESTRITA: 'APENAS_DADOS_FICTICIOS_SEM_MENSAGENS',
    PROXY_CONFIAVEL: '1',
  });
  const app = criarApp({
    config, prisma, logger: criarLogger(undefined, 'silent'),
    relogio: { agora: () => new Date('2026-11-15T12:00:00Z') },
    enviador: new EnviadorIndisponivelDemo(),
  }, { limiteDeAuth: 2 });
  const loginInvalido = (ip: string) => request(app)
    .post('/api/auth/funcionario/login').set('X-Forwarded-For', ip).send({});
  return { app, loginInvalido, acessoAoBanco };
}

describe('cota de autenticação por visitante atrás do proxy da demo', () => {
  it('limita o terceiro pedido de um IPv4 e preserva a cota de outro cliente', async () => {
    const { loginInvalido, acessoAoBanco } = montar();
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const resposta = await loginInvalido('198.51.100.20');
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
    }
    const limitada = await loginInvalido('198.51.100.20');
    expect(limitada.status).toBe(429);
    expect(limitada.body.erro.codigo).toBe('LIMITE_DE_REQUISICOES');
    expect((await loginInvalido('198.51.100.21')).status).toBe(400);
    expect((await loginInvalido('198.51.100.20')).status).toBe(429);
    expect(acessoAoBanco).not.toHaveBeenCalled();
  });

  it('agrupa endereços IPv6 da mesma rede e separa redes distintas', async () => {
    const { loginInvalido, acessoAoBanco } = montar();
    expect((await loginInvalido('2001:db8:100::1')).status).toBe(400);
    expect((await loginInvalido('2001:db8:100::2')).status).toBe(400);
    expect((await loginInvalido('2001:db8:100::3')).status).toBe(429);
    expect((await loginInvalido('2001:db8:200::1')).status).toBe(400);
    expect(acessoAoBanco).not.toHaveBeenCalled();
  });

  it('mantém refresh sem credenciais fora da cota, sem tocar no banco', async () => {
    const { app, loginInvalido, acessoAoBanco } = montar();
    const ip = '198.51.100.22';
    await loginInvalido(ip);
    await loginInvalido(ip);
    expect((await loginInvalido(ip)).status).toBe(429);
    const refresh = await request(app).post('/api/auth/refresh')
      .set('X-Forwarded-For', ip).set('X-DentAgenda-Refresh', '1');
    expect(refresh.status).toBe(401);
    expect(refresh.body.erro.codigo).toBe('NAO_AUTENTICADO');
    expect(acessoAoBanco).not.toHaveBeenCalled();
  });
});
