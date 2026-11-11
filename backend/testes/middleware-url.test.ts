import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { criarLogger } from '../src/compartilhado/logger.ts';
import { criarMiddlewareDeErro } from '../src/compartilhado/middleware-de-erro.ts';

function preparar(erro = new Error('detalhe interno')) {
  const logger = criarLogger(undefined, 'silent');
  const registrarErro = vi.spyOn(logger, 'error');
  const app = express();
  app.get('/recurso/:id', (req, res) => res.json({ id: req.params.id }));
  app.get('/erro', () => { throw erro; });
  app.use(criarMiddlewareDeErro(logger));
  return { app, registrarErro };
}

describe('codificação dos parâmetros da URL', () => {
  it.each(['%zz', '%E0%A4%A'])('responde 400 sem log de falha interna para %s', async (parametro) => {
    const { app, registrarErro } = preparar();
    const resposta = await request(app).get(`/recurso/${parametro}`);

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: { codigo: 'ENTRADA_INVALIDA', mensagem: 'Dados inválidos.', campos: [] } });
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it.each([
    ['normal', 'normal'],
    ['caf%C3%A9', 'café'],
  ])('preserva o parâmetro válido %s', async (parametro, id) => {
    const { app, registrarErro } = preparar();
    const resposta = await request(app).get(`/recurso/${parametro}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ id });
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it.each([
    ['Error inesperado', new Error('detalhe interno')],
    ['URIError interno sem status', new URIError('detalhe interno')],
    ['Error com status 400', Object.assign(new Error('detalhe interno'), { status: 400 })],
    ['URIError com status 500', Object.assign(new URIError('detalhe interno'), { status: 500 })],
  ])('mantém 500 e log para %s sem expor detalhes', async (_descricao, erro) => {
    const { app, registrarErro } = preparar(erro);
    const resposta = await request(app).get('/erro');

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado. Tente novamente.' } });
    expect(registrarErro).toHaveBeenCalledExactlyOnceWith({ err: erro }, 'erro inesperado');
  });
});
