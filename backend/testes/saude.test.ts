import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app.ts';
import type { Contexto } from '../src/compartilhado/contexto.ts';
import { criarLogger } from '../src/compartilhado/logger.ts';
import { criarSaude } from '../src/compartilhado/saude.ts';

function preparar(consulta = vi.fn().mockResolvedValue([{ ok: 1 }])) {
  const contexto = {
    config: { nodeEnv: 'test', proxyConfiavel: false },
    logger: criarLogger(undefined, 'silent'),
    prisma: { $queryRaw: consulta },
  } as unknown as Contexto;
  return { app: criarApp(contexto), consulta };
}

describe('saúde operacional sem conexão com banco real', () => {
  it('limita a espera e compartilha a consulta travada entre sondagens', async () => {
    vi.useFakeTimers();
    try {
      const consulta = vi.fn(() => new Promise(() => {}));
      const saude = criarSaude(consulta, 100);
      const sondagens = Promise.all([saude.estaPronta(), saude.estaPronta()]);
      await vi.advanceTimersByTimeAsync(100);
      expect(await sondagens).toEqual([false, false]);
      const novamente = saude.estaPronta();
      await vi.advanceTimersByTimeAsync(100);
      expect(await novamente).toBe(false);
      expect(consulta).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('não fica pronta se o encerramento começar durante a consulta', async () => {
    const resposta = Promise.withResolvers<void>();
    const saude = criarSaude(() => resposta.promise);
    const sondagem = saude.estaPronta();
    saude.iniciarEncerramento();
    resposta.resolve();
    expect(await sondagem).toBe(false);
    expect(await saude.estaPronta()).toBe(false);
  });

  it('liveness responde sem consultar banco', async () => {
    const { app, consulta } = preparar();
    const resposta = await request(app).get('/api/saude/viva');
    expect(resposta.status).toBe(200);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('readiness consulta o banco', async () => {
    const { app, consulta } = preparar();
    expect((await request(app).get('/api/saude/pronta')).status).toBe(200);
    expect(consulta).toHaveBeenCalledOnce();
  });

  it('indisponibilidade do banco responde 503 sem detalhes internos', async () => {
    const { app } = preparar(vi.fn().mockRejectedValue(new Error('detalhe interno')));
    const resposta = await request(app).get('/api/saude/pronta');
    expect(resposta.status).toBe(503);
    expect(JSON.stringify(resposta.body)).not.toContain('detalhe interno');
    expect((await request(app).get('/api/saude/viva')).status).toBe(200);
  });
});
